import {
  isURL,
  isNotBlank,
  isFunction,
  isObject,
  isTrue,
  isArray,
  hasValue,
  toArray,
  split
} from './js-utils'

import { isElement, querySelector } from './js-dom-utils'
import { createCache } from './js-cache'

const FORMULA_PATTERN = /(\!?)([\w|\.|\-]+)(\!?[\=|\>|\<]{1}\~?)?([\w|\.|\-|\/|\\]+)?/g
const cache = createCache()

export const createProperty = props => {
  return toArray(props || '').map(prop => {
    if (isObject(prop)) {
      return prop
    } else if (isFunction(prop)) {
      return { type: ['function'], value: [prop] }
    } else {
      if (!isObject(cache.get(prop))) {
        let result = { type: [], value: [] }
        split(prop, '|').forEach(token => {
          if (isURL(token)) {
            result.value.push(token)
          } else {
            let [key, value] = token.includes(':') ? split(token, ':') : [null, token]
            const values = split(value, ',')
            key ? (result[key] = values) : result.value.push(...values)
          }
        })
        cache.set(prop, result)
      }
      return cache.get(prop)
    }
  })
}

export const createTemplateHandler = handlerStr => {
  let filters = []
  let defaultTemplateSelector = null
  const tokens = (handlerStr || '').toString().split('|')
  const templateTags = querySelector('template').map(elem => elem.content)

  tokens.forEach(token => {
    const tag = token.split(':')
    if (tag.length === 1) {
      defaultTemplateSelector = tag[0]
    } else if (tag.length === 2) {
      if (tag[0] === 'default' || tag[0] === 'value') {
        defaultTemplateSelector = tag[1]
      } else {
        let filter = { value: tag[1], conditions: {} }
        filters.push(filter)
        tag[0].split(',').forEach(str => {
          const filterObj = createFilterObject(str)
          const { attribute } = filterObj
          if (!Reflect.has(filter.conditions, attribute)) {
            filter.conditions[attribute] = []
          }
          filter.conditions[attribute].push(filterObj)
        })
      }
    }
  })
  return {
    hasTemplate: () => isNotBlank(defaultTemplateSelector),
    getTemplate: item => {
      const selector = findTemplate(item, filters) || defaultTemplateSelector
      let elem = templateTags.map(tag => querySelector(selector, tag)).flat()[0]
      if (!isElement(elem))
        elem = querySelector(selector)[0]
      const newElem = elem?.cloneNode(true)
      newElem?.removeAttribute('id')
      return newElem
    }
  }
}

export const createFilter = filterInput => {
  let filters = {}
  const attributes = []

  const createAndAddFilter = token => {
    const filterObj = createFilterObject(token)
    const { attribute } = filterObj
    if (!Reflect.has(filters, attribute)) {
      filters[attribute] = []
    }
    attributes.push(attribute)
    filters[attribute].push(filterObj)
    return filterObj
  }

  if (typeof filterInput === 'object') {
    for (const key in filterInput) {
      const value = filterInput[key]
      if (Array.isArray(value)) {
        value.forEach(item => {
          let filterObj = createAndAddFilter(key)
          filterObj.value = item
        })
      } else {
        let filterObj = createAndAddFilter(key)
        filterObj.value = value
      }
    }
  } else if (typeof filterInput === 'string') {
    const tokens = (filterInput || '').split(',')
    tokens.forEach(createAndAddFilter)
  }

  return {
    attributes,
    filter: (attribute, value) => {
      if (!attributes.includes(attribute))
        return false

      return filters[attribute].reduce((isPass, condition) => {
        return isPass && compare(value, condition)
      }, true)
    }
  }
}

function findTemplate(item, filters) {
  for (const filter of filters) {
    let isMatch = true
    for (const attribute in filter.conditions) {
      const conditions = filter.conditions[attribute]
      const nestedAttributes = attribute.split('.')

      let value = item
      for (const nestedAttribute of nestedAttributes) {
        if (Reflect.has(value, nestedAttribute)) {
          value = value[nestedAttribute]
          continue
        } else {
          value = null
          break
        }
      }

      isMatch = isMatch && conditions.reduce((isPass, condition) => {
        return isPass && compare(value, condition)
      }, true)
    }

    if (isValid)
      return filter.value
  }
}

function createFilterObject(filterStr) {
  const matches = (filterStr || '').matchAll(FORMULA_PATTERN)
  
  const createOperator = str => ({
    isNot: str && str.charAt(0) === '!' || false,
    isGreater: str && str.charAt(0) === '>' || false,
    isLower: str && str.charAt(0) === '<' || false,
    isLike: str && str.length > 1 && str.charAt(0) === '=' && str.charAt(1) === '~' || false
  })

  for (const match of matches) {
    const attribute = match[2]
    const value = match[4]
    const operator1 = createOperator(match[1])
    const operator2 = createOperator(match[3])

    return {
      value,
      attribute,
      isNot: operator1.isNot || operator2.isNot,
      isGreater: operator1.isGreater || operator2.isGreater,
      isLower: operator1.isLower || operator2.isLower,
      isLike: operator1.isLike || operator2.isLike,
    }
  }
}

function compare(value, filter) {
  if (isArray(value)) {
    const inputLength = value.length
    const compareLength = parseInt(filter.value) || 0
    if (filter['isGreater']) {
      return inputLength > compareLength
    } else if (filter['isLower']) {
      return inputLength < compareLength
    } else {
      const isNot = filter['isNot'] || false
      const isLengthEqual = (inputLength === compareLength)
      const isGreaterThanZero = (inputLength > 0)
      const result = hasValue(filter.value) ? isLengthEqual : isGreaterThanZero
      return result ^ isNot 
    }
  } else {
    if (filter['isGreater']) {
      return parseInt(value) > (parseInt(filter.value) || 0)
    } else if (filter['isLower']) {
      return parseInt(value) < (parseInt(filter.value) || 0)
    } else if (filter['isNot']) {
      if (hasValue(filter.value)) {
        const valueIgnoreCase = value?.toString().toLowerCase()
        const filterIgnoreCase = filter.value.toString().toLowerCase()
        return valueIgnoreCase !== filterIgnoreCase
      } else {
        return !isTrue(value)
      }
    } else {
      if (!hasValue(filter.value)) {
        return isTrue(value)
      } else if (!hasValue(value)) {
        return false
      } else {
        const valueIgnoreCase = value.toString().toLowerCase()
        const filterIgnoreCase = filter.value.toString().toLowerCase()
        if (filter['isLike']) {
          return valueIgnoreCase.includes(filterIgnoreCase)
        } else {
          return valueIgnoreCase === filterIgnoreCase
        }
      }
    }
  }
}
