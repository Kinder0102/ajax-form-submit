import { HTML_ELEMENT } from './js-constant.js'
import { assert, isFunction, isElement } from './js-utils.js'

export function createCache() {
  const cache = new Map()
  return {
    has: key => {
      return cache.has(key)
    },
    get: key => {
      return cache.get(key)
    },
    set: (key, value) => {
      isFunction(value) ? cache.set(key, value(cache.get(key))) : cache.set(key, value)
    },
  }
}

export function createInstanceMap(conditionCallback, createCallback) {
  const instanceMap = createCache()
  return {
    create: (el) => {
      assert(isElement(el), 1, HTML_ELEMENT)
      if (!conditionCallback(el))
        return
      if (!instanceMap.has(el))
        instanceMap.set(el, createCallback(el))
      return instanceMap.get(el)
    },
    get: el => {
      assert(isElement(el), 1, HTML_ELEMENT)
      return instanceMap.get(el)
    }
  }
}
