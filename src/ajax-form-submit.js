import {
  OBJECT,
  STRING_NON_BLANK,
  ERROR_CONFIRM,
  ERROR_VALIDATION
} from './js-constant.js'

import {
  assert,
  startsWith,
  isArray,
  isNotBlank,
  isObject,
  hasValue,
  delay,
  valueToString,
  toCamelCase,
  toKebabCase,
  toArray,
  objectKeys,
  objectEntries,
  deepFilterArrays
} from './js-utils.js'

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
} from './js-dom-utils.js'

import { default as SubmitHandler } from './ajax-form-submit-submit-handler.js'
import { default as ResetHandler } from './ajax-form-submit-reset-handler.js'
import { default as SuccessHandler, handleEvent } from './ajax-form-submit-success-handler.js'
import { createProperty } from './js-property-factory.js'
import { createDatasetHelper } from './js-dataset-helper.js'
import { createInstanceMap } from './js-cache.js'
import { createConfig } from './js-config.js'
import DOMHelper from './js-dom-helper.js'
import requestHelper from './js-request-helper.js'
import MiddlewareFactory from './js-middleware-factory.js'

const FORM_CLASS_NAME = 'ajax-form-submit'
const FORM_INIT_CLASS_NAME = `${FORM_CLASS_NAME}-initialized`
const FORM_APPLY_CLASS_NAME = `${FORM_CLASS_NAME}-apply`
const FORM_MESSAGE_PAYLOAD_INPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-input`
const FORM_MESSAGE_PAYLOAD_OUTPUT_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-output`
const FORM_MESSAGE_PAYLOAD_PAGE_CLASS_NAME = `${FORM_CLASS_NAME}-message-payload-page`

const FORM_EVENT_SUBMIT = `submit`
const FORM_EVENT_RESET = `reset`
const FORM_EVENT_APPLY = `${FORM_CLASS_NAME}:apply`
const FORM_EVENT_TRIGGER = `${FORM_CLASS_NAME}:trigger`
const FORM_EVENT_PAGE_UPDATE = `${FORM_CLASS_NAME}:page-update`
const FORM_EVENT_UPLOAD_START = `${FORM_CLASS_NAME}:upload-start`
const FORM_EVENT_UPLOAD_STOP = `${FORM_CLASS_NAME}:upload-stop`

const TRIGGER_CLICKABLE = [ 'button', 'a' ]

const UI_CONTROLS = {
  enable: { name: `${FORM_CLASS_NAME}-enable`, enable: true },
  disable: { name: `${FORM_CLASS_NAME}-disable`, enable: false },
  show: { name: `${FORM_CLASS_NAME}-show`, show: true },
  hide: { name: `${FORM_CLASS_NAME}-hide`, show: false },
  progress: { name: `${FORM_CLASS_NAME}-progress`, show: true },
  messageValidation: { name: `${FORM_CLASS_NAME}-message-validation`, show: true },
  messageSuccess: { name: `${FORM_CLASS_NAME}-message-success`, show: true },
  messageError: { name: `${FORM_CLASS_NAME}-message-error`, show: true },
}

const PARAMETER = [
  { name: 'append' },
  { name: 'page' },
  { name: 'querystring' },
  { name: 'apply', required: true },
]

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
    getError: (error = {}) => (
      (error.code && (AjaxFormSubmit.config.i18n?.code?.[error.code] || error.code)) ||
      (error.status && (AjaxFormSubmit.config.i18n?.status?.[error.status] || error.status)) ||
      error.message
    )
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
  #resetHandler
  #controls
  #pagination
  #parameters

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
    this.#resetHandler = new ResetHandler(this.#root)
    this.#controls = this.#initUIControls()
    this.#parameters = { append: { _append: true } }

    this.#initTriggers()
    this.initPagination()
    this.initAutoSubmit()
    this.initSuccessHandler()

    registerEvent(this.#root, FORM_EVENT_SUBMIT, event => this.submitSync({ event }))
    registerEvent(this.#root, FORM_EVENT_APPLY, this.#handleEventApplied.bind(this))
    registerEvent(this.#root, FORM_EVENT_TRIGGER, this.#handleEventTriggered.bind(this))
    registerEvent(this.#root, FORM_EVENT_RESET, this.#handleEventReset.bind(this))
    addClass(this.#root, FORM_INIT_CLASS_NAME)
  }

  updateConfig(props) {
    Object.assign(this.config, props)
    createProperty(this.#getParameters('config')).forEach(config => {
      for (const [key, values] of objectEntries(config)) {
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

    this.#pagination = {
      updatePage: page => isObject(page) && triggerEvent(elems, FORM_EVENT_PAGE_UPDATE, {
        page,
        onPaging: input => {
          this.#parameters.page = {
            [pagination.page]: input[pagination.page],
            [pagination.size]: input[pagination.size],
          }
          this.submitSync({ parameter: ['page', ...(input.parameters ?? [])] })
        }
      })
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
      this.#parameters.querystring = result
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
    this.#resetHandler.add('empty', this.successHandler.before)
    return this
  }

  addUIControls(opt) {
    assert(isObject(opt), 1, OBJECT)
    for (const [type, value] of objectEntries(opt))
      querySelector(value).forEach(elem => this.#controls[type]?.push(elem))
    return this
  }

  submit(opt = {}) {
    stopDefaultEvent(opt?.event)
    return this.#handleBefore(opt)
      .then(({ request, options }) => {
        opt = options
        return this.#handleValidation(request, opt)
      })
      .then(request => this.#handleRequest(request, opt))
      .then(({ request, response }) => this.#handleResponse(request, response, opt))
      .then(({ request, response }) => this.#handleAfter(request, response, opt))
      .catch(error => {
        switch (error?.message) {
          case ERROR_VALIDATION:
            break
          case ERROR_CONFIRM:
            this.#resetUIControls()
            break
          default:
            this.#handleError(error, opt)
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

  #initTriggers() {
    const props = createProperty(this.#datasetHelper.getValue(this.#root, 'trigger'))[0]
    const attrName = this.#datasetHelper.keyToAttrName('trigger')
    const triggers = [
      ...querySelector(props.value),
      ...findFormElem(this.#root, `button[type="submit"], button:not([type]), [${attrName}]`)
    ]
    triggers.forEach(el => {
      if (elementIs(el, TRIGGER_CLICKABLE)) {
        this.addUIControls({ disable: el })
        if (!elementIs(el, 'button') || !this.#root.contains(el))
          registerEvent(el, 'click', event => this.submitSync())
      } else {
        registerEvent(el, 'change', event => this.submitSync())
      }
    })
  }

  #initUIControls() {
    let controls = {}
    for (const [key, { name }] of objectEntries(UI_CONTROLS)) {
      controls[key] = [
        ...querySelector(this.#getParameters(toKebabCase(key))),
        ...querySelector(`.${name}`, this.#root)
      ]
    }
    return controls
  }

  #handleBefore(opt = {}) {
    let request = isObject(opt.data) ? opt.data : this.#generateFormData(opt)
    request = formDataToObject(request)

    const props = objectKeys(request).reduce((acc, key) => {
      const { exist, value } = startsWith(key, '_')
      if (exist) {
        acc[value] = request[key]
        delete request[key]
      }
      return acc
    }, {})

    const options = { ...opt, props }
    const middlewareProps = this.#getParameters('middleware-before', options)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)

    return middleware({ request, root: this.#root }).then(result => {
      this.#resetUIControls()
      this.successHandler?.before?.(options.props)
      return { request: hasValue(result?.request) ? result.request : request, options }
    })
  }

  #handleValidation(request, opt = {}) {
    const middlewareProps = this.#getParameters('middleware-validation', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    const fields = new Set()

    !checkFormValidation(this.#root) && fields.add('form')
    checkHiddenInputValidation(this.#root, request).forEach(fields.add, fields)

    const attrKey = 'required-group'
    const attrName = this.#datasetHelper.keyToAttrName(attrKey)
    let requiredGroups = {}
    findFormElem(this.#root, `[${attrName}]`).forEach(elem => {
      const groupName = this.#datasetHelper.getValue(elem, attrKey)
      requiredGroups[groupName] ||= []
      requiredGroups[groupName].push(elem)
    })

    for (const [name, group] of objectEntries(requiredGroups)) {
      const groupValid = group.some(elem => {
        const elemName = elem.getAttribute('name')
        let isValid = hasValue(request[elemName]) || isNotBlank(elem.value)
        isValid ||= findFormElem(this.#root, `[name="${elemName}"]`)
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
        throw new Error(ERROR_VALIDATION)
      }
      return request
    })
  }

  #handleRequest(request, opt = {}) {
    const middlewareProps = this.#getParameters('middleware-request', opt)
    const middleware = AjaxFormSubmit.middleware.create(middlewareProps)
    const type = this.#getParameters('type', opt)[0] || 'ajax'
    // TODO need finetune
    const inAttr = this.#datasetHelper.keyToAttrName('in')
    const requestParams = {
      method: this.#getParameters('method', opt)[0],
      url: this.#getParameters('action', opt, opt.url)[0],
      enctype: this.#getParameters('enctype', opt)[0],
      csrf: this.#config.get('getCsrfToken')['getCsrfToken']?.(),
      headers: findFormElem(this.#root, `[${inAttr}="header"]`)
        .filter(elem => elem.name)
        .reduce((acc, { name, value }) => {
          acc[name] = value
          return acc
        }, {})
    }

    enableElements(this.#controls.enable)
    disableElements(this.#controls.disable)
    showElements(this.#controls.show)
    hideElements(this.#controls.hide)
    return delay(this.#config.get('delay').delay)
      .then(ignored => middleware({ request, root: this.#root}))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(req => {
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
      this.#resetUIControls()
      this.successHandler?.response?.(opt.props, req)
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
      showElements(this.#controls.messageSuccess)
      return response
    })
  }

  #handleError(error, opt = {}) {
    console.error(error)
    const { getError } = this.#config.get(['response.getError'])
    this.#resetUIControls()
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

  #handleEventApplied(event) {
    stopDefaultEvent(event)
    this.#parameters.apply ||= {}
    const attrName = this.#datasetHelper.keyToAttrName('applied')
    const payload = {
      input: event?.detail?.input,
      output:  event?.detail?.output,
    }

    for (const [type, applyData] of objectEntries(payload)) {
      let targets = []
      if (isObject(applyData)) {

        for (const [key, values] of objectEntries(applyData)) {
          const allAttr = `[${attrName}="${key}"]`
          const typeAttr = `[${attrName}-${type}="${key}"]`

          findFormElem(this.#root, `${allAttr},${typeAttr}`)
            .filter(elem => elem.name)
            .forEach(({ name }) => this.#parameters.apply[name] = values)
        }

      } else if (hasValue(applyData)) {
        findFormElem(this.#root, `[${attrName}="${FORM_APPLY_CLASS_NAME}-${type}"]`)
          .filter(elem => elem.name)
          .forEach(({ name }) => this.#parameters.apply[name] = valueToString(applyData))
      }
    }
  }

  #handleEventTriggered(event) {
    stopDefaultEvent(event)
    this.#handleEventApplied(event)
    this.submitSync({ parameter: event?.detail?.props?.parameter })
  }

  #handleEventReset(event) {
    this.#resetUIControls()
    this.#pagination?.updatePage?.({})
    const props = createProperty(this.#datasetHelper.getValue(this.#root, 'reset'))[0]
    this.#resetHandler.run(props)
  }

  #getParameters(key, opt, defaultValue) {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)

    const camelKey = toCamelCase(key)
    const kebabKey = toKebabCase(key)

    if (isObject(opt) && hasValue(opt[camelKey] ?? opt[kebabKey]))
      return toArray(opt[camelKey] ?? opt[kebabKey])

    const selector = `[name="_${this.#datasetHelper.keyToInputName(kebabKey)}"], [name="_${kebabKey}"]`
    const inputValue = findFormElem(this.#root, selector).map(elem => elem.value).filter(hasValue)
    if (inputValue.length > 0)
      return inputValue

    const dataAttrValue = this.#datasetHelper.getValue(this.#root, kebabKey)
    if (isNotBlank(dataAttrValue))
      return toArray(dataAttrValue)

    const attrValue = this.#root.getAttribute(kebabKey)
    if (isNotBlank(attrValue))
      return toArray(attrValue)

    return toArray(defaultValue)
  }


  #generateFormData(opt = {}) {
    const formData = new FormData(this.#root)

    //TODO need finetune
    appendAdditionalInput(formData, this.#datasetHelper.getValue(this.#root, 'input'))

    PARAMETER.forEach(({ name, required }) => {
      if (required || opt.parameter?.includes(name))
        appendParameter(formData, this.#parameters[name])
    })

    processCheckboxValue(formData, this.#root)
    processInputDateValue(formData, this.#root)

    //TODO need finetune
    const headerAttr = this.#datasetHelper.keyToAttrName('header')
    deleteInputHeader(this.#root, formData, headerAttr)

    // TODO set default
    return formData
  }

  #resetUIControls() {
    for (const [key, elements] of objectEntries(this.#controls)) {
      const control = UI_CONTROLS[key]
      if (hasValue(control?.show))
        control?.show ? hideElements(elements) : showElements(elements)
      if (hasValue(control?.enable))
        control?.enable ? disableElements(elements) : enableElements(elements)
    }
  }
}

function findFormElem(form, selector) {
  assert(isNotBlank(selector), 1, STRING_NON_BLANK)
  const result = []
  for (const el of form.elements)
    el.matches(selector) && result.push(el)
  return result
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
  findFormElem(form, selector).forEach(elem => {
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
  for (const [key, values] of objectEntries(data)) {
    formData.delete(key)
    formData.delete(`${key}[]`)
    toArray(values).forEach(value => formData.append(key, value))
  }
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
  const group = findFormElem(form, `input[type="checkbox"]:not(:disabled)`).reduce((acc, elem) => {
    if (isNotBlank(elem.name) && (!isNotBlank(elem.value) || elem.value === 'on')) {
      acc[elem.name] ||= []
      acc[elem.name].push(elem)
    }
    return acc
  }, {})

  for (const [name, elems] of objectEntries(group)) {
    formData.delete(name)
    elems.forEach(({ checked }) => formData.append(name, checked))
  }
}

function processInputDateValue(formData, form) {
  const group = findFormElem(form, `input[type^="date"]:not(:disabled)`).reduce((acc, elem) => {
    acc[elem.name] ||= []
    acc[elem.name].push(elem)
    return acc
  }, {})

  for (const [name, elems] of objectEntries(group)) {
    formData.delete(name)
    elems.forEach(({ value }) =>
      isNotBlank(value) && formData.append(name, new Date(value).getTime()))
  }
}

function formDataToObject(formData) {
  if (!isFormData(formData))
    return formData

  let result = {}
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

function isFormData(formData) {
  return formData instanceof FormData
}

window.addEventListener('DOMContentLoaded', event => {
  const selector = `.${FORM_CLASS_NAME}`
  querySelector(selector).forEach(form => AjaxFormSubmit.instance.create(form))
  registerMutationObserver(el =>
    querySelector(selector, el, true).forEach(form => AjaxFormSubmit.instance.create(form)))

  const parameter = [ 'querystring' ]
  for (const [key, value] of objectEntries(formSubmitAuto)) {
    toArray(value).forEach(form => form.submit({ parameter }).catch(ignored => {}))
  }
}, { once: true })

export { AjaxFormSubmit }
window && (window.AjaxFormSubmit = AjaxFormSubmit)
