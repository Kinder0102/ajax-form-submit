import { isArray, isNotBlank , addBasePath, formatUrl } from './js-utils'

const WITH_DATA_METHOD = [ 'POST', 'PUT', 'PATCH' ]

export default { request }

function request(opt, input, requestParams) {
  const { basePath, handleProgress, createResponse } = opt
  const { formData, hasFile } = objectToFormData(input)
  const { method, url, csrf, headers, enctype = '' } = requestParams
  const isWithDataMethod = WITH_DATA_METHOD.includes(method)
  const param = new URLSearchParams(formData).toString()
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
      body = JSON.stringify(input)
    }
  }

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: {},
    body: isWithDataMethod ? body : undefined,
  }

  headers.forEach(({ name, value }) => fetchOptions.headers[name] = value)
  if (contentType) 
    fetchOptions.headers['Content-Type'] = contentType
  if (isNotBlank(csrf?.header) && isNotBlank(csrf?.token))
    fetchOptions.headers[csrf.header] = csrf.token

  return new Promise((resolve, reject) => {
    if (handleProgress && hasFile) {
      const xhr = new XMLHttpRequest()
      xhr.open(method.toUpperCase(), processedUrl, true)
      xhr.upload.addEventListener('progress', handleProgress)
      xhr.addEventListener('progress', handleProgress)
      xhr.onload = () => {
        fetch(processedUrl, fetchOptions)
          .then(response => resolve(response.json()))
          .catch(error => reject(error))
      }
    } else {
      fetch(processedUrl, fetchOptions)
        .then(response => {
          if (response.redirected) {
            window && (window.location.href = response.url)
            resolve(createResponse())
          } else {
            resolve(response.json())
          }
        })
        .catch(error => reject(error))
    }
  })
}

function objectToFormData(obj) {
  const formData = new FormData()
  let hasFile = false

  for (const [key, value] of Object.entries(obj)) {
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
