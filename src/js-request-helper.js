// import axios from 'axios'
import { isArray, isNotBlank , addBasePath, formatUrl } from './js-utils'

const WITH_DATA_METHOD = [ 'POST', 'PUT', 'PATCH' ]

export default { request }

function request(opt, input, requestParams) {
  const { basePath, checkResponse, handleProgress } = opt
  const { formData, hasFile } = objectToFormData(input)
  const { method, url, enctype = '', csrf } = requestParams
  const isWithDataMethod = WITH_DATA_METHOD.includes(method)
  const param = new URLSearchParams(formData).toString()
  const urlParam = isWithDataMethod ? '' :  `?${param}`
  const processedUrl = addBasePath(`${formatUrl(url, input)}${urlParam}`, basePath)

  let contentType = 'application/json;charset=utf-8'
  let data = null
  if (isWithDataMethod) {
    if (hasFile || enctype.includes('multipart')) {
      data = formData
      contentType = null
    } else if (enctype.includes('urlencoded')) {
      contentType = 'application/x-www-form-urlencoded'
      data = param
    } else {
      data = JSON.stringify(input)
    }
  }

  const xhr = new XMLHttpRequest()
  xhr.upload.addEventListener('progress', handleProgress)
  xhr.addEventListener('progress', handleProgress)

  return new Promise((resolve, reject) => {
    xhr.addEventListener('load', () => {
      const response = JSON.parse(xhr.response)
      checkResponse(response) ? resolve(response) : reject(response)
    })
    xhr.addEventListener('error', () => {
      const { status, statusText } = xhr
      reject({ status, statusText })
    })

    xhr.open(method.toUpperCase(), processedUrl, true)
    if (contentType) {
      xhr.setRequestHeader('Content-type', contentType)
    }
    if (isNotBlank(csrf.header) && isNotBlank(csrf.token)) {
      xhr.setRequestHeader(csrf.header, csrf.token)
    }
    xhr.send(data)
  })
}

function objectToFormData(obj) {
  const formData = new FormData()
  let hasFile = false

  for (const [key, value] of Object.entries(obj)) {
    hasFile ||= (value instanceof Blob)
    if (isArray(value)) {
      const realKey = `${key}[]`
      value.forEach(arrayValue => formData.append(realKey, arrayValue))
    } else {
      formData.append(key, value)
    }
  }

  return {
    formData, hasFile
  }
}