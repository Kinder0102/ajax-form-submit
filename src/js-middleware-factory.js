import { assert, toArray, isObject, isArray, isFunction, isPromise, isNotBlank} from './js-utils'
import { createProperty } from './js-property-factory'

export default class MiddlewareFactory {

  #middlewares

  constructor() {
    this.#middlewares = {
      alert: ({ text, title }) => alert(text),
      confirm: ({ text, title }) => (confirm(text) ? Promise.resolve() : Promise.reject(new Error('CONFIRM'))),
      prompt: input => {
        const { text, title, name } = input
        const result = prompt(text)
        return result ? Promise.resolve({ [name]: result, ...input }) : Promise.reject(new Error('CONFIRM'))
      },
      error: err => this.#middlewares.alert({ text: err.message })
    }
  }

  add(name, callback) {
    assert(isNotBlank(name), 1, 'NonBlankString')
    assert(isFunction(callback), 2, 'Function')
    this.#middlewares[name] = callback
    return this
  }

  get(name) {
    assert(isNotBlank(name), 1, 'NonBlankString')
    return this.#middlewares[name]
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
        callback = this.#middlewares[selectType]
        assert(isFunction(callback), `Could not find "${selectType}" in middlewares`)
      }
      callback && result.push({ callback, params })
    }
    return wrapPromise(result)
  }
}

function wrapPromise(callbacks) {
  return function() {
    let arg = arguments[0]
    let updatedArg = arg
    let promise = Promise.resolve(arg)
    try {
      for (const { callback, params } of callbacks) {
        promise = promise.then(result => {
          isObject(result) && (updatedArg = result)
          return callback.apply(this, [ params, updatedArg ])
        })
      }

      return promise.then(result => isObject(result) ? result : updatedArg)
    } catch (error) {
      return Promise.reject(error)
    } 
  }
}
