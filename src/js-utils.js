const URL_PATTERN = /http(s)?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}(\.[a-z]{2,6})?\b([-a-zA-Z0-9@:%_\+.~#?&\/\/=]*)/g

export function assert(condition, message, type) {
  if (condition)
    return

  if (isNotBlank(type)) {
    throw new Error(`Argument ${message} must be ${type}`)
  } else {
    throw new Error(message || 'Assertion failed')
  }
}

export function isTrue(value) {
  if (!hasValue(value))
    return false
  if (isNotBlank(value)){
    value = value.trim().toLowerCase()
  }
  switch(value) {
    case false:
    case 'false':
    case 0:
    case '0':
    case 'no':
      return false
    default: 
      return true
  }
}

export function isInteger(value) {
  return Number.isInteger(Number(value))
}

export function isNotBlank(str) {
  if (str && typeof str === 'string') {
    return str.trim().length > 0
  } else {
    return false
  }
}

export function isFunction(func) {
  return typeof func === 'function'
}

export function isPromise(p) {
  return isObject(p) && isFunction(p.then) && isFunction(p.catch)
}

export function isArray(arr) {
  return Array.isArray(arr)
}

export function isObject(obj) {
  return obj && typeof obj === 'object' && !isArray(obj)
}

export function isNotEmptyObject(obj) {
  return isObject(obj) && (Object.keys(obj).length !== 0)
}

export function isURL(str) {
  return !!new RegExp(URL_PATTERN).test(str)
}

export function toArray(value, separator) {
  if (!hasValue(value))
    return []
  if (isNotBlank(separator) && isNotBlank(value))
    return split(value, separator)
  return (isArray(value) ? value : [ value ]).filter(hasValue)
}

export function hasValue(value) {
  if (value || value === '' || value === 0 || value === false)
    return true
  return false
}

export function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

export function valueToString(value) {
  let result = null
  if (isObject(value) || isArray(value)) {
    result = JSON.stringify(value)
  } else if (hasValue(value)) {
    result = value.toString()
  }
  return result
}

export function stringToValue(str) {
  let result = null
  if (isObject(str) || isArray(str)) {
    result = str
  } else {
    try {
      const obj = JSON.parse(str)
      if (isObject(obj) || isArray(obj)) {
        result = obj
      }
    } catch(ignored) { }
  }
  return result
}

export function split(str, separator) {
  if (isArray(str))
    return str

  const regex = isNotBlank(separator) ? separator : /[\s,]+/
  if (hasValue(str)) {
    return str.toString().split(regex).map(value => value.trim()).filter(isNotBlank)
  } else {
    return []
  } 
}

export function startsWith(str, mark) {
  assert(isNotBlank(mark), 2, 'NonBlankString')

  let exist = false
  let value = str

  if (isNotBlank(str) && str.length > mark.length) {
    exist = str.startsWith(mark)
    if (exist)
      value = value.substring(mark.length, value.length)
  }
  return { exist, value }
}

export function endsWith(str, mark) {
  assert(isNotBlank(mark), 2, 'NonBlankString')

  let exist = false
  let value = str

  if (isNotBlank(str) && str.length > mark.length) {
    exist = str.endsWith(mark)
    if (exist)
      value = value.substring(0, value.length - mark.length)
  }
  return { exist, value }
}

export function toCamelCase(str) {
  if (!isNotBlank(str))
    return ''
  return str.replace(/-([a-z])/g, group => (group[1].toUpperCase()))
}

export function toKebabCase(str) {
  if (!isNotBlank(str))
    return ''

  return str.split('').map((letter, idx) => {
    const isUpper = (letter.toUpperCase() === letter && letter !== '-')
    const prefix = (idx !== 0 && isUpper) ? '-' : ''
    return `${prefix}${letter.toLowerCase()}`
  }).join('')
}

export function findObjectValue(obj, key) {
  let result = obj
  let currentKey = key
  let exist = false
  if (isArray(obj)) {

  } else if (isNotBlank(key) && isObject(obj)) {
    const keys = split(key, '.')
    keys.forEach(attr => {
      currentKey = attr
      result = result?.[attr]
    })
    if (!hasValue(result))
      result = obj[keys.pop()]

    exist = hasValue(result)
  }

  return {
    key: currentKey,
    value: result,
    exist: exist
  }
}

export function formatNumber(value, n, x) {
  const re = '\\d(?=(\\d{' + (x || 3) + '})+' + (n > 0 ? '\\.' : '$') + ')'
  return value.toFixed(Math.max(0, ~~n)).replace(new RegExp(re, 'g'), '$&,')
}

export function formatString(str, args = []) {
  let result = isNotBlank(str) ? str : ''
  const params = toArray(args)
  return result.replace(/{(\d+)}/g, function(match, number) { 
    return typeof params[number] != 'undefined' ? params[number] : match
  })
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

  for (const [k, v] of Object.entries(dateValues))
    if (new RegExp(`(${k})`).test(result))
      result = result.replace(RegExp.$1, (RegExp.$1.length === 1) ? v : (`00${v}`.substr(`${v}`.length)))
  return result
}

export function formatUrl(url, parameters) {
  if (!isNotBlank(url) || !isObject(parameters))
    return url
  
  let result = url
  for (const [attribute, value] of Object.entries(parameters)) {
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
  if (isArray(obj)) {
    return obj.filter(value => hasValue(value)).map(deepFilterArrays)
  } else if (isObject(obj)) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, deepFilterArrays(value)])
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
