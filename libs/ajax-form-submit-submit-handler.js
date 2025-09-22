import { FUNCTION, STRING_NON_BLANK } from '#libs/js-constant'
import {
  assert,
  isFunction,
  isNotBlank,
  isPromise,
  toArray
} from '#libs/js-utils'

let HANDLERS = {
  bypass: { callback: handleBypass, wrapResponse: true },
  mock: { callback: handleMock, wrapResponse: true },
}

export default class AjaxFormSubmitSubmitHandler {

  static add = (type, callback, wrapResponse = false) => {
    assert(isNotBlank(type), 1, STRING_NON_BLANK)
    assert(isFunction(callback), 1, FUNCTION)
    HANDLERS[type] = { callback, wrapResponse }
  }

  #payload
  #createResponse

  constructor(opts = {}) {
    this.#payload = opts
    this.#createResponse = opts.createResponse
  }

  run(type, opts, input, requestParams) {
    const handler = HANDLERS[type]
    assert(isFunction(handler?.callback), `Could not find submitHandler "${type}"`)
    const result = handler.callback({ ...this.#payload, ...opts }, input, requestParams)
    if (isPromise(result)) {
      return result
    } else {
      return Promise.resolve(handler.wrapResponse ? this.#createResponse(result) : result)
    }
  }
}

function handleBypass(opts, input) {
  return { data: input?.item || input }
}

function handleMock(opts, input) {
  const size = input.size || 10
  const number = input.page || 0
  const totalElements = 500
  const totalPages = Math.floor(totalElements / size)
  return {
    data: toArray({ length: size }, () => ({})),
    page: { size, number, totalElements, totalPages }
  }
}
