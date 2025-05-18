import {
  isURL,
  isNotBlank,
  isFunction,
  isObject,
  isBoolean,
  isTrue,
  isElement,
  hasValue,
  toArray,
  objectKeys,
  objectEntries,
  split,
  findObjectValue
} from './js-utils.js'

import { querySelector } from './js-dom-utils.js'
import { createCache } from './js-cache.js'

const PROPERTY_CACHE = createCache()
const TEMPLATE_CACHE = createCache()
const FILTER_CACHE = createCache()

export const createProperty = props => {
  return toArray(props || '').map(prop => {
    if (isObject(prop)) {
      return prop
    } else if (isFunction(prop)) {
      return { type: ['function'], value: [prop] }
    } else {
      if (!PROPERTY_CACHE.has(prop)) {
        let result = { type: [], value: [] }
        split(prop, '|').forEach(token => {
          if (isURL(token)) {
            result.value.push(token)
          } else {
            let [key, value] = token.includes(':') ? split(token, ':') : [null, token]
            const escapedKey = key?.replace(/\\(.)/g, '$1')
            const values = split(value, ',').map(value => value.replace(/\\(.)/g, '$1'))
            isNotBlank(escapedKey) ? (result[escapedKey] = values) : result.value.push(...values)
          }
        })
        PROPERTY_CACHE.set(prop, result)
      }
      return PROPERTY_CACHE.get(prop)
    }
  })
}

export const createTemplateHandler = templateProp => {
  if (TEMPLATE_CACHE.has(templateProp))
    return TEMPLATE_CACHE.get(templateProp)

  let handler = {}
  if (isElement(templateProp)) {
    handler.getTemplate = item => templateProp
  } else if (!isNotBlank(templateProp)) {
    handler.getTemplate = createDefaultTemplate
  } else {
    const props = createProperty(templateProp)[0]
    const templateTags = querySelector('template').map(elem => elem.content)
    const selectors = objectEntries(props).reduce((acc, [ key, values ]) => {
      if (key.includes('.')) {
        const [enumType, enumValue] = split(key, '.')
        acc[enumType] ||= {}
        acc[enumType][enumValue] = props[key][0]
      }
      return acc
    }, {})

    handler.getTemplate = item => {
      let selector = props.value[0]
      for (const [key, values] of objectEntries(selectors)) {
        const { exist, value } = findObjectValue(item, key)
        if (exist && hasValue(values[value])) {
          selector = values[value]
          break
        }
      }
      let result = templateTags.map(tag => querySelector(selector, tag)).flat()[0]?.cloneNode?.(true)
      result ||= createDefaultTemplate(item)
      result.removeAttribute?.('id')
      return result
    }
  }
  TEMPLATE_CACHE.set(templateProp, handler)
  return handler
}

export const createFilter = filterProp => {
  const props = createProperty(filterProp)[0]
  const comparables = props.value.reduce((acc, prop) => {
    const comparable = Comparable.create(prop)
    acc[comparable.key] ||= []
    acc[comparable.key].push(comparable)
    return acc
  }, {})
  const keys = objectKeys(comparables)

  return {
    keys,
    filter: (key, value) => {
      return keys.includes(key) && comparables[key].reduce(
        (acc, comparable) => acc && comparable.compare(value),
        true)
    }
  }
}

function createDefaultTemplate(data) {
  const template = document.createElement('span')
  template.textContent = JSON.stringify(data)
  return template
}

class Comparable {
  static OPERATORS = ['=~', '==', '!=', '>=', '<=', '>', '<', '=']
  static NOT_PREFIX = /^!/
  static create = prop => {
    if (!FILTER_CACHE.has(prop))
      FILTER_CACHE.set(prop, new Comparable(prop))
    return FILTER_CACHE.get(prop)
  }

  constructor(prop) {
    this.key = prop

    if (Comparable.NOT_PREFIX.test(prop)) {
      this.key = prop.slice(1)
      this.operator = '!'
    }

    for (const operator of Comparable.OPERATORS) {
      if (!prop.includes(operator))
        continue
      
      const [key, valueStr] = split(prop, operator)
      this.key = key
      this.operator = operator
      if (valueStr === 'true') {
        this.value = true
      } else if (valueStr === 'false') {
        this.value = false
      } else if (!isNaN(valueStr)) {
        this.value = Number(valueStr)
      } else {
        this.value = valueStr
      }
      break
    }
  }

  compare(value) {
    switch (this.operator) {
      case '!': return isBoolean(value) ? !isTrue(value) : !hasValue(value)
      case '!=': return value != this.value
      case '>=': return value >= this.value
      case '<=': return value <= this.value
      case '>': return value > this.value
      case '<': return value < this.value
      case '=~':
        try {
          return new RegExp(this.value, 'i').test(String(value))
        } catch (e) {
          return false
        }
      case '==':
      case '=':
        return value == this.value
      default: return isBoolean(value) ? isTrue(value) : hasValue(value)
    }
  }
}
