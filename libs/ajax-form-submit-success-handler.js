import { OBJECT, FUNCTION, STRING_NON_BLANK } from './js-constant.js'
import {
  assert,
  formatUrl,
  hasValue,
  isTrue,
  isArray,
  isObject,
  isFunction,
  isString,
  isNotBlank,
  isElement,
  toArray,
  startsWith,
  objectKeys,
  valueToString,
  findObjectValue,
  addBasePath
} from './js-utils.js'

import { triggerEvent, showElements, hideElements, getTargets } from './js-dom-utils.js'
import { createDatasetHelper } from '#libs/js-dataset-helper'
import { createProperty } from './js-property-factory.js'

const ATTR_KEY = 'success'
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

  #payload
  #defaultProps
  
  constructor(opts = {}) {
    const { handlerProps, ...rest } = opts
    const datasetHelper = createDatasetHelper(opts.prefix)
    this.#payload = { datasetHelper, ...rest }
    this.#defaultProps = handlerProps || {}
    datasetHelper.getKeys(opts.root, ATTR_KEY).forEach(({ key, name }) => {
      const props = datasetHelper.getValue(opts.root, key)
      const current = this.#defaultProps[name]
      this.#defaultProps[name] = hasValue(current) ? [...toArray(current), props] : props
    })
    
    for (const lifecycle of LIFECYCLES) {
      this[lifecycle.name] = (opts, input, output) => this.#run(lifecycle, opts, input, output)
    }
  }

  #run(lifecycle, opts, input, output) {
    const types = new Set(objectKeys(this.#defaultProps))
    objectKeys(opts.property || {}).forEach(type => {
      const { exist, value } = startsWith(type, `${ATTR_KEY}-`)
      exist && types.add(value)
    })

    for (const type of types) {
      const handler = HANDLERS[type]?.[lifecycle.name]
      lifecycle.required && assert(isFunction(handler), `Could not find "${type}" in successHandler`)

      const payloadProps = opts.property?.[`${ATTR_KEY}-${type}`]
      const defaultProps = this.#defaultProps[type]
      createProperty([defaultProps, payloadProps].flat())
        .forEach(props => handler?.(input, output, props, { ...this.#payload, ...opts }))
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
    before: (input, output, { target }, { parameter, domHelper, datasetHelper }) => {
      getTargets(target).forEach(elem => {
        const props = createProperty(datasetHelper.getValue(elem, 'template'))[0]
        !parameter?.includes('append') && !isTrue(props.append?.[0]) && domHelper?.clearElement?.(elem)
      })
    },
    request: (input, output, { target }, { domHelper, datasetHelper }) => {
      const mock = toArray({ length: input?.size || 1 }, () => ({}))
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
        if (isString(val)) {
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
