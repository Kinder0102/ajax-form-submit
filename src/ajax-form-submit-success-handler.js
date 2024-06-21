import {
  assert,
  formatUrl,
  startsWith,
  isTrue,
  isArray,
  isObject,
  isFunction,
  isNotBlank,
  hasValue,
  valueToString,
  stringToValue,
  findObjectValue,
  addBasePath
} from './js-utils'

import {
  isElement,
  querySelector,
  triggerEvent,
  showElements,
  hideElements,
  getTargets
} from './js-dom-utils'

import DOMHelper from './js-dom-helper'
import { createHandler } from './js-handler-factory'
import { createDatasetHelper } from './js-dataset-helper'

const PREFIX = 'afs'
const BASE_PATH = '/'
const LIFECYCLES = {
  before: { name: 'before', required: false },
  validation: { name: 'validation', required: false },
  request: { name: 'request', required: false },
  response: { name: 'response', required: false },
  after: { name: 'after', required: true },
  error: { name: 'error', required: false },
}
let GLOBAL_HANDLERS = {
  redirect: createSuccessHandler(handleRedirect),
  show: createSuccessHandler(handleShow),
  hide: createSuccessHandler(handleHide),
  querystring: createSuccessHandler(handleUpdateQueryString),
  storage: createSuccessHandler(handleStorage),
  display: createSuccessHandler(handleDisplay()),
}

export default class AjaxFormSubmitSuccessHandler {

  static addSuccessHandler = (type, handler) => {
    assert(isNotBlank(type), 1, 'NonBlankString')
    GLOBAL_HANDLERS[type] = createSuccessHandler(handler)
  }

  constructor(settings, opt = {}) {
    assert(isObject(settings), 1, 'Object')
    const {
      prefix,
      basePath,
      applyEventName,
      triggerEventName,
      toggleEventName
    } = opt

    this.handlerProps = {}
    this.data = {
      prefix: prefix || PREFIX,
      basePath: basePath || BASE_PATH,
      globalValue: {}
    }
    this.data.datasetHelper = createDatasetHelper(this.data.prefix)
    this.data.domHelper = new DOMHelper({
      prefix: this.data.prefix,
      basePath: this.data.basePath
    })
    this.handlers = {
      apply: createSuccessHandler(handleEvent(applyEventName)),
      trigger: createSuccessHandler(handleEvent(triggerEventName)),
      toggle: createSuccessHandler(handleEvent(toggleEventName))
    }

    for (const [key, value] of Object.entries(settings)) {
      this.handlerProps[key] = createHandler(value)
    }
    for (const [key, value] of Object.entries(GLOBAL_HANDLERS)) {
      this.handlers[key] = value
    }

    Object.values(LIFECYCLES).forEach(lifecycle => {
      this[lifecycle.name] = (el, input, output, type) => this._run(lifecycle, el, input, output, type)
    })
  }

  _run(lifecycle, el, input, output, type) {
    const settingTypes = Object.keys(this.handlerProps)
    if (isNotBlank(type) && !settingTypes.includes(type))
      return

    let result = {}
    const selectTypes = type ? [ type ] : settingTypes
    selectTypes.forEach(selectType => {
      const props = this.handlerProps[selectType]
      const successHandler = this.handlers[selectType]?.[lifecycle.name]
      if (lifecycle.required) {
        assert(isFunction(successHandler), `Could not find "${selectType}" in submitHandlers`)
      }
      
      result[selectType] = successHandler?.(el, input, output, props, this.data)
    })
    return result
  }
}

function createSuccessHandler(handler) {
  if (isFunction(handler)) {
    return {
      [LIFECYCLES.after.name]: handler
    }
  } else if (isObject(handler)) {
    Object.values(LIFECYCLES).forEach(({ name }) => {
      handler[name] && assert(isFunction(handler[name]), `handler.${name} must be Function`)
    })
    return handler
  } else {
    assert(false, 2, 'Function or Object')
  }
}

function handleRedirect(el, input, output, { target, param }, { basePath }) {
  if (!hasValue(target) || target.length < 1) {
    location.reload()
    return
  }

  let url = target[0]

  if (url === 'back') {
    history.back()
  } else if (startsWith(url, '#').exist) {
    if (url === '#top') {
      window.scrollTo({ top: 0 })
    } else {
      document.querySelector(url)?.scrollIntoView({ block: 'start' })
    }
  } else {
    const outputObj = isObject(output) ? output : { value: output }
    url = addBasePath(formatUrl(formatUrl(target[0], input), outputObj), basePath)
    let params = new URLSearchParams()
    param?.forEach?.(key => {
      const inputValue = findObjectValue(input, key)
      const outputValue = findObjectValue(outputObj, key)
      inputValue.exist && params.set(key, inputValue.value)
      outputValue.exist && params.set(key, outputValue.value)
    })

    if (params.size > 0)
      url += `?${params.toString()}`

    location.href = url
  }
  return true
}

function handleDisplay() {
  return {
    before: (el, input, output, props, { domHelper, datasetHelper }) => {
      const { target } = props
      getTargets(target).forEach(elem => {
        const isAppend = isTrue(datasetHelper.getValue(elem, 'append'))
        !isAppend && domHelper?.clearElement?.(elem)
      })
      return true
    },
    request: (el, input, output, props, { domHelper }) => {
      const { target, skeleton } = props
      if (!skeleton?.[0] || !input.size)
        return

      const mockOutput = Array.from({ length: input.size }, () => ({}))
      getTargets(target).forEach(elem =>
        domHelper?.setValueToElement?.(elem, mockOutput, skeleton[0]))
      return true
    },
    after: (el, input, output, props, { domHelper }) => {
      const { target, append } = props
      let result = true
      getTargets(target).forEach(elem => {
        querySelector('.ajax-form-submit-skeleton', elem).forEach(skeleton => skeleton.remove())
        const notEmpty = domHelper?.setValueToElement?.(elem, output)
        result &&= notEmpty
      })
      return result
    }
  }
}

function handleShow(el, input, output, { target }) {
  showElements(getTargets(target, el))
  return true
}

function handleHide(el, input, output, { target }) {
  hideElements(getTargets(target, el))
  return true
}

function handleEvent(defaultEventName) {
  return (el, input, output, { target, event }) => {
    let eventSet = new Set(event)
    if (eventSet.size === 0)
      eventSet.add(defaultEventName)

    const payload = { input, output }
    const targetForms = getTargets(target, el)
    if (isElement(el) && targetForms.length === 0) {
      targetForms.push(el)
    }

    eventSet.forEach(eventName => {
      targetForms.forEach(elem => triggerEvent(elem, eventName, payload))
    })

    return true
  }
}

function handleUpdateQueryString(el, input, output, { target }) {
  if (!URL || !location || !history || !history.pushState)
    return

  const { host, protocol, pathname } = location
  const includes = []
  const excludes = []
  const url = new URL(`${protocol}//${host}${pathname}`)
  
  target.forEach(str => {
    const { exist, value } = startsWith(str, '-')
    exist ? excludes.push(value) : includes.push(value)
  })

  if (includes.length > 0) {
    for(const key in input){
      if (includes.includes(key)) {
        setQueryString(url, key, input[key])
      }
    }
  } else {
    for(const key in input){
      if (!excludes.includes(key)) {
        setQueryString(url, key, input[key])
      }
    }
  }
  history.replaceState({ path: url.href }, '', url.href)
  return true
}

function handleStorage(el, input, output, { target, value }, { prefix, globalValue }) {
  const elemKey = isElement(el) ? (el.id || el.name || '') : ''
  const storageKey = `${prefix}-${elemKey}`
  const data = { input, output }
  let callback = () => {}
  target?.forEach(storageType => {
    switch(storageType) {
      case 'cookie':
        break
      case 'localStorage':
        callback = setlocalStorage
        break
    }

    value?.filter(key => isNotBlank(key)).forEach(key => {
      if (key === 'timestamp') {
        callback(`${storageKey}-${key}`, Date.now(), globalValue)
      } else {
        const value = findObjectValue(data, key).value
          if (hasValue(value) && isNotBlank(key))
            callback(`${storageKey}-${key}`, value, globalValue)
      }
    })    
  })
  return true
}

function setQueryString(url, key, value) {
  if (isArray(value)) {
    url.searchParams.delete(key)
    value.forEach(item => url.searchParams.append(key, item))
  } else if (isObject(value)) {
    url.searchParams.set(key, JSON.stringify(value))
  } else if (hasValue(value)) {
    url.searchParams.set(key, value)
  }
}

function setlocalStorage(key, value, globalValue) {
  globalValue['handleStorage'] ||= {}
  globalValue['handleStorage'][key] ||= stringToValue(localStorage?.getItem(key))
  let currentValue = globalValue['handleStorage'][key]
  
  if (isArray(currentValue)) {
    currentValue.push(value)
  } else {
    currentValue = [ value ]
  }
  localStorage?.setItem(key, valueToString(currentValue))
}
