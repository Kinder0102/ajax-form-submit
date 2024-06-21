import {
  assert,
  hasValue,
  isTrue,
  isArray,
  isFunction,
  isNotBlank,
  stringToValue,
  valueToString
} from './js-utils'

let GLOBAL_HANDLERS = {
  bypass: handleBypass,
  mock: handleMock,
  localStorage: handleLocalStorage
}

export default class AjaxFormSubmitSubmitHandler {

  static addSubmitHandler = (type, handler) => {
    assert(isNotBlank(type), 1, 'NonBlankString')
    assert(isFunction(handler), 1, 'Function')
    GLOBAL_HANDLERS[type] = handler
  }

  constructor(opt = {}) {
    const { prefix, basePath, createResponse } = opt
    this._createResponse = createResponse
    this._data = { prefix, basePath, globalValue: {} }
  }

  run(type, el, input, requestParameter, opt) {
    const handler = GLOBAL_HANDLERS[type]
    assert(isFunction(handler), `Could not find submitHandler "${type}"`)
    return this._createResponse(handler(el, input, requestParameter, this._data, opt))
  }
}

function handleBypass(el, input) {
  let data
  if (isNotBlank(input.globalValue)) {
    const value = window[input.globalValue]
    data = isArray(value) ? value : [ value ]
  } else {
    data = [input]
  }
  return { data }
}

function handleMock(el, input) {
  const size = input.size || 10
  const number = input.page || 0
  const totalElements = 500
  const totalPages = Math.floor(totalElements / size)
  return {
    data: Array.from({ length: size }, () => ({})),
    page: { size, number, totalElements, totalPages }
  }
}

function handleLocalStorage(el, input, requestParameter) {
  let result = {}
  const { method } = requestParameter
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
