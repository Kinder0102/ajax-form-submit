import {
  assert,
  hasValue,
  isObject,
  isArray,
  isNotBlank,
} from './js-utils'

import {
  isElement,
  querySelector
} from './js-dom-utils'

import {
  createHandler,
  createFilter
} from './js-handler-factory'

const SUPPORT_TYPE = [
  'search',
  'count',
  'bypass'
]

export default class AjaxFormSubmitLocalHandler {
   constructor(setting, opt = {}) {
    this.handlerProp = createHandler(setting)
  }

  isLocal() {
    return this.handlerProp.type.length > 0
  }

  run(data, type) {
    if (type && !this.handlerProp.type.includes(type))
      return

    const selectTypes = type ? [ type ] : this.handlerProp.type
    if (selectTypes.includes(SUPPORT_TYPE[2]))
      return data

    let result = {}
    const sourceSelectors = this.handlerProp.source || this.handlerProp.value || []
    selectTypes.forEach(selectType => {
      switch(selectType) {
        case SUPPORT_TYPE[0]:
          result[selectType] = handleSearch(data, sourceSelectors[0])
          break
        case SUPPORT_TYPE[1]:
          result[selectType] = handleCount(data, sourceSelectors[0])
          break
      }
    })

    return result
  }
}

function handleSearch(data, sourceSelector) {
  if (!sourceSelector)
    return []
  const sourceElem = $(sourceSelector)
  let sourceItems = []
  if (sourceElem.length !== 0) {
    sourceItems = JSON.parse(sourceElem.val() || '[]')
  } else if (window && window[sourceSelector]) {
    sourceItems = window[sourceSelector]
  }

  const items = isArray(sourceItems) ? sourceItems : [ sourceItems ]
  return filterItems(items, data)
}

function handleCount(data, sourceSelector) {
  assert(isObject(data), 'first argument must be Object')
  assert(isNotBlank(sourceSelector), 'second argument must be non-blank string')

  const sourceItems = JSON.parse(data[sourceSelector] || '[]')
  const result = isArray(sourceItems) ? sourceItems : [ sourceItems ]
  return filterItems(result, data).length
}

function filterItems(items, data) {
  const filter = createFilter(data)
  return items.filter(item => {
    return filter.attributes.reduce((isValid, attribute) => {
      return isValid && (Reflect.has(item, attribute)
        ? filter.filter(attribute, item[attribute]) : true)
    }, true)
  })
}
