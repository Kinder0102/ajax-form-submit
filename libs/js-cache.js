import { HTML_ELEMENT } from '#libs/js-constant'
import { assert, isFunction, isElement } from '#libs/js-utils'

export function createCache() {
  const cache = new Map()
  return {
    has: key => cache.has(key),
    get: key => cache.get(key),
    set: (key, value) => isFunction(value) ? cache.set(key, value(cache.get(key))) : cache.set(key, value),
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
