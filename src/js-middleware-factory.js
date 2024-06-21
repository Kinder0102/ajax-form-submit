import {
  assert,
  isFunction,
  isPromise,
  isNotBlank,
  isNotEmptyObject
} from './js-utils'

import { createHandler } from './js-handler-factory'

export default class MiddlewareFactory {

  constructor(opt = {}) {
    this.globalMethods = opt.globalMethods || {}
    this.defaultMiddlewares = {
      alert: ({ text, title }) => alert(text),
      confirm: ({ text, title }) => (confirm(text) ? Promise.resolve(true) : Promise.reject(false)),
      error: err => this.defaultMiddlewares.alert({ text: err.message })
    }
  }

  put(name, callback) {
    assert(isNotBlank(name), 'first argument must be NonBlankString')
    assert(isFunction(callback), 'second argument must be Function')
    this.defaultMiddlewares[name] = callback
  }

  createMiddleware(prop) {
    const {
      type: [selectType],
      value: [callback],
      ...others
    } = createHandler(prop)

    let result = () => Promise.resolve()
    let params = {}
    Object.entries(others).forEach(([key, [value]]) => params[key] = value)
    
    if (selectType === 'function') {
      if (isFunction(callback)) {
        result = callback
      } else if (isNotBlank(callback)) {
        assert(isNotEmptyObject(this.globalMethods), `globalMethods is empty`)
        result = this.globalMethods[callback]
        assert(isFunction(result), `Could not find "${callback}" in globalMethods`)
      } else {
        assert(false, `middleware callback could not be empty`)
      }
    } else if (isNotBlank(selectType)) {
      result = this.defaultMiddlewares[selectType]
      assert(isFunction(result), `Could not find "${selectType}" in defaultMiddlewares`)
    }
    return wrapPromise(result, params)
  }
}

function wrapPromise(callback, params) {
  return function() {
    try {
      const result = callback.apply(this, [...arguments, params])
      return isPromise(result) ? result : Promise.resolve(result)
    } catch (error) {
      return Promise.reject(error)
    } 
  }
}
