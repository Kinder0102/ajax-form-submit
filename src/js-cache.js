import { assert } from './js-utils'
import { isElement } from './js-dom-utils'

export function createCache() {
  const cache = new Map()
  return {
    set: (key, value) => {
      cache.set(key, value)
    },
    get: key => {
      return cache.get(key)
    }
  }
}

export function createInstanceMap(conditionCallback, createCallback) {
  const instanceMap = new Map()
  return {
    create: (el) => {
      assert(isElement(el), 1, 'HTMLElement')
      if (!conditionCallback(el))
        return
      const instance = instanceMap.get(el)
      if (!instance)
        instanceMap.set(el, createCallback(el))
      return instanceMap.get(el)
    },
    get: el => {
      assert(isElement(el), 1, 'HTMLElement')
      return instanceMap.get(el)
    }
  }
}
