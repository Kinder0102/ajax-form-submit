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
  findObjectValue,
  deepFilterArrays
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

import { default as SubmitHandler } from './ajax-form-submit-submit-handler'
import { default as SuccessHandler, handleEvent } from './ajax-form-submit-success-handler'
import { createProperty } from './js-property-factory'
import { createDatasetHelper } from './js-dataset-helper'
import { createInstanceMap } from './js-cache'
import { createConfig } from './js-config'
import DOMHelper from './js-dom-helper'
import requestHelper from './js-request-helper'
import MiddlewareFactory from './js-middleware-factory'

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

const UI_CONTROLS = {
  show: { name: `${FORM_CLASS_NAME}-show` },
  hide: { name: `${FORM_CLASS_NAME}-hide`, hide: true },
  progress: { name: `${FORM_CLASS_NAME}-progress` },
  messageValidation: { name: `${FORM_CLASS_NAME}-message-validation` },
  messageSuccess: { name: `${FORM_CLASS_NAME}-message-success` },
  messageError: { name: `${FORM_CLASS_NAME}-message-error` },
}

const DEFAULT_CONFIG = {
  prefix: 'afs',
  basePath: '/',
  delay: 0,
  pagination: {
    page: 'page',
    size: 'size',
  },
  response: {
    create: value => ({ code: 200, data: { item: value?.data, page: value?.page } }),
    checkResponse: res => res?.code === 200,
    getData: res => res?.data?.item,
    getPage: res => res?.data?.page,
    getError: error => error?.code
  },
  getCsrfToken: () => ({
    header: document.querySelector('meta[name="_csrf_header"]')?.content || 'X-CSRF-TOKEN',
    token: document.querySelector('meta[name="_csrf"]')?.content || '' 
  })
}

let formSubmitAuto = { all: [] }
SubmitHandler.add('ajax', requestHelper.request)
SuccessHandler.add('apply', handleEvent(FORM_EVENT_APPLY))
SuccessHandler.add('trigger', handleEvent(FORM_EVENT_TRIGGER))
SuccessHandler.add('reset', handleEvent(FORM_EVENT_RESET))

class AjaxFormSubmit {
  static config = {}
  static middleware = new MiddlewareFactory()
  static instance = createInstanceMap(
    el => elementIs(el, 'form') && hasClass(el, FORM_CLASS_NAME) && !hasClass(el, FORM_INIT_CLASS_NAME),
    el => new AjaxFormSubmit(el))

  #config
  #root
  #domHelper
  #datasetHelper
  #submitHandler
  #submitButtons
  #controls
  #pagination
  #additionalData

  constructor(root) {
    this.#root = elementIs(root, 'form') ? root : document.createElement('form')
    this.config = {}
    this.#config = createConfig(() => [ this.config, AjaxFormSubmit.config, DEFAULT_CONFIG ])

    const { prefix } = this.#config.get('prefix')
    this.#datasetHelper = createDatasetHelper(prefix)
    this.updateConfig()

    const { basePath } = this.#config.get('basePath')
    this.#domHelper = new DOMHelper({ prefix, basePath })
    this.#submitHandler = this.#initSubmitHandler()
    this.#submitButtons = this.#initSubmitButtons()
    this.#controls = this.#initUIControls()
    this.#additionalData = {}
    
    this.initPagination()
    this.initAutoSubmit()
    this.initSuccessHandler()

    registerEvent(this.#root, FORM_EVENT_SUBMIT, event => this.submitSync({ event }))
    registerEvent(this.#root, FORM_EVENT_APPLY, this.#handleApplied.bind(this))
    registerEvent(this.#root, FORM_EVENT_TRIGGER, this.#handleTriggered.bind(this))
    registerEvent(this.#root, FORM_EVENT_RESET, this.#handleReset.bind(this))
    addClass(this.#root, FORM_INIT_CLASS_NAME)
  }

  updateConfig(props) {
    Object.assign(this.config, props)
    createProperty(this.#getParameters('config')).forEach(config => {
      for (const [key, values] of Object.entries(config)) {
        if (hasValue(values[0]))
          this.config[key] = values[0]
      }
    })
  }

  initPagination(selectors) {
    const { pagination } = this.#config.get('pagination')
    const elems = [
      ...querySelector(this.#getParameters('pagination')),
      ...querySelector(selectors)
    ]

    if (elems.length > 0) {
      this.#pagination = {
        updatePage: page => {
          if (!isObject(page))
            return
          triggerEvent(elems, FORM_EVENT_PAGE_UPDATE, {
            page,
            onPaging: input => {
              this.#additionalData.page = {
                [pagination.page]: input[pagination.page],
                [pagination.size]: input[pagination.size],
              }
              this.submitSync({ additional: ['page'] })
            }
          })
        }
      }
    }
    return this
  }

  initAutoSubmit(props) {
    if (!(this.#datasetHelper.keyToDatasetName('auto') in this.#root.dataset))
      return this

    const parameter = this.#getParameters('auto', { auto: props })[0]
    const { type, value } = createProperty(parameter)[0]

    if (value.includes('querystring')) {
      const query = new URLSearchParams(location.search)
      let result = {}
      for (const [key, value] of query.entries()) {
        if (hasValue(result[key])) {
          result[key] = isArray(result[key]) ? [...result[key], value] : [result[key], value]
        } else {
          result[key] = value
        }
      }
      this.#additionalData.querystring = result
    }

    formSubmitAuto.all.push(this)
    return this
  }

  initSuccessHandler(props) {
    this.successHandler = new SuccessHandler({
      root: this.#root,
      handlerProps: props,
      attrKey: 'success',
      domHelper: this.#domHelper,
      datasetHelper: this.#datasetHelper,
      ...this.#config.get(['prefix', 'basePath']),
    })
    return this
  }

  addUIControls(opt) {
    assert(isObject(opt), 1, 'Object')
    for (const [type, value] of Object.entries(opt))
      querySelector(value).forEach(elem => this.#controls[type].push(elem))
    return this
  }

  submit(opt = {}) {
    stopDefaultEvent(opt?.event)

    let options = { ...opt, props: {} }
    let req
    if (isArray(options.data)) {
      req = options.data
    } else {
      const { formData, props } = this.#generateFormData(options)
      req = formDataToObject(formData)
      options.props = props
    }

    return this.#handleBefore(req, options)
      .then(ignored => this.#handleValidation(req, options))
      .then(ignored => this.#handleRequest(req, options))
      .then(({ request, response }) => this.#handleResponse(request, response, options))
      .then(({ request, response }) => this.#handleAfter(request, response, options))
      .catch(error => {
        switch (error?.message) {
          case 'VALIDATION':
            break
          case 'CONFIRM':
            enableElements(this.#submitButtons)
            resetUIControls(this.#controls)
            break
          default:
            this.#handleError(error)
            throw error
        }
      })
  }

  submitSync(opt) {
    this.submit(opt).catch(ignored => {})
  }

  #initSubmitHandler() {
    const handleProgress = this.#handleProgress.bind(this)
    const {
      prefix,
      basePath,
      create: createResponse
    } = this.#config.get(['prefix', 'basePath', 'response.create'])
    return new SubmitHandler({ prefix, basePath, createResponse, handleProgress })
  }

  #initSubmitButtons() {
    const submitButtons = []
    const attrName = this.#datasetHelper.keyToAttrName('button')
    const innerSelector = `button[type="submit"], [${attrName}]`
    const outterSelector = this.#datasetHelper.getValue(this.#root, 'button')
    const buttons = [
      ...querySelector(outterSelector),
      ...querySelector(innerSelector, this.#root)
        .filter(button => !isNotBlank(button.getAttribute('form')))
    ]
    
    //TODO outter button registerEvent
    buttons.forEach(button => {
      if (elementIs(button, ['a', 'button'])) {
        submitButtons.push(button)
        if (button.type !== 'submit')
          registerEvent(button, 'click', event => this.submitSync())
      } else {
        registerEvent(button, 'change', event => this.submitSync())
      }
    })
    return submitButtons
  }

  #initUIControls() {
    let controls = {}
    for (const [key, { name }] of Object.entries(UI_CONTROLS)) {
      controls[key] = [
        ...querySelector(this.#getParameters(toKebabCase(key))),
        ...querySelector(`.${name}`, this.#root)
      ]
    }
    return controls
  }

  #handleBefore(request, opt = {}) {
    const middlewareProps = this.#getParameters('middleware-before', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    return middleware({ request, root: this.#root}).then(ignored => {
      resetUIControls(this.#controls)
      this.successHandler?.before?.(opt.props)
    })
  }

  #handleValidation(request, opt = {}) {
    const middlewareProps = this.#getParameters('middleware-validation', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    const fields = new Set()

    !checkFormValidation(this.#root) && fields.add('form')
    checkHiddenInputValidation(this.#root, request)
      .forEach(fields.add, fields)

    const attrKey = 'required-group'
    const attrName = this.#datasetHelper.keyToAttrName(attrKey)
    let requiredGroups = {}
    findFormElem(this.#root, `[${attrName}]`).forEach(elem => {
      const groupName = this.#datasetHelper.getValue(elem, attrKey)
      requiredGroups[groupName] ||= []
      requiredGroups[groupName].push(elem)
    })
    
    for (const [name, group] of Object.entries(requiredGroups)) {
      const groupValid = group.some(elem => {
        const elemName = elem.getAttribute('name')
        let isValid = hasValue(request[elemName]) || isNotBlank(elem.value)
        isValid ||= querySelector(`[name="${elemName}"]`, this.#root)
          .some(input => isNotBlank(input.value))
        return isValid
      })
      if (!groupValid)
        fields.add(name)
    }

    //TODO middleware validation
    return middleware({ request, root: this.#root}).then(result => {
      toArray(result).filter(isNotBlank).forEach(fields.add, fields)

      if (fields.size > 0) {
        showElements(this.#controls.messageValidation)
        this.#pagination?.updatePage?.({})
        throw new Error('VALIDATION')
      }
    })
  }

  #handleRequest(request, opt = {}) {
    const middlewareProps = this.#getParameters('middleware-request', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    const type = this.#getParameters('type', opt)[0] || 'ajax'
    // TODO need finetune
    const inAttr = this.#datasetHelper.keyToAttrName('in')
    const requestParams = {
      method: this.#getParameters('method', opt, 'POST')[0].toUpperCase(),
      url: this.#getParameters('action', opt, opt.url)[0],
      enctype: this.#getParameters('enctype', opt)[0],
      csrf: this.#config.get('getCsrfToken')['getCsrfToken']?.(),
      headers: findFormElem(this.#root, `[${inAttr}="header"]`)
        .filter(elem => elem.name)
        .map(({ name, value }) => ({ name, value }))
    }

    disableElements(this.#submitButtons)
    showElements(this.#controls.show)
    hideElements(this.#controls.hide)
    return delay(this.#config.get('delay').delay)
      .then(ignored => middleware({ request, root: this.#root}))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(req => {
        console.log(req)
        this.successHandler?.request?.(opt.props, req)
        return this.#submitHandler.run(type, opt, req, requestParams)
          .then(res => ({ request: req, response: res }))
      })
  }

  #handleResponse(request, response, opt = {}) {
    const { checkResponse, getPage } = this.#config.get([
      'response.checkResponse',
      'response.getPage'
    ])
    const middlewareProps = this.#getParameters('middleware-response', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    
    return middleware({ request, response, root: this.#root})
    .then(result => checkResponse(result.response) ? result : Promise.reject(result.response))
    .then(result => {
      const req = hasValue(result?.request) ? result.request : request
      const res = hasValue(result?.response) ? result.response : response
      triggerEvent(this.#controls.progress, FORM_EVENT_UPLOAD_STOP)
      resetUIControls(this.#controls)
      return { request: req, response: res }
    })
  }

  #handleAfter(request, response, opt = {}) {
    const { getData, getPage } = this.#config.get(['response.getData', 'response.getPage'])
    const middlewareProps = this.#getParameters('middleware-after', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)

    return middleware({ request, response, root: this.#root}).then(ignored => {
      const data = getData(response)
      const page = getPage(response)
      const {
        inputMessage, outputMessage, pageMessage
      } = classifyMessageControl(this.#controls.messageSuccess)

      inputMessage.forEach(elem => this.#domHelper.setValueToElement(elem, request))
      outputMessage.forEach(elem => this.#domHelper.setValueToElement(elem, data))
      pageMessage.forEach(elem => this.#domHelper.setValueToElement(elem, page))
      this.#pagination?.updatePage?.(page)
      this.successHandler?.after?.(opt.props, request, data)
      this.#clearInputs()
      showElements(this.#controls.messageSuccess)
      enableElements(this.#submitButtons)
      return response
    })
  }

  #handleError(error, opt = {}) {
    console.error(error)
    const { getError } = this.#config.get(['response.getError'])
    enableElements(this.#submitButtons)
    resetUIControls(this.#controls)
    triggerEvent(this.#controls.progress, FORM_EVENT_UPLOAD_STOP)

    const updatedError = { ...error, message: getError(error) }
    const messageError = this.#controls.messageError
    if (isArray(messageError) && messageError.length > 0) {
      const middlewareProps = this.#getParameters('middleware-error', opt)
      const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
      middleware(updatedError).then(result => {
        //TODO ignore default handler if middleware break
        messageError.forEach(elem => this.#domHelper.setValueToElement(elem, updatedError))
        showElements(messageError)
      })
    } else {
      AjaxFormSubmit.middleware.get('error')?.(updatedError)
    }
  }

  #handleProgress(event = {}) {
    const { lengthComputable, loaded, total } = event
    if (!lengthComputable)
      return

    const percent = parseInt(loaded / total * 90)
    triggerEvent(this.#controls.progress, FORM_EVENT_UPLOAD_START, [percent])
  }

  #handleApplied(event) {
    stopDefaultEvent(event)
    this.#additionalData.apply ||= {}
    const attrName = this.#datasetHelper.keyToAttrName('applied')
    const payload = {
      input: event?.detail?.input,
      output:  event?.detail?.output,
    }
    
    for (const [type, applyData] of Object.entries(payload)) {
      let targets = []
      if (isObject(applyData)) {

        for (const [key, values] of Object.entries(applyData)) {
          const allAttr = `[${attrName}="${key}"]`
          const typeAttr = `[${attrName}-${type}="${key}"]`

          querySelector(`${allAttr},${typeAttr}`, this.#root)
            .filter(elem => elem.name)
            .forEach(({ name }) => this.#additionalData.apply[name] = values)
        }

      } else if (hasValue(applyData)) {
        querySelector(`[${attrName}="${FORM_APPLY_CLASS_NAME}-${type}"]`, this.#root)
          .filter(elem => elem.name)
          .forEach(({ name }) => this.#additionalData.apply[name] = valueToString(applyData))
      }
    }
  }

  #handleTriggered(event) {
    stopDefaultEvent(event)
    this.#handleApplied(event)
    this.submitSync({ additional: event?.detail?.props?.additional })
  }

  #handleReset(event) {
    resetUIControls(this.#controls)
    this.successHandler?.before?.()
    this.#pagination?.updatePage?.({})
    this.#root?.reset()
    this.#clearInputs()
  }

  #getParameters(key, opt, defaultValue) {
    assert(isNotBlank(key), 1, 'NonBlankString')

    let result = []
    const camelKey = toCamelCase(key)
    const kebabKey = toKebabCase(key)
    const prefixInputName = this.#datasetHelper.keyToInputName(kebabKey)
    const inputSelector = `[name="_${prefixInputName}"], [name="_${kebabKey}"]`
    const optValue = isObject(opt) ? (opt[camelKey] ?? opt[kebabKey]) : null
  
    if (hasValue(optValue)) {
      result.push(optValue)
    } else {
      querySelector(inputSelector, this.#root)
        .map(elem => elem.value)
        .filter(hasValue)
        .forEach(value => result.push(value))
      if (result.length === 0) {
        const dataAttrValue = this.#datasetHelper.getValue(this.#root, kebabKey)
        hasValue(dataAttrValue) && result.push(dataAttrValue)
      }
      if (result.length === 0) {
        const attrValue = this.#root.getAttribute?.(kebabKey)
        hasValue(attrValue) && result.push(attrValue)
      }
    }

    if (result.length === 0) {
      hasValue(defaultValue) && result.push(defaultValue)
    }
    return result
  }

  #generateFormData(opt = {}) {
    const form = this.#root
    const formData = elementIs(form, 'form') ? new FormData(form) : new FormData()
    
    //TODO need finetune
    appendAdditionalInput(formData, this.#datasetHelper.getValue(form, 'input'))

    if (opt.additional?.includes('page'))
      appendParameter(formData, this.#additionalData.page)
    if (opt.additional?.includes('querystring'))
      appendParameter(formData, this.#additionalData.querystring)

    appendParameter(formData, opt.data)
    appendParameter(formData, this.#additionalData.apply)
    processCheckboxValue(formData, form)
    processInputDateValue(formData, form)

    const headerAttr = this.#datasetHelper.keyToAttrName('header')
    deleteInputHeader(form, formData, headerAttr)
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
          this.#getParameters(`default-${realKey}`) : values
        if (inputValues.length === 0)
          inputValues.push('')
        inputValues.forEach(value => formData.append(realKey, value))
      })
    }
    return { formData, props }
  }

  #clearInputs() {
    const attrName = this.#datasetHelper.keyToAttrName('clear')
    findFormElem(this.#root, `[${attrName}]`).forEach(elem => {
      elem.value = ''
      const selector = `.${FORM_APPLY_CLASS_NAME}[name="${elem.getAttribute('name')}"]`
      querySelector(selector, this.#root).forEach(elem => elem.remove())
    })
  }
}

function findFormElem(form, selector) {
  assert(isNotBlank(selector), 1, 'NonBlankString')
  const formId = form.id
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

function appendParameter(formData, data) {
  if (!isFormData(formData) || !isObject(data))
    return
  for (const [key, values] of Object.entries(data)) {
    formData.delete(key)
    formData.delete(`${key}[]`)
    toArray(values).forEach(value => formData.append(key, value))
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

function deleteInputHeader(form, formData, attrName) {
  if (!isFormData(formData))
    return
  const headerNames = findFormElem(form, `[${attrName}]`)
    .filter(elem => isNotBlank(elem.name))
    .map(elem => elem.name)

  Array.from(new Set(formData.keys()))
    .filter(key => headerNames.includes(key))
    .forEach(key => formData.delete(key))
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
  const result = {}
  if (!isFormData(formData))
    return result

  for (const [key, value] of formData.entries()) {
    const keys = key
      .replace(/\[(\d*)\]/g, (_, index) => (index ? `.${index}` : '.[]'))
      .split('.')

    keys.reduce((acc, current, index) => {
      const isLast = index === keys.length - 1

      if (isLast) {
        if (current === '[]') {
          if (!isArray(acc))
            acc = []
          acc.push(value)
        } else if (hasValue(acc[current])) {
          if (!isArray(acc[current]))
            acc[current] = [acc[current]]
          acc[current].push(value)
        } else {
          acc[current] = value
        }
      } else {
        if (current === '[]') {
          if (!isArray(acc))
            acc[current] = []
        } else if (!acc[current]) {
          acc[current] = /^\d+$/.test(keys[index + 1]) || keys[index + 1] === '[]' ? [] : {}
        }
      }

      return acc[current]
    }, result)
  }

  return deepFilterArrays(result)
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

function resetUIControls(controls) {
  for (const [key, elements] of Object.entries(controls)) {
    UI_CONTROLS[key]?.hide ? showElements(elements) : hideElements(elements)
  }
}

function isFormData(formData) {
  return formData instanceof FormData
}

window.addEventListener('DOMContentLoaded', event => {
  const selector = `.${FORM_CLASS_NAME}`
  querySelector(selector).forEach(form => AjaxFormSubmit.instance.create(form))
  registerMutationObserver(el =>
    querySelector(selector, el, true).forEach(form => AjaxFormSubmit.instance.create(form)))

  const additional = [ 'querystring' ]
  for (const [key, value] of Object.entries(formSubmitAuto)) {
    toArray(value).forEach(form => form.submit({ additional }).catch(ignored => {}))
  }
}, { once: true })

export { AjaxFormSubmit }
window && (window.AjaxFormSubmit = AjaxFormSubmit)
