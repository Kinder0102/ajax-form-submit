import { STRING_NON_BLANK, HTML_ELEMENT } from '#libs/js-constant'
import { assert, hasValue, isNotBlank, isElement, objectKeys } from '#libs/js-utils'

export function createDatasetHelper(prefix = '') {
  const prefixStr = isNotBlank(prefix) ? prefix : ''
  const prefixConcat = prefixStr ? `${prefixStr}-` : ''
  const regex = new RegExp(`${prefixStr ? '^\\w|' : ''}\\-\\w`, 'g')

  const keyToInputName = key => {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)
    return `${prefixConcat}${key}`
  }
  const keyToAttrName = key => {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)
    return `data-${prefixConcat}${key}`
  }
  const keyToDatasetName = key => {
    assert(isNotBlank(key), 1, STRING_NON_BLANK)
    return prefixStr + key.replace(`data-${prefixConcat}`, '')
      .replace(regex, group => group.toUpperCase())
      .replaceAll('-', '')
  }
  const datasetNameToKey = datasetName => {
    assert(isNotBlank(datasetName), 1, STRING_NON_BLANK)
    return datasetName.replace(/[A-Z]/g, group => `-${group.toLowerCase()}`)
      .replace(prefixConcat, '')
  }
  const getKeys = (el, prefix) => {
    assert(isElement(el), 1, HTML_ELEMENT)
    let result = objectKeys(el.dataset)
    const namePrefix = isNotBlank(prefix) ? `${prefix}-` : ''
    if (isNotBlank(prefix)) {
      const datasetName = keyToDatasetName(prefix)
      result = result.filter(key => key.indexOf(datasetName) === 0)
    }
    return result.map(token => {
      const key = datasetNameToKey(token)
      const name = key.replace(namePrefix, '')
      return { key, name }
    })
  }
  const getValue = (el, key, defaultValue) => {
    if (!hasValue(defaultValue))
      assert(isElement(el), 1, HTML_ELEMENT)
    return el?.dataset?.[keyToDatasetName(key)] || defaultValue
  }
  const setValue = (el, key, value) => {
    assert(isElement(el), 1, HTML_ELEMENT)
    el.dataset && (el.dataset[keyToDatasetName(key)] = value)
  }

  return {
    keyToInputName,
    keyToAttrName,
    keyToDatasetName,
    datasetNameToKey,
    getKeys,
    getValue,
    setValue
  }
}
