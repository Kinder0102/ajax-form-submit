import { OBJECT, FUNCTION, STRING_NON_BLANK } from './js-constant.js'
import {
  assert,
  formatUrl,
  isTrue,
  isArray,
  isObject,
  isFunction,
  isNotBlank,
  hasValue,
  objectKeys,
  objectEntries,
  valueToString,
  findObjectValue,
  addBasePath
} from './js-utils.js'

import {
  isElement,
  querySelector,
  triggerEvent,
  showElements,
  hideElements,
  getTargets
} from './js-dom-utils.js'

import { createProperty } from './js-property-factory.js'

const CLASS_NAME = 'ajax-form-submit-success'
const SKELETON_CLASS_NAME = `${CLASS_NAME}-skeleton`
const HANDLERS = {}
const LIFECYCLES = [
  { name: 'before' },
  { name: 'validation' },
  { name: 'request' },
  { name: 'response' },
  { name: 'after', required: true },
  { name: 'error' },
]

addHandler('redirect', handleRedirect)
addHandler('show', handleShow)
addHandler('hide', handleHide)
addHandler('querystring', handleUpdateQueryString)
addHandler('storage', handleStorage)
addHandler('display', handleDisplay())
addHandler('event', handleEvent())

export default class AjaxFormSubmitSuccessHandler {

  static add = addHandler

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
    this.#registerLifecycleMethod() 
  }

  #registerLifecycleMethod() {
    for (const lifecycle of LIFECYCLES) {
      this[lifecycle.name] = (opts, input, output, type) => this.#run(lifecycle, opts, input, output, type)
    }
  }

  #run(lifecycle, opts, input, output, type) {
    this.#updateHandlerProps(opts)
    const types = objectKeys(this.#handlerProps)
    if (isNotBlank(type) && !types.includes(type))
      return

    const selectTypes = type ? [ type ] : types
    for (const selectType of selectTypes) {
      const handler = HANDLERS[selectType]?.[lifecycle.name]
      lifecycle.required && assert(isFunction(handler), `Could not find "${selectType}" in successHandlers`)
      this.#handlerProps[selectType]
        .forEach(prop => handler?.(input, output, prop, { ...this.#payload, ...opts }))
    }
  }

  #updateHandlerProps(handlerProps) {
    this.#handlerProps = {}
    for (const [key, value] of objectEntries(this.#defaultHandlerProps)) {
      this.#handlerProps[key] = createProperty(value)
    }

    for (const [key, value] of objectEntries(handlerProps)) {
      if (key.includes(this.#attrInputName))
        this.#handlerProps[key.replace(this.#attrRegex, '')] = createProperty(value)
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

function addHandler(type, callback) {
  assert(isNotBlank(type), 1, STRING_NON_BLANK)
  if (isFunction(callback)) {
    HANDLERS[type] = { after: callback }
  } else if (isObject(callback)) {
    HANDLERS[type] = LIFECYCLES.reduce((acc, { name, required }) => {
      isFunction(callback[name]) && (acc[name] = callback[name])
      required && assert(hasValue(acc[name]), `handler.${name} must be Function`)
      return acc
    }, {})
  } else {
    assert(false, 1, [OBJECT, FUNCTION])
  }
}

export function handleEvent(defaultEventName) {
  return (input, output, { target, event, ...props }, { root }) => {
    const events = new Set(event)
    if (isNotBlank(defaultEventName) && events.size === 0)
      events.add(defaultEventName)

    getTargets(target, root).forEach(elem => events.forEach(eventName =>
      triggerEvent(elem, eventName, { input, output, props })))
  }
}

function handleRedirect(input, output, { target, type, param }, { basePath }) {
  let url = target?.[0]

  switch(type?.[0]) {
    case 'back':
      history.back()
      break
    case 'anchor':
      if (!isNotBlank(url)) {
        window.scrollTo({ top: 0 })
      } else {
        document.querySelector(url)?.scrollIntoView({ block: 'start' })
      }
      break
    default:
      if (!isNotBlank(url)) {
        location.reload()
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
}

function handleDisplay() {
  const group = 'skeleton'
  return {
    before: (input, output, { target }, { append, domHelper, datasetHelper }) => {
      getTargets(target).forEach(elem => {
        const props = createProperty(datasetHelper.getValue(elem, 'template'))[0]
        !isTrue(append) && !isTrue(props.append?.[0]) && domHelper?.clearElement?.(elem)
      })
    },
    request: (input, output, { target }, { domHelper, datasetHelper }) => {
      const mock = Array.from({ length: input.size || 1 }, () => ({}))
      getTargets(target).forEach(elem => {
        const { skeleton: [template] = [] } = createProperty(datasetHelper.getValue(elem, 'template'))[0]
        isNotBlank(template) && domHelper?.setValueToElement?.(elem, mock, { template, group })
      })
    },
    after: (input, output, { target }, { domHelper }) => {
      getTargets(target).forEach(elem => {
        domHelper?.clearElement?.(elem, group)
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

function handleUpdateQueryString(input, output, { add, remove, value }) {
  const { host, protocol, pathname } = location
  const includes = new Set([ ...(add || []), ...(value || []) ])
  const excludes = new Set(remove || [])
  const url = new URL(`${protocol}//${host}${pathname}`)
  const searchParams = url.searchParams
  const hasIncludes = includes.size > 0
  const hasExcludes = !hasIncludes && excludes?.size > 0

  objectKeys(input).forEach(key => {
    if (hasIncludes ? includes.has(key) : hasExcludes ? !excludes.has(key) : true) {
      const val = input[key]
      if (isArray(val)) {
        searchParams.delete(key)
        val.forEach(item => searchParams.append(key, item))
      } else if (isObject(val)) {
        searchParams.set(key, JSON.stringify(val))
      } else if (hasValue(val)) {
        if (typeof val === 'string') {
          isNotBlank(val) ? searchParams.set(key, val) : searchParams.delete(key)
        } else {
          searchParams.set(key, val)
        }
      } else {
        searchParams.delete(key)
      }
    }
  })
  
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
      const { exist, value } = findObjectValue(data, key)
        exist && localStorage.setItem(storageKey, valueToString(value))
    }
  })
}
