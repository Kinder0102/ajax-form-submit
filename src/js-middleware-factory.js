import { assert, toArray, isObject, isArray, isFunction, isPromise, isNotBlank, isTrue} from './js-utils.js'
import { createProperty } from './js-property-factory.js'

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
      const { type: [selectType], skip: skipProps, value, ...params } = prop
      const skip = wrapSkip(skipProps)
      const callback = this.#middlewares[selectType]
      assert(isFunction(callback), `Could not find "${selectType}" in middlewares`)
      result.push({ callback, skip, params })
    }
    return wrapPromise(result)
  }
}

function wrapPromise(callbacks) {
  return async function() {
    let arg = arguments[0]
    let updatedArg = arg
    let promise = Promise.resolve(arg)
    try {
      for (const { callback, skip, params } of callbacks) {
        const shouldSkip = await skip.apply(this, [ params, updatedArg ])
        if (shouldSkip)
          continue
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

function wrapSkip(skipProps) {
  const skipProp = toArray(skipProps)[0]
  if (isNotBlank(skipProp)) {
    const skipFunc = window[skipProp]
    if (isFunction(skipFunc)) {
      return (...args) => {
        try {
          const result = skipFunc(...args)
          return isPromise(result) ? result : Promise.resolve(result)
        } catch(error) {
          return Promise.reject(error)
        }
      }
    } else {
      return () => Promise.resolve(isTrue(skipProp))
    }
  } else {
    return () => Promise.resolve(false)
  }
}
