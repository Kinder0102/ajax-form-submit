import {
  isArray,
  isNotBlank,
  toArray,
  valueToString,
  objectEntries,
  addBasePath,
  formatUrl
} from '#libs/js-utils'

const WITH_DATA_METHOD = [ 'POST', 'PUT', 'PATCH' ]

export default { request }

function request(opts, input, requestParams) {
  const { basePath, handleProgress, createResponse } = opts
  const { formData, hasFile } = objectToFormData(input)
  const { method = 'POST', url, csrf, headers = {}, enctype = '' } = requestParams
  const isWithDataMethod = WITH_DATA_METHOD.includes(method.toUpperCase())
  const param = toArray(new URLSearchParams(formData).entries())
    .map(([key, value]) => `${encodeURIComponent(key.replace(/\[\]$/, ''))}=${encodeURIComponent(value)}`)
    .join('&')
  const urlParam = isWithDataMethod ? '' :  `?${param}`
  const processedUrl = addBasePath(`${formatUrl(url, input)}${urlParam}`, basePath)

  let contentType = 'application/json;charset=utf-8'
  let body = null
  if (isWithDataMethod) {
    if (hasFile || enctype.includes('multipart')) {
      body = formData
      contentType = null
    } else if (enctype.includes('urlencoded')) {
      contentType = 'application/x-www-form-urlencoded'
      body = param
    } else {
      body = valueToString(input)
    }
  }

  if (contentType) 
    headers['Content-Type'] = contentType
  if (isNotBlank(csrf?.header) && isNotBlank(csrf?.token))
    headers[csrf.header] = csrf.token

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, processedUrl, true)
    xhr.upload.addEventListener('progress', handleProgress)
    xhr.addEventListener('progress', handleProgress)
    xhr.addEventListener('error', () => reject(({ status, responseText: message } = xhr)))
    // xhr.onabort = () => reject(new Error('Request aborted'));
    xhr.addEventListener('load', () => {
      const { status, responseURL, responseText } = xhr
      if (status >= 200 && status < 300) {
        if (responseURL && responseURL !== new URL(processedUrl, location.href).href) {
          location.href = responseURL
          resolve(createResponse())
        } else {
          resolve(JSON.parse(xhr.responseText))
        }
      } else {
        reject({ status, message: responseText })
      }
    })

    for (const [key, value] of objectEntries(headers)) {
      xhr.setRequestHeader(key, value)
    }

    xhr.send(body)
  })
}

function objectToFormData(obj) {
  const formData = new FormData()
  let hasFile = false

  for (const [key, value] of objectEntries(obj)) {
    hasFile ||= (value instanceof Blob)
    if (isArray(value)) {
      let realKey = `${key}[]`
      value.forEach(arrayValue => {
        if (arrayValue instanceof Blob) {
          realKey = key
          hasFile = true
        }
        formData.append(realKey, arrayValue)
      })
    } else {
      formData.append(key, value)
    }
  }

  return {
    formData, hasFile
  }
}
