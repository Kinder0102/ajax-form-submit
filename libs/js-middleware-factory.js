import { STRING_NON_BLANK, FUNCTION, ERROR_CONFIRM } from '#libs/js-constant'
import { assert, toArray, isObject, isFunction, isPromise, isNotBlank, isTrue } from '#libs/js-utils'
import { createProperty } from '#libs/js-property-factory'

export default class MiddlewareFactory {

  #middlewares
  #debug

  constructor(opts = {}) {
    this.#debug = isTrue(opts.debug)
    this.#middlewares = {
      debug: (...args) => console.log(...args),
      alert: input => alert(input.text),
      confirm: input => (confirm(input.text) ? Promise.resolve() : Promise.reject(new Error(ERROR_CONFIRM))),
      prompt: input => {
        const { text, name } = input
        const result = prompt(text)
        return result ? Promise.resolve({ [name]: result, ...input }) : Promise.reject(new Error(ERROR_CONFIRM))
      },
      error: err => this.#middlewares.alert({ text: err.message })
    }
  }

  add(name, callback) {
    assert(isNotBlank(name), 1, STRING_NON_BLANK)
    assert(isFunction(callback), 2, FUNCTION)
    this.#middlewares[name] = callback
    return this
  }

  get(name) {
    assert(isNotBlank(name), 1, STRING_NON_BLANK)
    return this.#middlewares[name]
  }

  create(props) {
    let result = []
    for (const prop of createProperty(props)) {
      const { type: [selectType], skip: skipProps, value, ...params } = prop
      if (!isNotBlank(selectType))
        continue
      const skip = wrapSkip(skipProps)
      const callback = selectType === FUNCTION ? value[0] : this.#middlewares[selectType]
      assert(isFunction(callback), `Could not find "${selectType}" in middlewares`)
      result.push({ callback, skip, params })
    }
    this.#debug && result.push({ callback: this.#middlewares.debug })
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
        const shouldSkip = await skip?.apply(this, [ params, updatedArg ])
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
