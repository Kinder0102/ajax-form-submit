import {
  assert,
  formatUrl,
  startsWith,
  isTrue,
  isNotBlank,
  isObject,
  isNotEmptyObject,
  isArray,
  isFunction,
  hasValue,
  delay,
  valueToString,
  toCamelCase,
  toKebabCase,
  addBasePath,
  findObjectValue
} from './js-utils'

import {
  isElement,
  elementIs,
  hasClass,
  addClass,
  querySelector,
  registerMutationObserver,
  registerAttributeChange,
  registerEvent,
  triggerEvent,
  stopDefaultEvent,
  showElements,
  hideElements,
  enableElements,
  disableElements
} from './js-dom-utils'

import MiddlewareFactory from './js-middleware-factory'
import { createHandler } from './js-handler-factory'
import { createDatasetHelper } from './js-dataset-helper'

import { default as SubmitHandler } from './ajax-form-submit-submit-handler'
import { default as SuccessHandler } from './ajax-form-submit-success-handler'

const FORM_CLASS_NAME = 'ajax-form-submit'
const FORM_EVENT = `${FORM_CLASS_NAME}-event`
const FORM_INIT_CLASS_NAME = `${FORM_CLASS_NAME}-initialized`
const FORM_APPLY_CLASS_NAME = `${FORM_CLASS_NAME}-apply`
const FORM_MESSAGE_PAYLOAD_INPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-input`
const FORM_MESSAGE_PAYLOAD_OUTPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-output`
const FORM_MESSAGE_PAYLOAD_PAGE_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-page`
const URL_METHOD = [ 'GET', 'DELETE' ]
const ERROR_TYPE = {
  VALIDATION: 'VALIDATION',
  CONFIRM: 'CONFIRM'
}
const UI_CONTROLS = {
  spinner: `${FORM_CLASS_NAME}-spinner`,
  progress: `${FORM_CLASS_NAME}-progress`,
  messageValidation: `${FORM_CLASS_NAME}-message-validation`,
  messageSuccess: `${FORM_CLASS_NAME}-message-success`,
  messageError: `${FORM_CLASS_NAME}-message-error`,
  messageEmpty: `${FORM_CLASS_NAME}-message-empty`,
}

const DEFAULT_CONFIG = {
  prefix: 'afs',
  basePath: '/',
  delay: 0,
  formEvent: {
    submit: 'submit',
    apply: `${FORM_EVENT}-apply`,
    trigger: `${FORM_EVENT}-trigger`,
    toggle: `${FORM_EVENT}-toggle`,
    pageUpdate: `${FORM_EVENT}-page-update`,
    uploadStart: `${FORM_EVENT}-upload-start`,
    uploadStop: `${FORM_EVENT}-upload-stop`
  },
  pagination: {
    page: 'page',
    size: 'size',
    reserve: '_reserve'
  },
  response: {
    create: ({data, page}) => ({ data: { item: data, page } }),
    checkResponse: res => res?.code === 200,
    getData: res => res?.data?.item,
    getPage: res => res?.data?.page,
    getError: error => error?.code
  },
  getCsrfToken: () => ({
    header: document.querySelector('meta[name="_csrf_header"]')?.getAttribute('content') || 'X-CSRF-TOKEN',
    token: document.querySelector('meta[name="_csrf"]')?.getAttribute('content') || '' 
  })
}

const instanceMap = new Map()
let formSubmitAuto = { all: [] }

class AjaxFormError extends Error {
  static get TYPE() {
    return ERROR_TYPE
  }
  constructor({ message, type, payload }) {
    super(message)
    this.type = type
    this.payload = payload
  }
}

class AjaxFormSubmit {
  static config = {}
  static global = {}

  static get Error() {
    return AjaxFormError
  }

  static create(el) {
    if (!elementIs(el, 'form')
      || !hasClass(el, FORM_CLASS_NAME)
      || hasClass(el, FORM_INIT_CLASS_NAME))
      return

    const instance = AjaxFormSubmit.getInstance(el)
    if (!instance)
      instanceMap.set(el, new AjaxFormSubmit(el))
    return AjaxFormSubmit.getInstance(el)
  }

  static getInstance(el) {
    assert(isElement(el), 1, 'HTMLElement')
    return instanceMap.get(el)
  }

  static middleware = new MiddlewareFactory({
    globalMethods: AjaxFormSubmit.global
  })

  static addSubmitHandler = (type, handler) => {
    SubmitHandler.addSubmitHandler(type, handler)
  }

  static addSuccessHandler = (type, handler) => {
    SuccessHandler.addSuccessHandler(type, handler)
  }

  constructor(root) {
    this._hasForm = elementIs(root, 'form')
    this._submitButtons = []
    this._controls = {}
    this._initSubmitHandler()

    if (!this._hasForm || hasClass(root, FORM_INIT_CLASS_NAME))
      return

    const { prefix } = getConfig('prefix')
    this._form = root
    
    this._datasetHelper = createDatasetHelper(prefix)
    this._initSubmitButtons()
    this._initUIControls()
    
    this.initPaginations()
    this.initAutoSubmit()
    this.initSuccessHandler()

    const { submit, apply, trigger, reset } = getConfig([
      'formEvent.submit', 'formEvent.apply', 'formEvent.trigger', 'formEvent.reset'])
    registerEvent(root, submit, event => this.submitSync({ event }))
    registerEvent(root, apply, this._handleApplied.bind(this))
    registerEvent(root, trigger, this._handleTriggered.bind(this))
    registerEvent(root, 'reset', this._handleReset.bind(this))
    registerAttributeChange(root, this._datasetHelper.keyToAttrName('success'), () => {
      delete this.successHandler
      this.initSuccessHandler()
    })
    addClass(root, FORM_INIT_CLASS_NAME)
    instanceMap.set(this._form, this)
  }

  _initSubmitHandler() {
    const { prefix, basePath, create } = getConfig(['prefix', 'basePath', 'response.create'])
    this.submitHandler = new SubmitHandler({
      prefix, basePath,
      createResponse: create
    })
  }

  _initSubmitButtons() {
    const attrName = this._datasetHelper.keyToAttrName('button')
    const selector = `button[type="submit"], input[type="image"], [${attrName}]`
    const buttons = querySelector(selector, this._form)
      .filter(button => !isNotBlank(button.getAttribute('form')))
    this.addSubmitButtons(buttons)
  }

  _initUIControls() {
    for (const [name, className] of Object.entries(UI_CONTROLS)) {
      this._controls[name] = [
        ...querySelector(this._getParameters(toKebabCase(name))),
        ...querySelector(`.${className}`, this._form)
      ]
    }
  }

  initPaginations(selectors = []) {
    const { pageUpdate, pagination } = getConfig(['formEvent.pageUpdate', 'pagination'])
    const elems = [
      ...querySelector(this._getParameters('pagination')),
      ...querySelector(selectors)
    ]

    if (elems.length === 0)
      return

    const onPaging = input => {
      this._pagination.currentPage = {
        page: input[pagination.page],
        size: input[pagination.size],
      }
      this._pagination.reservePage = { ...this._pagination.currentPage }
      this.submitSync()
    }
    const updatePage = page => {
      if (isObject(page))
        triggerEvent(elems, pageUpdate, { page, onPaging })
    }

    this._pagination = { updatePage }
    return this
  }

  initAutoSubmit(prop) {
    const parameter = this._getParameters('auto', { auto: prop })[0]
    if (!isNotBlank(parameter))
      return

    let needAuto = false
    let payload = {}
    const { type, value, group } = createHandler(parameter)
    const { exist, value: selectType } = startsWith(type.concat(value)[0], '!')
    const groupName = group?.[0]
    
    switch(selectType) {
      case 'querystring':
        needAuto = isNotBlank(location.search) ^ exist
        // if (!exist) {
        //   new URLSearchParams(location.search)
        //     .forEach((value, key) => { payload[key] = value })
        // }
        break
      default:
        needAuto = true
    }

    if (!exist) {
      new URLSearchParams(location.search)
        .forEach((value, key) => { payload[key] = value })
    }

    if (needAuto) {
      if (groupName) {
        formSubmitAuto[groupName] = { form: this, payload }
      } else {
        formSubmitAuto.all.push({ form: this, payload })
      }
    }
    return this
  }

  initSuccessHandler(prop) {
    let settings = { ...prop }
    //TODO from input value

    if (this._hasForm)
      this._datasetHelper.getKeys(this._form, 'success')
        .forEach(({ key, name }) => settings[name] = this._getParameters(key))

    const {
      prefix, basePath, apply: applyEventName, trigger: triggerEventName
    } = getConfig(['prefix', 'basePath', 'formEvent.apply', 'formEvent.trigger'])

    this.successHandler = new SuccessHandler(settings,
      { prefix, basePath, applyEventName, triggerEventName })
    return this
  }

  addSubmitButtons(selectors) {
    querySelector(selectors).forEach(elem => {
      const keepPage = hasValue(this._datasetHelper.getValue(elem, 'button'))
      if (elementIs(elem, ['a', 'button'])) {
        registerEvent(elem, 'click', event => this.submitSync({ keepPage }))
        this._submitButtons.push(elem)
      } else {
        registerEvent(elem, 'change', event => this.submitSync({ keepPage }))
      }
    })
    return this
  }

  addUIControls(opt) {
    assert(isObject(opt), 1, 'Object')
    for (const [type, value] of Object.entries(opt)) {
      querySelector(value).forEach(elem => this._controls[type].push(elem))
    }
    return this
  }

  submit(opt = {}) {
    const options = isObject(opt) ? opt : {}
    stopDefaultEvent(options.event)
    const formDataObj = isArray(options.data) ? options.data
      : formDataToObject(this._generateFormData(options))

    return this._handleBefore(formDataObj, options)
      .then(ignored => this._handleValidation(formDataObj, options))
      .then(ignored => this._handleRequest(formDataObj, options))
      .then(data => this._handleResponse(data, options))
      .then(data => this._handleAfter(data, options))
      .catch(error => {
        switch (error?.message) {
          case ERROR_TYPE.VALIDATION:
            showElements(this._controls.messageValidation)
            break;
          case ERROR_TYPE.CONFIRM:
            break;
          default:
            this._handleError(error)
            throw error
        }
      })
  }

  submitSync(opt) {
    this.submit(opt).catch(ignored => {})
  }

  _handleBefore(data, opt = {}) {
    const props = this._getParameters('middleware-before', opt)
    const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
    hideElements(this._controls)
    return middleware(data).then(ignored => this.successHandler?.before?.(this._form))
  }

  _handleValidation(data, opt = {}) {
    const props = this._getParameters('middleware-validation', opt)
    const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
    const fields = new Set()

    if (this._hasForm) {
      !checkFormValidation(this._form) && fields.add('form')
      checkHiddenInputValidation(this._form, data)
        .forEach(fields.add, fields)

      const attrKey = 'required-group'
      const attrName = this._datasetHelper.keyToAttrName(attrKey)
      let requiredGroups = {}
      findFormElem(this._form, `[${attrName}]`).forEach(elem => {
        const groupName = this._datasetHelper.getValue(elem, attrKey)
        requiredGroups[groupName] ||= []
        requiredGroups[groupName].push(elem)
      })
      
      for (const [name, group] of Object.entries(requiredGroups)) {
        const groupValid = group.some(elem => {
          const elemName = elem.getAttribute('name')
          let isValid = hasValue(data[elemName]) || hasValue(elem.value)
          isValid ||= querySelector(`[name="${elemName}"]`, this._form)
            .some(input => hasValue(input.value))
          return isValid
        })
        if (!groupValid)
          fields.add(name)
      }
    }

    return middleware(data).then(data => {
      const additional = isArray(data) ? data : [ data ]
      additional.filter(str => isNotBlank(str)).forEach(fields.add, fields)

      if (fields.size > 0) {
        showElements(this._controls.messageValidation)
        this._pagination?.updatePage?.({})
        throw new AjaxFormError({
          message: ERROR_TYPE.VALIDATION,
          type: ERROR_TYPE.VALIDATION,
          payload: fields
        })
      }
    })
  }

  _handleRequest(input, opt = {}) {
    const props = this._getParameters('middleware-request', opt)
    const type = this._getParameters('type', opt)[0]
    const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
    const requestParameter = this._generateRequestParameter(opt)

    disableElements(this._submitButtons)
    showElements(this._controls.spinner)
    this.successHandler?.request?.(this._form, input)

    return delay(getConfig('delay').delay)
      .then(ignored => middleware(input, this._form))
      .then(result => {
        input = hasValue(result) ? result : input
        console.log(input)
        if (isNotBlank(type)) {
          return this.submitHandler.run(type, this._form, input, requestParameter, opt)
        } else {
          return this._submitAjax(input, requestParameter, opt)
        }
      })
      .then(response => ({ input, response }))
  }

  _handleResponse({ input, response }, opt = {}) {
    const props = this._getParameters('middleware-response', opt)
    const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
    const {
      uploadStop, getData, getPage
    } = getConfig(['response.getData', 'response.getPage', 'formEvent.uploadStop'])
    
    return middleware(response, input).then(result => {
      response = hasValue(result) ? result : response
      const data = getData(response)
      const page = getPage(response)
      const {
        inputMessage, outputMessage, pageMessage
      } = classifyMessageControl(this._controls.messageSuccess)

      hideElements(this._controls)

      inputMessage.forEach(elem => this.successHandler?.data.domHelper.setValueToElement(elem, input))
      outputMessage.forEach(elem => this.successHandler?.data.domHelper.setValueToElement(elem, data))
      pageMessage.forEach(elem => this.successHandler?.data.domHelper.setValueToElement(elem, page))
      this._pagination?.updatePage?.(page)
      triggerEvent(this._controls.progress, uploadStop)
      return { input, response }
    })
  }

  _handleAfter({ input, response }, opt = {}) {
    const { getData } = getConfig('response.getData')
    showElements(this._controls.messageSuccess)
    enableElements(this._submitButtons)
    this._clearInputs()

    const success = this.successHandler?.after?.(this._form, input, getData(response))
    if (success?.display === false) {
      showElements(this._controls.messageEmpty)
      // hideElements(this._controls.messageSuccess)
    }
    const props = this._getParameters('middleware-after', opt)
    const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
    return middleware(response, input).then(ignored => (response))
  }

  _handleError(error, opt = {}) {
    console.error(error)
    const { uploadStop, getError } = getConfig(['response.getError', 'formEvent.uploadStop'])
    enableElements(this._submitButtons)
    hideElements(this._controls)
    triggerEvent(this._controls.progress, uploadStop)

    if (ignoreLifecycle(this._form, this._datasetHelper, 'error'))
      return

    error.message = getError(error)
    const messageError = this._controls.messageError
    if (isArray(messageError) && messageError.length > 0) {
      const props = this._getParameters('middleware-error', opt)
      const middleware = AjaxFormSubmit.middleware.createMiddleware(props)
      middleware(error).then(result => {
        if (!result) {
          messageError.forEach(elem => this.successHandler?.data.domHelper.setValueToElement(elem, error))
          showElements(messageError)
        }
      })
    } else {
      AjaxFormSubmit.middleware.defaultMiddlewares.error(error)
    }
  }

  _handleProgress(event = {}) {
    const { lengthComputable, loaded, total } = event
    const { uploadStart } = getConfig('formEvent.uploadStart')
    if (!lengthComputable)
      return

    const percent = parseInt(loaded / total * 90)
    triggerEvent(this._controls.progress, uploadStart, [percent])
  }

  _handleApplied(event) {
    stopDefaultEvent(event)
    const attrName = this._datasetHelper.keyToAttrName('applied')
    const payload = {
      input: event?.detail?.input,
      output:  event?.detail?.output,
    }
    
    querySelector(`.${FORM_APPLY_CLASS_NAME}`, this._form)
      .forEach(elem => elem.remove())

    for (const [type, applyData] of Object.entries(payload)) {
      if (!hasValue(applyData)) 
        continue

      querySelector(`[${attrName}="${FORM_APPLY_CLASS_NAME}-${type}"]`, this._form)
        .forEach(elem => elem.value = valueToString(applyData))

      if (!isObject(applyData)) 
        continue

      for (const [key, values] of Object.entries(applyData)) {
        const allAttr = `[${attrName}="${key}"]`
        const typeAttr = `[${attrName}-${type}="${key}"]`
        const targets = querySelector(`${allAttr},${typeAttr}`, this._form)

        if (!isArray(values)) {
          targets.forEach(elem => elem.value = valueToString(values))
        } else {
          targets.forEach(elem => {
            elem.removeAttribute('value')
            values.forEach(value => {
              const newInput = document.createElement('input')
              newInput.setAttribute('type', 'hidden')
              newInput.setAttribute('name', elem.name)
              addClass(newInput, FORM_APPLY_CLASS_NAME)
              newInput.value = valueToString(value)
              this._form.append(newInput)
            })
          })
        }
      }
    }
  }

  _handleTriggered(event) {
    stopDefaultEvent(event)
    this._handleApplied(event)
    this.submitSync()
  }

  _handleReset(event) {
    hideElements(this._controls)
    this.successHandler?.before?.(this._form)
    this._pagination?.updatePage?.({})
    this._form?.reset()
    this._clearInputs()
  }

  _submitAjax(formDataObj, requestParameter, opt = {}) {
    const { basePath, checkResponse } = getConfig(['basePath', 'response.checkResponse'])
    const { formData, hasFile } = objectToFormData(formDataObj)
    const { method, isUrlMethod, url, enctype, csrf } = requestParameter
    const urlParam = isUrlMethod ? `?${new URLSearchParams(formData).toString()}` : ''

    let contentType = false
    let processData = false
    let data = null
    if (hasFile || enctype.includes('multipart')) {
      data = formData
    } else if (enctype.includes('json')) {
      contentType = 'application/json;charset=utf-8'
      data = JSON.stringify(formDataObj)
    } else if (!isUrlMethod) {
      contentType = 'application/x-www-form-urlencoded;charset=utf-8'
      processData = true
      data = formDataObj
    }
    
    let payload = {
      method, contentType, data, processData,
      url: addBasePath(`${formatUrl(url, formDataObj)}${urlParam}`, basePath),
      dataType: 'json',
      xhr: () => {
        const xhr = new window.XMLHttpRequest()
        xhr.upload.addEventListener("progress", this._handleProgress.bind(this))
        return xhr
      }
    }
    
    if (isNotBlank(csrf.header) && isNotBlank(csrf.token)) {
      payload.beforeSend = req => req.setRequestHeader(csrf.header, csrf.token)
    }

    return new Promise((resolve, reject) => {
      $.ajax(payload)
        .done(response => checkResponse(response) ? resolve(response) : reject(response))
        .fail(error => reject(error))
    })
  }

  _getParameters(key, opt, defaultValue) {
    assert(isNotBlank(key), 1, 'NonBlankString')

    let result = []
    const camelKey = toCamelCase(key)
    const kebabKey = toKebabCase(key)
    const prefixInputName = this._datasetHelper.keyToInputName(kebabKey)
    const inputSelector = `[name="_${prefixInputName}"], [name="_${kebabKey}"]`
    const optValue = isObject(opt) ? (opt[camelKey] ?? opt[kebabKey]) : null
  
    if (hasValue(optValue)) {
      result.push(optValue)
    } else if (this._hasForm) {
      querySelector(inputSelector, this._form)
        .map(elem => elem.value)
        .filter(hasValue)
        .forEach(value => result.push(value))
      if (result.length === 0) {
        const dataAttrValue = this._datasetHelper.getValue(this._form, kebabKey)
        hasValue(dataAttrValue) && result.push(dataAttrValue)
      }
      if (result.length === 0) {
        const attrValue = this._form.getAttribute(kebabKey)
        hasValue(attrValue) && result.push(attrValue)
      }
    }

    if (result.length === 0) {
      hasValue(defaultValue) && result.push(defaultValue)
    }
    return result
  }

  _generateFormData(opt = {}) {
    const { _hasForm, _form, _pagination } = this
    const formData = _hasForm ? new FormData(_form) : new FormData()

    appendPaginationParameter(formData, _form, _pagination, opt.keepPage)
    appendFunctionParameter(formData, opt.data)
    deleteInputConfigValue(formData)
    processCheckboxValue(formData, _form)
    processInputDateValue(formData, _form)

    for (const key of new Set(formData.keys())) {
      let values = formData.getAll(key).filter(hasValue)
      let realKeys = [ key ]
      if (key.includes('|')) {
        formData.delete(key)
        realKeys = key.split('|').filter(hasValue)
      }
      realKeys.forEach(realKey => {
        formData.delete(realKey)
        let inputValues = values.length === 0 ?
          this._getParameters(`default-${realKey}`) : values
        if (inputValues.length === 0)
          inputValues.push('')
        inputValues.forEach(value => formData.append(realKey, value))
      })
    }
    return formData
  }

  _generateRequestParameter(opt) {
    const { getCsrfToken } = getConfig('getCsrfToken')
    const method = this._getParameters('method', opt, 'POST')[0].toUpperCase()
    const isUrlMethod = URL_METHOD.includes(method)
    return {
      method, isUrlMethod,
      url: this._getParameters('action', opt)[0] ?? this._getParameters('url', opt)[0],
      enctype: this._getParameters('enctype', opt, 'urlencoded')[0],
      csrf: getCsrfToken()
    }
  }

  _clearInputs() {
    if (!this._hasForm)
      return
    const attrName = this._datasetHelper.keyToAttrName('clear')
    findFormElem(this._form, `[${attrName}]`).forEach(elem => {
      elem.value = ''
      const selector = `.${FORM_APPLY_CLASS_NAME}[name="${elem.getAttribute('name')}"]`
      querySelector(selector, this._form).forEach(elem => elem.remove())
    })
  }
}

function getConfig(keys) {
  const arr = isArray(keys) ? keys : [keys]
  let result = {}
  arr.forEach(key => {
    assert(isNotBlank(key), 0, 'StringArray or NotBlankString')
    const settingValue = findObjectValue(AjaxFormSubmit.config, key)
    if (settingValue.exist) {
      result[settingValue.key] = settingValue.value
    } else {
      const defaultValue = findObjectValue(DEFAULT_CONFIG, key)
      result[defaultValue.key] = defaultValue.value
    }
  })
  return result
}

function findFormElem(form, selector) {
  assert(elementIs(form, 'form'), 0, 'HTMLElement Form')
  assert(isNotBlank(selector), 1, 'NonBlankString')

  const formId = form.getAttribute('id')
  let elems = querySelector(`${selector}`, form)
  if (formId)
    elems = elems.concat(querySelector(`[form="${formId}"]${selector}`))
  return elems
}

function checkFormValidation(form) {
  let isValid = true
  if (form.checkValidity) {
    if (form.hasAttribute('novalidate')) {
      if (hasClass(form, 'needs-validation')) {
        addClass(form, 'was-validated')
        isValid = form.checkValidity()
      }
    } else {
      isValid = form.checkValidity()
    }
  }
  return isValid
}

function checkHiddenInputValidation(form, input) {
  const fields = []
  const selector = 'input[type=hidden][required]'
  querySelector(selector, form).forEach(elem => {
    const elemName = elem.getAttribute('name')
    if (isNotBlank(elemName)) {
      const elemValue = elem.value || input[elemName]
      if (!hasValue(elemValue))
        fields.add(elemName)
    }
  })
  return fields
}

function appendPaginationParameter(formData, form, pagination, keepPage) {
  //TODO
  if (!isFormData(formData) || !isObject(pagination))
    return

  const { currentPage, reservePage } = pagination
  const { reserve } = getConfig('pagination.reserve')

  if (isObject(currentPage)) {
    const page = { ...pagination.currentPage }
    for (const [key, value] of Object.entries(page)) {
      formData.set(key, value)
      delete currentPage[key]
    }
  }

  if (isTrue(formData.get(reserve)) && isObject(reservePage)) {
    for (const [key, value] of Object.entries(reservePage)) {
      formData.set(key, value)
    }
    findFormElem(form, `[name=${reserve}]`).forEach(elem => elem.value = false)
  }
}

function appendFunctionParameter(formData, data) {
  if (!isFormData(formData) || !isObject(data))
    return
  for (const [key, value] of Object.entries(data)) {
    if (isArray(value)) {
      formData.delete(key)
      value.forEach(item => formData.append(key, item))
    } else {
      formData.set(key, value)
    }
  }
}

function deleteInputConfigValue(formData) {
  if (!isFormData(formData))
    return
  new Set(formData.keys()).forEach(key =>
    startsWith(key, '_').exist && formData.delete(key))
}

function processCheckboxValue(formData, form) {
  const selector = `input[type="checkbox"]:not(:disabled)`
  const group = findFormElem(form, selector).reduce((acc, elem) => {
    if (!isNotBlank(elem.value) || elem.value === 'on') {
      acc[elem.name] ||= []
      acc[elem.name].push(elem)
    }
    return acc
  }, {})

  for (const [name, elems] of Object.entries(group)) {
    formData.delete(name)
    elems.forEach(({ checked }) => formData.append(name, checked))
  }
}

function processInputDateValue(formData, form) {
  const selector = `input[type^="date"]:not(:disabled)`
  const group = findFormElem(form, selector).reduce((acc, elem) => {
    acc[elem.name] ||= []
    acc[elem.name].push(elem)
    return acc
  }, {})

  for (const [name, elems] of Object.entries(group)) {
    formData.delete(name)
    elems.forEach(({ value }) =>
      isNotBlank(value) && formData.append(name, new Date(value).getTime()))
  }
}

function formDataToObject(formData) {
  let obj = {}
  formData.forEach((value, key) => {
    const isArr = key.includes('[]')
    const realKey = key.replace('[]', '')
    if (!Reflect.has(obj, realKey)) {
      obj[realKey] = isArr ? [ value ] : value
    } else {
      if (!isArray(obj[realKey])) {
        obj[realKey] = [obj[realKey]]
      }
      obj[realKey].push(value)
    }
  })
  return obj
}

function objectToFormData(obj) {
  const formData = new FormData()
  let hasFile = false

  for (const [key, value] of Object.entries(obj)) {
    hasFile ||= (value instanceof Blob)
    if (isArray(value)) {
      const realKey = `${key}[]`
      value.forEach(arrayValue => formData.append(realKey, arrayValue))
    } else {
      formData.append(key, value)
    }
  }

  return {
    formData, hasFile
  }
}

function classifyMessageControl(controls) {
  const inputMessage = [], outputMessage = [], pageMessage = []
  controls?.forEach?.(elem => {
    if (hasClass(elem, FORM_MESSAGE_PAYLOAD_INPUT_CLASS_NAME)) {
      inputMessage.push(elem)
    } else if (hasClass(elem, FORM_MESSAGE_PAYLOAD_OUTPUT_CLASS_NAME)) {
      outputMessage.push(elem)
    } else if (hasClass(elem, FORM_MESSAGE_PAYLOAD_PAGE_CLASS_NAME)) {
      pageMessage.push(elem)
    }
  })
  return { inputMessage, outputMessage, pageMessage }
}

function isFormData(formData) {
  return formData instanceof FormData
}

function ignoreLifecycle(form, datasetHelper, lifecycle) {
  const attrName = datasetHelper.keyToAttrName(`ignore-${lifecycle}`)
  return form.hasAttribute(attrName)
}

window.addEventListener('DOMContentLoaded', event => {
  const selector = `.${FORM_CLASS_NAME}`
  querySelector(selector).forEach(form => AjaxFormSubmit.create(form))
  registerMutationObserver(el => {
    querySelector(selector, el, true).forEach(form => AjaxFormSubmit.create(form))
  })

  
  for (const [key, value] of Object.entries(formSubmitAuto)) {
    const group = isArray(value) ? value : [ value ]
    group.forEach(({ form, payload }) =>
      form.submit({ data: payload }).catch(ignored=> {}))
  }
}, { once: true })

export { AjaxFormSubmit } 
window && (window.AjaxFormSubmit = AjaxFormSubmit)
