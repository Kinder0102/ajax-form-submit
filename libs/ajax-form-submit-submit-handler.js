import { FUNCTION, STRING_NON_BLANK } from '#libs/js-constant'
import {
  assert,
  hasValue,
  isTrue,
  isArray,
  isFunction,
  isNotBlank,
  isPromise,
  stringToValue,
  valueToString,
  toArray
} from '#libs/js-utils'

let HANDLERS = {
  bypass: { callback: handleBypass, wrapResponse: true },
  mock: { callback: handleMock, wrapResponse: true },
  localStorage: { callback: handleLocalStorage, wrapResponse: true },
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

// TODO need refactor
function handleBypass(opts, input) {
  return 'data' in input ? input : { data: [input] }
}

// TODO need refactor
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

//TODO need refactor
function handleLocalStorage(opts, input, requestParams) {
  let result = {}
  const { method } = requestParams
  const {
    localStorageKey: key,
    localStorageIndex: index,
    localStorageAppend: append
  } = input
  
  if (!isNotBlank(key))
    return result

  const data = stringToValue(localStorage?.getItem(key))
  switch (method.toUpperCase()) {
  case 'GET':
    result.data = data
    break
  case 'PUT':
  case 'PATCH':
    updateLocalStorage(data, key, input, index)
    break
  case 'DELETE':
    deleteLocalStorage(data, key, input, index)
    break
  case 'POST':
  default:
    insertLocalStorage(data, key, input, append)
  }
  return result
}

function insertLocalStorage(data, key, value, append) {
  const isAppend = isTrue(append)
  let insertData = hasValue(data) ? data : (isAppend ? [] : null)
  if (isArray(insertData) && isAppend) {
    insertData.push(value)
  } else {
    insertData = value
  }
  localStorage?.setItem(key, valueToString(insertData))
}

function updateLocalStorage(data, key, value, index) {
  if (!hasValue(data))
    return
  if (isArray(data) && !Number.isNaN(index)) {
    data[index] = value
    localStorage?.setItem(key, valueToString(data))
  } else {
    localStorage?.setItem(key, valueToString(value))
  }
}

function deleteLocalStorage(data, key, index) {
  if (!hasValue(data))
    return

  if (isArray(data) && !Number.isNaN(index)) {
    data.splice(index, 1)
    localStorage?.setItem(key, valueToString(data))
  } else {
    localStorage?.removeItem(key)
  }
}
