import { STRING_NON_BLANK } from './js-constant.js'

const URL_PATTERN = /http(s)?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}(\.[a-z]{2,6})?\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/g
const FALSY_VALUES = ['false', '0', 'no', 'off', '']

export const isArray = Array.isArray
export const objectKeys = Object.keys
export const objectValues = Object.values
export const objectEntries = obj => (isObject(obj) ? Object.entries(obj) : [])

export function assert(condition, message, type) {
  if (condition)
    return

  if (hasValue(type)) {
    throw new Error(`Argument ${message} must be ${toArray(type).join(' or ')}`)
  } else {
    throw new Error(message || 'Assertion failed')
  }
}

export function isBoolean(value) {
  return typeof value === 'boolean' || value instanceof Boolean
}

export function isTrue(value) {
  return hasValue(value) && (!FALSY_VALUES.includes(String(value).trim().toLowerCase()))
}

export function isInteger(value) {
  return Number.isInteger(Number(value))
}

export function isNotBlank(str) {
  return typeof str === 'string' && str.trim().length > 0
}

export function isFunction(func) {
  return typeof func === 'function'
}

export function isPromise(p) {
  return isObject(p) && isFunction(p.then) && isFunction(p.catch)
}

export function isObject(obj) {
  return obj !== null && typeof obj === 'object' && typeof obj !== 'function' && !isArray(obj)
}

export function isURL(str) {
  return !!new RegExp(URL_PATTERN).test(str)
}

export function hasValue(value) {
  return value != null
}

export function toArray(value, separator) {
  if (!hasValue(value))
    return []
  if (isNotBlank(separator) && isNotBlank(value))
    return split(value, separator).filter(hasValue)
  return (isArray(value) ? value : [ value ]).filter(hasValue)
}

export function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

export function valueToString(value) {
  if (isObject(value) || isArray(value))
    return JSON.stringify(value)
  if (hasValue(value))
    return String(value)
  return null
}

export function stringToValue(str) {
  if (isObject(str) || isArray(str))
    return str
  try {
    const parsed = JSON.parse(str)
    return (isObject(parsed) || isArray(parsed)) ? parsed : null
  } catch {
    return null
  }
}

export function split(str, delimiter) {
  if (isArray(str))
    return str
  if (typeof str !== 'string')
    return [str]
  if (!isNotBlank(str))
    return []

  const result = []
  let current = ''
  let i = 0

  const useDefault = !delimiter
  const delimiters = [',', ' ']
  const delimLen = delimiter?.length || 0

  while (i < str.length) {
    if (str[i] === '\\') {
      if (i + 1 < str.length) {
        current += str[i] + str[i + 1]
        i += 2
      } else {
        current += str[i]
        i++
      }
    } else if (
      useDefault
        ? delimiters.includes(str[i])
        : str.slice(i, i + delimLen) === delimiter
    ) {
      result.push(current)
      current = ''
      i += useDefault ? 1 : delimLen
    } else {
      current += str[i]
      i++
    }
  }

  if (current !== '') 
    result.push(current)

  return result.map(value => value.trim()).filter(isNotBlank)
}

export function startsWith(str, mark) {
  return checkPrefixOrSuffix(str, mark, true)
}

export function endsWith(str, mark) {
  return checkPrefixOrSuffix(str, mark, false)
}

export function toCamelCase(str) {
  if (!isNotBlank(str))
    return ''
  return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())
}

export function toKebabCase(str) {
  if (!isNotBlank(str))
    return ''

  let result = ''
  for (let i = 0; i < str.length; i++) {
    const letter = str[i]
    const isUpper = letter.toUpperCase() === letter && letter !== '-'
    result += (i !== 0 && isUpper ? '-' : '') + letter.toLowerCase()
  }
  return result
}

export function findObjectValue(obj, key) {
  let value = obj
  let currentKey = key
  let exist = false

  if (isArray(obj)) {

  } else if (isNotBlank(key) && isObject(obj)) {
    const keys = split(key, '.')
    keys.forEach(attr => {
      currentKey = attr
      value = value?.[attr]
    })
    if (!hasValue(value))
      value = obj[keys.pop()]

    exist = hasValue(value)
  }

  return { key: currentKey, value, exist }
}

export function formatNumber(value, n, x) {
  const re = '\\d(?=(\\d{' + (x || 3) + '})+' + (n > 0 ? '\\.' : '$') + ')'
  return value.toFixed(Math.max(0, ~~n)).replace(new RegExp(re, 'g'), '$&,')
}

export function formatString(str, args) {
  if (isNotBlank(str)) {
    const param = toArray(args)
    return str.replace(/{(\d+)}/g, (match, number) => hasValue(param[number]) ? param[number] : '')
  } else {
    return args.join?.() || args
  }
}

export function formatDate(value, format = 'yyyy/MM/dd') {
  const date = value instanceof Date ? value : new Date(parseInt(value))
  let result = `${format}`
  const dateValues = {
    'M+': date.getMonth() + 1,
    'd+': date.getDate(),
    'h+': date.getHours(),
    'H+': date.getHours(),
    'm+': date.getMinutes(),
    's+': date.getSeconds(),
    'q+': Math.floor((date.getMonth() + 3) / 3),
    'S': date.getMilliseconds()
  }

  if (/(y+)/.test(result))
    result = result.replace(RegExp.$1, `${date.getFullYear()}`.substr(4 - RegExp.$1.length))

  for (const [k, v] of objectEntries(dateValues))
    if (new RegExp(`(${k})`).test(result))
      result = result.replace(RegExp.$1, (RegExp.$1.length === 1) ? v : (`00${v}`.substr(`${v}`.length)))
  return result
}

export function formatUrl(url, parameters) {
  if (!isNotBlank(url) || !isObject(parameters))
    return url
  
  let result = url
  for (const [attribute, value] of objectEntries(parameters)) {
    if (isObject(value)) {
      result = formatUrl(result, value)
    } else if (hasValue(value)) {
      const pattern = new RegExp(`\{${attribute}\}`, 'gi');
      result = result.replaceAll(pattern, value)
    }
  }
  return result
}

export function deepFilterArrays(obj) {
  if (obj instanceof File || obj instanceof Blob || obj instanceof Date)
    return obj

  if (isArray(obj)) {
    return obj.filter(value => hasValue(value)).map(deepFilterArrays)
  } else if (isObject(obj)) {
    return Object.fromEntries(
      objectEntries(obj).map(([key, value]) => [key, deepFilterArrays(value)])
    )
  }
  return obj
}

export function addBasePath(url, basePath) {
  if (!isNotBlank(url) || isURL(url))
    return url
  if (!isNotBlank(basePath) || (basePath === '/') || url.includes(basePath))
    return url

  return basePath + url
}


function checkPrefixOrSuffix(str, mark, isStart) {
  assert(isNotBlank(mark), 2, STRING_NON_BLANK)

  let exist = false
  let value = str

  if (isNotBlank(str) && str.length > mark.length) {
    exist = isStart ? str.startsWith(mark) : str.endsWith(mark)
    if (exist)
      value = isStart ? value.substring(mark.length) : value.substring(0, value.length - mark.length)
  }
  return { exist, value }
}
