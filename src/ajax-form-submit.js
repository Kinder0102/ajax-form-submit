import {
  ARRAY,
  OBJECT,
  STRING_NON_BLANK,
  HTML_CHECKBOX,
  HTML_RADIO,
  ERROR_CONFIRM,
  ERROR_VALIDATION
} from '#libs/js-constant'

import {
  assert,
  hasValue,
  isArray,
  isInteger,
  isNotBlank,
  isObject,
  isElement,
  startsWith,
  endsWith,
  delay,
  valueToString,
  formatString,
  toCamelCase,
  toKebabCase,
  toArray,
  objectKeys,
  objectEntries
} from '#libs/js-utils'

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
} from '#libs/js-dom-utils'

import { default as SubmitHandler } from '#libs/ajax-form-submit-submit-handler'
import { default as SuccessHandler, handleEvent } from '#libs/ajax-form-submit-success-handler'
import { default as ResetHandler } from '#libs/ajax-form-submit-reset-handler'
import { createProperty } from '#libs/js-property-factory'
import { createDatasetHelper } from '#libs/js-dataset-helper'
import { createInstanceMap } from '#libs/js-cache'
import { createConfig } from '#libs/js-config'
import { PluginHost } from '#libs/js-plugin'
import DOMHelper from '#libs/js-dom-helper'
import requestHelper from '#libs/js-request-helper'
import MiddlewareFactory from '#libs/js-middleware-factory'

const FORM_CLASS_NAME = 'ajax-form-submit'
const FORM_INIT_CLASS_NAME = `${FORM_CLASS_NAME}-initialized`
const FORM_APPLY_CLASS_NAME = `${FORM_CLASS_NAME}-apply`

const EVENT_SUBMIT = `submit`
const EVENT_RESET = `reset`
const EVENT_LIFECYCLE_BEFORE = `${FORM_CLASS_NAME}:before`
const EVENT_LIFECYCLE_INVALID = `${FORM_CLASS_NAME}:invalid`
const EVENT_LIFECYCLE_REQUEST = `${FORM_CLASS_NAME}:request`
const EVENT_LIFECYCLE_RESPONSE = `${FORM_CLASS_NAME}:response`
const EVENT_LIFECYCLE_AFTER = `${FORM_CLASS_NAME}:after`
const EVENT_LIFECYCLE_ERROR = `${FORM_CLASS_NAME}:error`
const EVENT_APPLY = `${FORM_CLASS_NAME}:apply`
const EVENT_TRIGGER = `${FORM_CLASS_NAME}:trigger`
const EVENT_PAGE_UPDATE = `${FORM_CLASS_NAME}:page-update`
const EVENT_UPLOAD_START = `${FORM_CLASS_NAME}:upload-start`
const EVENT_UPLOAD_STOP = `${FORM_CLASS_NAME}:upload-stop`

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
  request: {
    from: {
      global: key => window[key] ?? key,
      localStorage: key => localStorage.getItem(key) ?? key
    }
  },
  response: {
    create: value => ({ code: 200, data: { item: value?.data, page: value?.page } }),
    checkResponse: res => res?.code === 200,
    getData: res => res?.data?.item,
    getPage: res => res?.data?.page,
    getError: (error = {}) => (
      (AjaxFormSubmit.config.i18n?.code?.[error.code] || error.code) ||
      (AjaxFormSubmit.config.i18n?.status?.[error.status] || error.status) ||
      error.message || error
    )
  },
  getCsrfToken: () => ({
    header: querySelector('meta[name="_csrf_header"]')[0]?.content || 'X-CSRF-TOKEN',
    token: querySelector('meta[name="_csrf"]')[0]?.content || ''
  })
}

let formSubmitAuto = { all: [] }
SubmitHandler.add('ajax', requestHelper.request)
SuccessHandler.add('apply', handleEvent(EVENT_APPLY))
SuccessHandler.add('trigger', handleEvent(EVENT_TRIGGER))
SuccessHandler.add('reset', handleEvent(EVENT_RESET))

export default class AjaxFormSubmit {
  static config = {}
  static submitHandler = SubmitHandler
  static successHandler = SuccessHandler
  static resetHandler = ResetHandler
  static domHelper = DOMHelper
  static middleware = new MiddlewareFactory()
  static instance = createInstanceMap(
    el => elementIs(el, 'form') && hasClass(el, FORM_CLASS_NAME) && !hasClass(el, FORM_INIT_CLASS_NAME),
    el => new AjaxFormSubmit(el))

  #root
  #config
  #parameters
  #datasetHelper
  #domHelper
  #controls
  #triggers
  #plugins
  #middlewares
  #submitHandler
  #successHandler
  #resetHandler

  constructor(root, opts = {}) {
    this.#root = elementIs(root, 'form') ? root : document.createElement('form')
    this.#root.noValidate = true
    this.#config = createConfig(opts.config || {}, AjaxFormSubmit.config, DEFAULT_CONFIG)
    this.#parameters = {}

    const { prefix } = this.#config.get('prefix')
    this.#datasetHelper = createDatasetHelper(prefix)
    this.#readFormConfig()

    const { basePath } = this.#config.get('basePath')
    this.#domHelper = new DOMHelper({ prefix, basePath })
    this.#controls = this.#initUIControls(opts.control)
    this.#triggers = this.#initTriggers(opts.trigger)
    this.#plugins = this.#initPlugins(opts.plugin)
    this.#middlewares = opts.middleware || {}
    this.#submitHandler = this.#initSubmitHandler()
    this.#successHandler = this.#initSuccessHandler(opts.success)
    this.#resetHandler = new ResetHandler(this.#root)

    // TODO could't found when successHandler property in opts
    this.#resetHandler.add('empty', this.#successHandler.before)
    this.#initAutoSubmit()

    registerEvent(this.#root, EVENT_SUBMIT, event => {
      stopDefaultEvent(event)
      this.submitSync()
    })
    registerEvent(this.#root, EVENT_APPLY, this.#handleEventApplied.bind(this))
    registerEvent(this.#root, EVENT_TRIGGER, this.#handleEventTriggered.bind(this))
    registerEvent(this.#root, EVENT_PAGE_UPDATE, this.#handleEventPageUpdate.bind(this))
    registerEvent(this.#root, EVENT_RESET, this.#handleEventReset.bind(this))
    addClass(this.#root, FORM_INIT_CLASS_NAME)
  }

  submit(opts = {}) {
    const { data, ...options } = { ...opts, ...this.#generateDataAndProps(opts.parameter)}
    return this.#handleBefore(data, options)
      .then(request => this.#handleValidation(request, options))
      .then(request => this.#handleRequest(request, options))
      .then(({ request, response }) => this.#handleResponse(request, response, options))
      .then(({ request, response }) => this.#handleAfter(request, response, options))
      .catch(error => {
        // TODO refactor handleError
        switch (error?.message) {
          case ERROR_VALIDATION:
            break
          case ERROR_CONFIRM:
            this.#resetUIControls()
            break
          default:
            this.#handleError(error, options)
            throw error
        }
      })
  }

  submitSync(opts) {
    this.submit(opts).catch(_ => {})
  }

  #readFormConfig() {
    let instanceConfig = this.#config.getSource(0) || {}
    createProperty(this.#getParameters('config')).forEach(config => {
      for (const [key, values] of objectEntries(config)) {
        if (hasValue(values[0]))
          instanceConfig[key] = values[0]
      }
    })
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

  #initUIControls(controls = {}) {
    assert(isObject(controls), 1, OBJECT)
    let result = {}
    for (const [key, { name }] of objectEntries(UI_CONTROLS)) {
      result[key] = [
        ...querySelector(this.#getParameters(key)),
        ...querySelector(`.${name}`, this.#root)
      ]
    }
    for (const [type, value] of objectEntries(controls))
      querySelector(value).forEach(elem => result[type]?.push(elem))
    return result
  }

  #initTriggers(triggers = []) {
    assert(isArray(triggers), 1, ARRAY)
    const props = createProperty(this.#getParameters('trigger'))[0]
    const attrName = this.#datasetHelper.keyToAttrName('trigger')
    const result = [
      ...querySelector(triggers),
      ...querySelector(props?.value),
      ...querySelector(`button[type="submit"], button:not([type]), [${attrName}]`, this.#root)
    ]

    // TODO event setting
    result.forEach(el => {
      if (elementIs(el, TRIGGER_CLICKABLE)) {
        this.#controls.disable.push(el)
        if (!elementIs(el, 'button') || !this.#root.contains(el))
          registerEvent(el, 'click', event => this.submitSync())
      } else {
        registerEvent(el, 'change', event => this.submitSync())
      }
    })
    return result
  }


  #initPlugins(plugins = []) {
    assert(isArray(plugins), 1, ARRAY)
    const host = new PluginHost(this.#root)
    const result = [
      ...querySelector(plugins),
      ...querySelector(this.#getParameters('plugin')),
    ]
    result.forEach(el => host.addPlugin(el))
    return host
  }

  #initSuccessHandler(handlerProps = {}) {
    assert(isObject(handlerProps), 1, OBJECT)
    return new SuccessHandler({
      root: this.#root,
      domHelper: this.#domHelper,
      handlerProps,
      ...this.#config.get(['prefix', 'basePath']),
    })
  }

  #initAutoSubmit() {
    // TODO need refactor
    if (!(this.#datasetHelper.keyToDatasetName('auto') in this.#root.dataset))
      return

    const parameter = this.#getParameters('auto')[0]
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
  }

  // TODO finetune middleware args
  // TODO implement abortable
  #handleBefore(request, opts) {
    return this.#plugins.ready()
      .then(() => this.#getMiddleware('before', opts)({ request, root: this.#root }))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(result => {
        const data = { request: result }
        this.#plugins.broadcast(EVENT_LIFECYCLE_BEFORE, data)
        this.#resetUIControls()
        this.#successHandler.before(opts, data)
        return result
      })
  }

  #handleValidation(request, opts) {
    const fields = new Set()
    const attrName = this.#datasetHelper.keyToAttrName('validation')
    const groups = this.#queryFormInput(`[${attrName}][required]`).reduce((acc, input) => {
      input.setCustomValidity('')
      const group = input.getAttribute(attrName)
      acc[group] ||= []
      acc[group].push(input)
      return acc
    }, {})

    for (const [group, inputs] of objectEntries(groups)) {
      if (inputs.some(input => isNotBlank(input.value))) {
        inputs.forEach(input => !isNotBlank(input.value) && (input.disabled = true))
      } else {
        inputs[0]?.setCustomValidity(AjaxFormSubmit.config.i18n?.validation?.[group] || group)
      }
    }

    this.#queryFormInput().forEach(el => {
      !el.validity.valid && fields.add(el.name)
      el.disabled = false
    })
    
    //TODO middleware validation
    return this.#getMiddleware('validation', opts)({ request, root: this.#root }).then(result => {
      toArray(result).filter(isNotBlank).forEach(fields.add, fields)

      if (fields.size > 0) {
        this.#root.reportValidity()
        this.#plugins.broadcast(EVENT_LIFECYCLE_INVALID)
        showElements(this.#controls.messageValidation)
        throw new Error(ERROR_VALIDATION)
      }
      return request
    })
  }

  #handleRequest(request, opts) {
    const type = this.#getParameters('type', opts)[0] || 'ajax'

    // TODO refactor for sse, websocket, download file
    // TODO querystring
    const requestParams = {
      method: this.#getParameters('method', opts)[0],
      url: this.#getParameters('action', opts, opts.url)[0],
      enctype: this.#getParameters('enctype', opts)[0],
      csrf: this.#config.get('getCsrfToken')['getCsrfToken']?.(),
      headers: opts.header
    }

    enableElements(this.#controls.enable)
    disableElements(this.#controls.disable)
    showElements(this.#controls.show)
    hideElements(this.#controls.hide)

    return delay(this.#config.get('delay').delay)
      .then(() => this.#getMiddleware('request', opts)({ request, root: this.#root}))
      .then(result => hasValue(result?.request) ? result.request : request)
      .then(result => {
        const data = { request: result }
        this.#plugins.broadcast(EVENT_LIFECYCLE_REQUEST, data)
        this.#successHandler.request(opts, data)
        return this.#submitHandler.run(type, opts, result, requestParams)
          .then(res => ({ ...data, response: res }))
      })
  }

  #handleResponse(request, response, opts) {
    const { checkResponse } = this.#config.get('response.checkResponse')

    return this.#getMiddleware('response', opts)({ request, response, root: this.#root})
      .then(result => hasValue(result?.response) ? result.response : response)
      .then(result => checkResponse(result) ? result : Promise.reject(result))
      .then(result => {
        const data = { request, response: result }
        this.#plugins.broadcast(EVENT_LIFECYCLE_RESPONSE, data)
        triggerEvent(this.#controls.progress, EVENT_UPLOAD_STOP)
        this.#resetUIControls()
        this.#successHandler.response(opts, data)
        return data
      })
  }

  #handleAfter(request, response, opts) {
    const { getData, getPage } = this.#config.get(['response.getData', 'response.getPage'])

    return this.#getMiddleware('after', opts)({ request, response, root: this.#root}).then(_ => {
      const data = {
        request,
        response: getData(response),
        page: getPage(response)
      }
      this.#plugins.broadcast(EVENT_LIFECYCLE_AFTER, data)
      showElements(this.#controls.messageSuccess)
      this.#successHandler.after(opts, data)
      return data
    })
  }

  #handleError(error, opts) {
    console.error(error)
    const { getError } = this.#config.get(['response.getError'])
    this.#plugins.broadcast(EVENT_LIFECYCLE_AFTER, { error })
    triggerEvent(this.#controls.progress, EVENT_UPLOAD_STOP)
    this.#resetUIControls()
    
    const updatedError = { ...error, message: getError(error) }
    const messageError = this.#controls.messageError
    if (isArray(messageError) && messageError.length > 0) {
      this.#getMiddleware('error', opts)(updatedError).then(result => {
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
    triggerEvent(this.#controls.progress, EVENT_UPLOAD_START, [percent])
  }

  #handleEventApplied(event) {
    stopDefaultEvent(event)
    this.#parameters.apply ||= {}
    const attrName = this.#datasetHelper.keyToAttrName('applied')
    const payload = {
      request: event?.detail?.request,
      response:  event?.detail?.response,
    }

    for (const [type, applyData] of objectEntries(payload)) {
      let targets = []
      if (isObject(applyData)) {

        for (const [key, values] of objectEntries(applyData)) {
          const allAttr = `[${attrName}="${key}"]`
          const typeAttr = `[${attrName}-${type}="${key}"]`

          // TODO use createProperty
          this.#queryFormInput(`${allAttr},${typeAttr}`)
            .forEach(({ name }) => this.#parameters.apply[name] = values)
        }

      } else if (hasValue(applyData)) {

        // TODO need refactor
        this.#queryFormInput(`[${attrName}="${FORM_APPLY_CLASS_NAME}-${type}"]`)
          .forEach(({ name }) => this.#parameters.apply[name] = valueToString(applyData))
      }
    }
  }

  #handleEventTriggered(event) {
    this.#handleEventApplied(event)
    this.submitSync({ parameter: event?.detail?.props?.parameter })
  }

  #handleEventPageUpdate(event) {
    stopDefaultEvent(event)
    const { pagination } = this.#config.get('pagination')
    const { detail } = event
    this.#parameters.page = {
      [pagination.page]: detail[pagination.page],
      [pagination.size]: detail[pagination.size],
    }
    this.submitSync({ parameter: ['page', ...(detail.parameters ?? [])] })
  }

  #handleEventReset(event) {
    this.#plugins.broadcast(EVENT_RESET)
    this.#resetUIControls()
    this.#resetHandler.run(createProperty(this.#getParameters('reset'))[0])
  }

  #getParameters(key, opts, defaultValue) {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)

    const kebabKey = toKebabCase(key)

    if (isObject(opts)) {
      const camelKey = toCamelCase(key)
      const value = opts[camelKey] ?? opts[kebabKey] ?? opts.property?.[camelKey] ?? opts.property?.[kebabKey]
      if (hasValue(value))
        return toArray(value)
    }

    const dataAttrValue = this.#datasetHelper.getValue(this.#root, kebabKey)
    if (isNotBlank(dataAttrValue))
      return toArray(dataAttrValue)

    const attrValue = this.#root.getAttribute(kebabKey)
    if (isNotBlank(attrValue))
      return toArray(attrValue)

    return toArray(defaultValue)
  }

  #getMiddleware(lifecycle, opts) {
    const attrName = `middleware-${lifecycle}`
    const middleware = opts.property?.[attrName] ?? this.#middlewares?.[lifecycle]
    const props = this.#datasetHelper.getValue(this.#root, attrName, middleware)
    return AjaxFormSubmit.middleware.create(props)
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

  #queryFormInput(selector) {
    const inputs = [
      ...this.#root.elements,
      ...querySelector(this.#getParameters('input'))
    ]
    return inputs.filter(el => !el.disabled && isNotBlank(el.name)).reduce((acc, el) => {
      if (isNotBlank(selector)) {
        el.matches(selector) && acc.push(el)
      } else {
        acc.push(el)
      }
      return acc
    }, [])
  }

  #generateDataAndProps(parameter = []) {
    const { from } = this.#config.get('request.from')
    const groups = {}
    for (const el of this.#queryFormInput()) {
      const toProp = createProperty(this.#datasetHelper.getValue(el, 'to'))[0]
      const toType = toProp.type[0] ?? toProp?.value[0] ?? 'data'
      const { exist, value } = endsWith(el.name, '[]')
      groups[toType] ||= {}
      const target = groups[toType]
      if (hasValue(target[value]) || exist) {
        target[value] = toArray(target[value])
        target[value].push(el)
      } else {
        target[value] = el
      }
    }

    const result = {}
    for (const [type, group] of objectEntries(groups)) {
      result[type] ||= {}
      for (const [name, el] of objectEntries(group)) {
        let value
        if (isArray(el)) {
          value = toArray(el).map(elem => this.#getElementValue(elem, from, true)).flat().filter(hasValue)
          value = elementIs(el[0], HTML_RADIO) ? value[0] : value
        } else {
          value = this.#getElementValue(el, from)
        }
        setNestedValue(result[type], name, value)
      }
    }

    PARAMETER.forEach(({ name, required }) => {
      if (required || parameter.includes(name))
        objectEntries(this.#parameters[name])
          .forEach(([key, value]) => result.data[key] = value)
    })

    return deepFilterArrays(result)
  }

  #getElementValue(el, getFrom, multiple) {
    let result
    const { type, value, checked, files } = el
    switch(type) {
      case 'date':
      case 'datetime-local':
        return isNotBlank(value) ? new Date(value).getTime() : ''
      case 'file':
        return el.multiple ? toArray(files) : files[0]
      case 'select-multiple':
        return toArray(el.selectedOptions).map(opts => opts.value)
      case HTML_CHECKBOX:
        result = multiple ? (checked ? value : undefined) : checked
        break
      case HTML_RADIO:
        result = checked ? value : undefined
        break
      default:
        result = el.value
    }

    if (result !== undefined) {
      const {
        type: [fromType],
        value: [pattern]
      } = createProperty(this.#datasetHelper.getValue(el, 'from'))[0]
      const key = formatString(pattern, result)
      return getFrom?.[fromType]?.(key) ?? key
    }
  }
}

function setNestedValue(obj, name, value) {
  if (!hasValue(value))
    return

  const keys = name.replace(/\[(\d*)\]/g, (_, i) => i ? `.${i}` : '.[]').split('.')
  keys.reduce((acc, key, index) => {
    if (index === keys.length - 1) {
      if (key === '[]') {
        if (!isArray(acc))
          acc = []
        acc.push(...toArray(value))
      } else if (hasValue(acc[key])) {
        if (!isArray(acc[key]))
          acc[key] = [acc[key]]
        acc[key].push(value)
      } else {
        acc[key] = value
      }
    } else {
      if (key === '[]') {
        if (!isArray(acc))
          acc[key] = []
      } else if (!acc[key]) {
        const nextKey = keys[index + 1]
        acc[key] = /^\d+$/.test(nextKey) || nextKey === '[]' ? [] : {}
      }
    }
    return acc[key]
  }, obj)
}

function deepFilterArrays(obj) {
  if (obj instanceof File || obj instanceof Blob || obj instanceof Date)
    return obj

  if (isArray(obj)) {
    return obj.filter(hasValue).map(deepFilterArrays)
  } else if (isObject(obj)) {
    return Object.fromEntries(
      objectEntries(obj).map(([key, value]) => [key, deepFilterArrays(value)])
    )
  }
  return obj
}

window.AjaxFormSubmit = AjaxFormSubmit
window.addEventListener('DOMContentLoaded', event => {
  const selector = `.${FORM_CLASS_NAME}`
  querySelector(selector).forEach(form => AjaxFormSubmit.instance.create(form))
  registerMutationObserver(el =>
    querySelector(selector, el, true).forEach(form => AjaxFormSubmit.instance.create(form)))

  const parameter = [ 'querystring' ]
  for (const [key, value] of objectEntries(formSubmitAuto)) {
    toArray(value).forEach(form => form.submit({ parameter }).catch(_ => {}))
  }
}, { once: true })
