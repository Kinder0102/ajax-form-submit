import { assert, hasValue, toArray, isArray, isFunction, isPromise, isNotBlank} from './js-utils'
import { createProperty } from './js-property-factory'

export default class MiddlewareFactory {

  constructor() {
    this._middlewares = {
      alert: ({ text, title }) => alert(text),
      confirm: ({ text, title }) => (confirm(text) ? Promise.resolve() : Promise.reject(new Error('CONFIRM'))),
      prompt: input => {
        const { text, title, name } = input
        const result = prompt(text)
        return result ? Promise.resolve({ [name]: result, ...input }) : Promise.reject(new Error('CONFIRM'))
      },
      error: err => this._middlewares.alert({ text: err.message })
    }
  }

  add(name, callback) {
    assert(isNotBlank(name), 1, 'NonBlankString')
    assert(isFunction(callback), 2, 'Function')
    this._middlewares[name] = callback
    return this
  }

  get(name) {
    assert(isNotBlank(name), 1, 'NonBlankString')
    return this._middlewares[name]
  }

  create(props) {
    let result = []
    for (const prop of createProperty(props)) {
      const { type: [selectType], value, ...params } = prop
      let callback
      if (selectType === 'function') {
        callback = value[0]
        assert(isFunction(callback), `middleware callback must not Function`)
      } else if (isNotBlank(selectType)) {
        callback = this._middlewares[selectType]
        assert(isFunction(callback), `Could not find "${selectType}" in middlewares`)
      }
      result.push({ callback, params })
    }
    return wrapPromise(result)
  }
}

function wrapPromise(callbacks) {
  return function() {
    let args = Array.from(arguments)
    let promise = Promise.resolve(args)
    try {
      for (const { callback, params } of callbacks) {
        promise = promise.then(result => {
          args = hasValue(result) ? toArray(result) : args
          args[0] = { ...args[0], ...params}
          //TODO hasValue to promise
          return callback.apply(this, args) || args
        })
      }

      //TODO remove params
      return promise.then(result => isArray(result) ? result[0] : (result || args[0]))
    } catch (error) {
      return Promise.reject(error)
    } 
  }
}
