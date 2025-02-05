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

import { createProperty } from './js-property-factory'

const CLASS_NAME = 'ajax-form-submit-success'
const SKELETON_CLASS_NAME = `${CLASS_NAME}-skeleton`
const LIFECYCLES = [
  { name: 'before', required: false },
  { name: 'validation', required: false },
  { name: 'request', required: false },
  { name: 'response', required: false },
  { name: 'after', required: true },
  { name: 'error', required: false },
]

let HANDLERS = {
  redirect: createHandler(handleRedirect),
  show: createHandler(handleShow),
  hide: createHandler(handleHide),
  querystring: createHandler(handleUpdateQueryString),
  storage: createHandler(handleStorage),
  display: createHandler(handleDisplay()),
  event: createHandler(handleEvent()),
}

export default class AjaxFormSubmitSuccessHandler {

  static add = (type, callback) => {
    assert(isNotBlank(type), 1, 'NonBlankString')
    HANDLERS[type] = createHandler(callback)
  }

  #root
  #datasetHelper
  #defaultHandlerProps
  #attrKey
  #attrInputName
  #attrRegex
  #payload
  #handlerProps

  constructor(opt = {}) {
    const { handlerProps, attrKey, ...payload } = opt

    this.#root = payload.root
    this.#datasetHelper = payload.datasetHelper
    this.#defaultHandlerProps = handlerProps
    this.#attrKey = attrKey
    this.#attrInputName = this.#datasetHelper.keyToInputName(attrKey)
    this.#attrRegex = new RegExp(String.raw`_?${this.#attrInputName}-`, 'g')
    this.#payload = payload
    this.#registerLifecycle() 
  }

  #registerLifecycle() {
    for (const lifecycle of LIFECYCLES) {
      this[lifecycle.name] = (opts, input, output, type) => this.#run(lifecycle, opts, input, output, type)
    }
  }

  #run(lifecycle, opts, input, output, type) {
    this.#updateHandlerProps(opts)
    const types = Object.keys(this.#handlerProps)
    if (isNotBlank(type) && !types.includes(type))
      return

    const selectTypes = type ? [ type ] : types
    selectTypes.forEach(selectType => {
      const handler = HANDLERS[selectType]?.[lifecycle.name]
      if (lifecycle.required) {
        assert(isFunction(handler), `Could not find "${selectType}" in successHandlers`)
      }
      this.#handlerProps[selectType].forEach(prop => handler?.(input, output, prop, this.#payload))
    })
  }

  #updateHandlerProps(handlerProps) {
    this.#handlerProps = {}
    this.#defaultHandlerProps
    if (isObject(this.#defaultHandlerProps)) {
      for (const [key, value] of Object.entries(this.#defaultHandlerProps)) {
        this.#handlerProps[key] = createProperty(value)
      }
    }

    if (isObject(handlerProps)) {
      for (const [key, value] of Object.entries(handlerProps)) {
        if (key.includes(this.#attrInputName))
          this.#handlerProps[key.replace(this.#attrRegex, '')] = createProperty(value)
      }
    }

    if (isElement(this.#root)) {
      this.#datasetHelper.getKeys(this.#root, this.#attrKey).forEach(({ key, name }) => {
        const props = createProperty(this.#datasetHelper.getValue(this.#root, key))
        this.#handlerProps[name] ||= []
        this.#handlerProps[name] = this.#handlerProps[name].concat(props)
      })
    }
  }
}

function createHandler(callback) {
  if (isFunction(callback)) {
    return { after: callback }
  } else if (isObject(callback)) {
    let result = {}
    for (const { name, required } of LIFECYCLES) {
      isFunction(callback[name]) && (result[name] = callback[name])
      if (required)
        assert(isFunction(result[name]), `handler.${name} must be Function`)
    }
    return result
  } else {
    assert(false, 1, 'Function or Object')
  }
}

export function handleEvent(defaultEventName) {
  return (input, output, { target, event, ...props }, { root }) => {
    const events = new Set(event)
    if (isNotBlank(defaultEventName) && events.size === 0)
      events.add(defaultEventName)

    const payload = { input, output, props }
    getTargets(target, root).forEach(elem =>
      events.forEach(eventName => triggerEvent(elem, eventName, payload)))
  }
}

function handleRedirect(input, output, { target, param }, { basePath }) {
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
}

function handleDisplay() {
  return {
    before: (input, output, { target }, { domHelper, datasetHelper }) => {
      getTargets(target)
        .filter(elem => !isTrue(datasetHelper.getValue(elem, 'append')))
        .forEach(elem => domHelper?.clearElement?.(elem))
    },
    request: (input, output, { target, skeleton }, { domHelper }) => {
      if (!skeleton?.[0] || !input.size)
        return

      const mockOutput = Array.from({ length: input.size }, () => ({}))
      getTargets(target).forEach(elem =>
        domHelper?.setValueToElement?.(elem, mockOutput, { template: skeleton[0] }))
      return true
    },
    after: (input, output, { target }, { domHelper }) => {
      getTargets(target).forEach(elem => {
        querySelector(`.${SKELETON_CLASS_NAME}`, elem).forEach(skeleton => skeleton.remove())
        domHelper?.setValueToElement?.(elem, output)
      })
    }
  }
}

function handleShow(input, output, { target }, { root }) {
  showElements(getTargets(target, root))
}

function handleHide(input, output, { target }, { root }) {
  hideElements(getTargets(target, root))
}

function handleUpdateQueryString(input, output, { target }) {
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
}

function handleStorage(input, output, { value }, { root, prefix }) {
  if (!localStorage)
    return

  const elemKey = isElement(root) ? (root.id || root.name || '') : ''
  const storagePrefix = `${prefix}${isNotBlank(elemKey) ? '-': ''}${elemKey}`

  const data = { input, output }
  let callback = () => {}
  value?.filter(isNotBlank).forEach(key => {
    const storageKey = `${storagePrefix}-${key}`
    if (key === 'timestamp') {
      localStorage.setItem(storageKey, Date.now())
    } else {
      const value = findObjectValue(data, key).value
        if (hasValue(value) && isNotBlank(key))
          localStorage.setItem(storageKey, valueToString(value))
    }
  })
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
