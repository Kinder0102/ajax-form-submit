import {
  assert,
  startsWith,
  endsWith,
  isTrue,
  isNotBlank,
  isObject,
  isArray,
  hasValue,
  delay,
  valueToString,
  toCamelCase,
  toKebabCase,
  toArray,
  findObjectValue
} from './js-utils'

import {
  elementIs,
  hasClass,
  addClass,
  querySelector,
  registerMutationObserver,
  registerEvent,
  triggerEvent,
  stopDefaultEvent,
  showElements,
  hideElements,
  enableElements,
  disableElements
} from './js-dom-utils'

import MiddlewareFactory from './js-middleware-factory'
import { createProperty } from './js-property-factory'
import { createDatasetHelper } from './js-dataset-helper'
import { createInstanceMap } from './js-cache'
import DOMHelper from './js-dom-helper'
import requestHelper from './js-request-helper'

import { default as SubmitHandler } from './ajax-form-submit-submit-handler'
import { default as SuccessHandler, handleEvent } from './ajax-form-submit-success-handler'

const FORM_CLASS_NAME = 'ajax-form-submit'
const FORM_INIT_CLASS_NAME = `${FORM_CLASS_NAME}-initialized`
const FORM_APPLY_CLASS_NAME = `${FORM_CLASS_NAME}-apply`
const FORM_MESSAGE_PAYLOAD_INPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-input`
const FORM_MESSAGE_PAYLOAD_OUTPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-output`
const FORM_MESSAGE_PAYLOAD_PAGE_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-page`

const FORM_EVENT = `${FORM_CLASS_NAME}-event`
const FORM_EVENT_SUBMIT = `submit`
const FORM_EVENT_RESET = `reset`
const FORM_EVENT_APPLY = `${FORM_EVENT}-apply`
const FORM_EVENT_TRIGGER = `${FORM_EVENT}-trigger`
const FORM_EVENT_PAGE_UPDATE = `${FORM_EVENT}-page-update`
const FORM_EVENT_UPLOAD_START = `${FORM_EVENT}-upload-start`
const FORM_EVENT_UPLOAD_STOP = `${FORM_EVENT}-upload-stop`

SubmitHandler.add('ajax', requestHelper.request)
SuccessHandler.add('apply', handleEvent(FORM_EVENT_APPLY))
SuccessHandler.add('trigger', handleEvent(FORM_EVENT_TRIGGER))
SuccessHandler.add('reset', handleEvent(FORM_EVENT_RESET))

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
  static submitHandler = SubmitHandler
  static successHandler = SuccessHandler
  static middleware = new MiddlewareFactory()
  static instance = createInstanceMap(
    el => elementIs(el, 'form') && hasClass(el, FORM_CLASS_NAME) && !hasClass(el, FORM_INIT_CLASS_NAME),
    el => new AjaxFormSubmit(el))

  static get Error() {
    return AjaxFormError
  }

  constructor(root) {
    const { prefix, basePath } = getConfig(['prefix', 'basePath'])
    this._hasForm = elementIs(root, 'form')
    this._submitButtons = []
    this._controls = {}
    this._domHelper = new DOMHelper({ prefix, basePath })
    this._datasetHelper = createDatasetHelper(prefix)
    this._initSubmitHandler()

    if (this._hasForm) {
      this._form = root
      this._initSubmitButtons()
      this._initUIControls()
      
      this.initPaginations()
      this.initAutoSubmit()
      this.initSuccessHandler()

      registerEvent(root, FORM_EVENT_SUBMIT, event => this.submitSync({ event }))
      registerEvent(root, FORM_EVENT_APPLY, this._handleApplied.bind(this))
      registerEvent(root, FORM_EVENT_TRIGGER, this._handleTriggered.bind(this))
      registerEvent(root, FORM_EVENT_RESET, this._handleReset.bind(this))
      addClass(root, FORM_INIT_CLASS_NAME)
    }
  }

  _initSubmitHandler() {
    const { prefix, basePath, create, checkResponse } = getConfig(['prefix', 'basePath', 'response.create', 'response.checkResponse'])
    this.submitHandler = new SubmitHandler({
      prefix, basePath, checkResponse,
      createResponse: create,
      handleProgress: this._handleProgress.bind(this)
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
    const { pagination } = getConfig(['pagination'])
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
        triggerEvent(elems, FORM_EVENT_PAGE_UPDATE, { page, onPaging })
    }

    this._pagination = { updatePage }
    return this
  }

  initAutoSubmit(props) {
    const parameter = this._getParameters('auto', { auto: props })[0]
    if (!isNotBlank(parameter))
      return

    let needAuto = false
    let payload = {}
    const { type, value, group } = createProperty(parameter)[0]
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

  initSuccessHandler(props) {
    this.successHandler = new SuccessHandler({
      ...getConfig(['prefix', 'basePath']),
      root: this._form,
      handlerProps: props,
      attrKey: 'success',
      domHelper: this._domHelper,
      datasetHelper: this._datasetHelper,
    })
    return this
  }

  addSubmitButtons(selectors) {
    querySelector(selectors).forEach(elem => {
      const keepPage = hasValue(this._datasetHelper.getValue(elem, 'button'))
      if (elementIs(elem, ['a', 'button'])) {
        //TODO button without type
        if (elem.type !== 'submit')
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
    stopDefaultEvent(opt?.event)

    let options = { ...opt, props: {} }
    let formDataObj
    if (isArray(options.data)) {
      formDataObj = options.data
    } else {
      const { formData, props } = this._generateFormData(options)
      formDataObj = formDataToObject(formData)
      options.props = props
    }

    //TODO every middleware can update formDataObj
    return this._handleBefore(formDataObj, options)
      .then(ignored => this._handleValidation(formDataObj, options))
      .then(ignored => this._handleRequest(formDataObj, options))
      .then(data => this._handleResponse(data, options))
      .then(data => this._handleAfter(data, options))
      .catch(error => {
        //TODO reset
        switch (error?.message) {
          case ERROR_TYPE.VALIDATION:
            showElements(this._controls.messageValidation)
            break;
          case ERROR_TYPE.CONFIRM:
            enableElements(this._submitButtons)
            hideElements(this._controls)
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
    const middleware = AjaxFormSubmit.middleware.create(props)
    hideElements(this._controls)
    return middleware(data).then(ignored => this.successHandler?.before?.(opt.props))
  }

  _handleValidation(data, opt = {}) {
    const props = this._getParameters('middleware-validation', opt)
    const middleware = AjaxFormSubmit.middleware.create(props)
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
          let isValid = hasValue(data[elemName]) || isNotBlank(elem.value)
          isValid ||= querySelector(`[name="${elemName}"]`, this._form)
            .some(input => isNotBlank(input.value))
          return isValid
        })
        if (!groupValid)
          fields.add(name)
      }
    }

    return middleware(data).then(data => {
      toArray(data).filter(isNotBlank).forEach(fields.add, fields)

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
    const type = this._getParameters('type', opt)[0] || 'ajax'
    const middleware = AjaxFormSubmit.middleware.create(props)
    const requestParams = {
      method: this._getParameters('method', opt, 'POST')[0].toUpperCase(),
      url: this._getParameters('action', opt, opt.url)[0],
      enctype: this._getParameters('enctype', opt)[0],
      csrf: getConfig('getCsrfToken')['getCsrfToken']?.()
    }

    disableElements(this._submitButtons)
    showElements(this._controls.spinner)
    this.successHandler?.request?.(opt.props, input)

    return delay(getConfig('delay').delay)
      .then(ignored => middleware(input, this._form))
      .then(input => {
        console.log(input)
        return this.submitHandler.run(type, opt, input, requestParams)
      })
      .then(response => ({ input, response }))
  }

  _handleResponse({ input, response }, opt = {}) {
    const props = this._getParameters('middleware-response', opt)
    const middleware = AjaxFormSubmit.middleware.create(props)
    const { getData, getPage } = getConfig(['response.getData', 'response.getPage'])
    
    return middleware(response, input).then(result => {
      response = hasValue(result) ? result : response
      const data = getData(response)
      const page = getPage(response)
      const {
        inputMessage, outputMessage, pageMessage
      } = classifyMessageControl(this._controls.messageSuccess)

      hideElements(this._controls)

      inputMessage.forEach(elem => this._domHelper.setValueToElement(elem, input))
      outputMessage.forEach(elem => this._domHelper.setValueToElement(elem, data))
      pageMessage.forEach(elem => this._domHelper.setValueToElement(elem, page))
      this._pagination?.updatePage?.(page)
      triggerEvent(this._controls.progress, FORM_EVENT_UPLOAD_STOP)
      return { input, response }
    })
  }

  _handleAfter({ input, response }, opt = {}) {
    const { getData } = getConfig('response.getData')
    showElements(this._controls.messageSuccess)
    enableElements(this._submitButtons)
    this._clearInputs()

    const success = this.successHandler?.after?.(opt.props, input, getData(response))
    if (success?.display === false) {
      showElements(this._controls.messageEmpty)
      // hideElements(this._controls.messageSuccess)
    }
    const props = this._getParameters('middleware-after', opt)
    const middleware = AjaxFormSubmit.middleware.create(props)
    return middleware(response, input).then(ignored => (response))
  }

  _handleError(error, opt = {}) {
    console.error(error)
    const { getError } = getConfig(['response.getError'])
    enableElements(this._submitButtons)
    hideElements(this._controls)
    triggerEvent(this._controls.progress, FORM_EVENT_UPLOAD_STOP)

    if (ignoreLifecycle(this._form, this._datasetHelper, 'error'))
      return

    const message = getError(error)
    const messageError = this._controls.messageError
    if (isArray(messageError) && messageError.length > 0) {
      const props = this._getParameters('middleware-error', opt)
      const middleware = AjaxFormSubmit.middleware.create(props)
      middleware(error).then(result => {
        //TODO ignore default handler if middleware break
        messageError.forEach(elem => this._domHelper.setValueToElement(elem, { message }))
        showElements(messageError)
      })
    } else {
      AjaxFormSubmit.middleware.get('error')?.(error)
    }
  }

  _handleProgress(event = {}) {
    const { lengthComputable, loaded, total } = event
    if (!lengthComputable)
      return

    const percent = parseInt(loaded / total * 90)
    triggerEvent(this._controls.progress, FORM_EVENT_UPLOAD_START, [percent])
  }

  _handleApplied(event) {
    stopDefaultEvent(event)
    const attrName = this._datasetHelper.keyToAttrName('applied')
    const payload = {
      input: event?.detail?.input,
      output:  event?.detail?.output,
    }
    
    const oldValues = querySelector(`.${FORM_APPLY_CLASS_NAME}`, this._form)

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
            oldValues.filter(oldValue => oldValue.name === elem.name).forEach(oldValue => oldValue.remove())
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
    this.successHandler?.before?.()
    this._pagination?.updatePage?.({})
    this._form?.reset()
    this._clearInputs()
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
    if (_hasForm) {

      //TODO need finetune
      appendAdditionalInput(formData, this._datasetHelper.getValue(_form, 'input'))
    }

    appendPaginationParameter(formData, _form, _pagination, opt.keepPage)
    appendFunctionParameter(formData, opt.data)
    processCheckboxValue(formData, _form)
    processInputDateValue(formData, _form)
    const props = deleteInputPropValue(formData)

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
    return { formData, props }
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
  let result = {}
  toArray(keys).forEach(key => {
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

function appendAdditionalInput(formData, selector) {
  if (!isFormData(formData) || !isNotBlank(selector))
    return

  querySelector(selector)
    .filter(input => isNotBlank(input.name) && !input.hasAttribute('disabled'))
    .forEach(input => {
      switch(input.type) {
        case 'checkbox':
          formData.append(input.name, input.checked)
          break
        case 'radio':
          input.checked && formData.append(input.name, input.value)
          break
        default:
          formData.append(input.name, input.value)
      }
    })
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

function deleteInputPropValue(formData) {
  if (isFormData(formData))
    return Array.from(new Set(formData.keys()))
      .filter(key => startsWith(key, '_').exist)
      .reduce((acc, key) => {
        acc[key] = formData.getAll(key)
        formData.delete(key)
        return acc
      }, {})
}

function processCheckboxValue(formData, form) {
  const selector = `input[type="checkbox"]:not(:disabled)`
  const group = findFormElem(form, selector).reduce((acc, elem) => {
    if (isNotBlank(elem.name) && (!isNotBlank(elem.value) || elem.value === 'on')) {
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
  if (!isFormData(formData))
    return formData
  
  let obj = {}
  formData.forEach((value, key) => {
    const { exist: isArr, value: realKey } = endsWith(key, '[]')
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
  querySelector(selector).forEach(form => AjaxFormSubmit.instance.create(form))
  registerMutationObserver(el => {
    querySelector(selector, el, true).forEach(form => AjaxFormSubmit.instance.create(form))
  })

  
  for (const [key, value] of Object.entries(formSubmitAuto)) {
    toArray(value).forEach(({ form, payload }) =>
      form.submit({ data: payload }).catch(ignored=> {}))
  }
}, { once: true })

export { AjaxFormSubmit }
window && (window.AjaxFormSubmit = AjaxFormSubmit)
