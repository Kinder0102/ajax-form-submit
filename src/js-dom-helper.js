import {
  assert,
  hasValue,
  isTrue,
  isNotBlank,
  isArray,
  isObject,
  isFunction,
  valueToString,
  stringToValue,
  split,
  toArray,
  findObjectValue,
  formatNumber,
  formatString,
  formatDate,
  addBasePath,
  toCamelCase
} from './js-utils'

import {
  isElement,
  elementIs,
  hasClass,
  addClass,
  removeClass,
  querySelector,
  registerEvent,
  showElements,
  hideElements
} from './js-dom-utils'

import {
  createProperty,
  createFilter,
  createTemplateHandler
} from './js-property-factory'

import { createDatasetHelper } from './js-dataset-helper'

const BASE_PATH = '/'
const CLASS_NAME = 'dom-helper'
const CREATE_CLASS_NAME = `${CLASS_NAME}-create`
const FILLED_CLASS_NAME = `${CLASS_NAME}-filled`
const REMOVE_CLASS_NAME = `${CLASS_NAME}-remove`
const INDEX = `${CLASS_NAME}-index`
const VALUE_NAME = `${CLASS_NAME}-value`
const ATTR_IGNORE_KEYS = [ 'format', 'enum', 'value-type', 'value-empty' ]
const ATTR_BOOLEAN_KEYS = [ 'disabled' ]

export default class DOMHelper {

  #prefix
  constructor(opt = {}) {
    this.#prefix = opt.prefix
    this.basePath = opt.basePath || BASE_PATH
    this.datasetHelper = createDatasetHelper(opt.prefix)
  }

  setValueToElement(el, value, templateSelector) {
    assert(isElement(el), 1, 'HTMLElement')
    
    const templateProp = templateSelector || this.datasetHelper.getValue(el, 'template')
    if (isArray(value) || isNotBlank(templateProp)) {
      this.setArrayToElement(el, toArray(value), templateProp)
    } else if (hasValue(value)) {
      this.setDisplay(el, value)
      const { keyToAttrName } = this.datasetHelper
      const valueKey = 'value'
      const valueElems = querySelector(`[${keyToAttrName(valueKey)}]`, el, true)
      const classKey = 'class'
      const classElems = querySelector(`[${keyToAttrName(classKey)}]`, el, true)
      const attrKey = 'attr'
      const attrElems = querySelector('*', el, true)

      attrElems.forEach(elem => this.datasetHelper.getKeys(elem, attrKey)
        .filter(({ key }) => !ATTR_IGNORE_KEYS.some(attr => key === attr))
        .forEach(({ key }) => this.fillElement(elem, value, key, this.setAttr.bind(this))))
      classElems.forEach(elem => this.fillElement(elem, value, classKey, this.setClass.bind(this)))
      valueElems.forEach(elem => this.fillElement(elem, value, valueKey, this.setValue.bind(this)))
      
      this.setInputSource(el)
    }
  }

  setArrayToElement(el, arr, templateSelector) {
    assert(isElement(el), 1, 'HTMLElement')
    assert(isArray(arr), 2, 'Array')

    if (el.hasAttribute?.(this.datasetHelper.keyToAttrName('array-length'))) {
      this.setValue(el, [ arr.length ])
      return
    }

    const templateProp = templateSelector || this.datasetHelper.getValue(el, 'template')
    const indexKey = { first: 0, last: arr.length - 1 }
    const arrayIndexKey = this.datasetHelper.getValue(el, 'array-index')
    const arrayIndex = indexKey[arrayIndexKey] ?? arrayIndexKey
    const valueName = this.datasetHelper.getValue(el, 'array-value')
    const emptyTemplate = this.datasetHelper.getValue(el, 'value-empty')
    const dataArray = (hasValue(arrayIndex) ? [ arr[arrayIndex] ] : arr).filter(hasValue)

    if (dataArray.length > 0) {
      dataArray.forEach((data, index) => {
        const objValue = isObject(data) ? data : { [VALUE_NAME]: data }
        const indexData = { ...objValue, [INDEX]: index }
        const { value } = findObjectValue(indexData, valueName)
        if (isArray(value)) {
          const fragment = document.createDocumentFragment()
          this.setArrayToElement(fragment, value, templateProp)
          el.append(fragment)
        } else {
          this.appendElement(el, value, templateProp)
        }
      })
    } else if (isNotBlank(emptyTemplate)) {
      this.appendElement(el, null, emptyTemplate)
    }
  }

  appendElement(el, data, templateProp) {
    assert(isElement(el), 1, 'HTMLElement')

    templateProp ||= this.datasetHelper.getValue(el, 'template')
    let templateElem = createTemplateHandler(templateProp).getTemplate(data)
    if (!isElement(templateElem))
      templateElem = createDefaultChild(el, data)
    const newElem = this.createElement(data, templateElem)
    removeClass(newElem, 'ajax-form-submit-initialized')
    isElement(newElem) && el.append(newElem)
    return newElem
  }

  createElement(data, templateProp) {
    let newElem
    if (isElement(templateProp)) {
      newElem = templateProp.cloneNode(true)
    } else if (isNotBlank(templateProp)) {
      newElem = createTemplateHandler(templateProp).getTemplate()
    }

    assert(isElement(newElem), `template not found: ${templateProp}`)

    addClass(newElem, CREATE_CLASS_NAME)
    this.setValueToElement(newElem, data)

    if (!hasClass(newElem, REMOVE_CLASS_NAME))
      return newElem
  }

  clearElement(el) {
    assert(isElement(el), 1, 'HTMLElement')
    querySelector(`.${CREATE_CLASS_NAME}`, el, true)
        .forEach(elem => elem.remove())
    querySelector(`.${FILLED_CLASS_NAME}`, el, true)
      .forEach(elem => this.setValue(elem, ['']))
  }

  setInputSource(el) {
    // assert(isElement(el), 1, 'HTMLElement')

    // const inputSource = this.datasetHelper.getValue(el, 'input-source')
    // if (!isNotBlank(inputSource))
    //   return

    // const sourceProps = createProperty(inputSource)
    // const keyName = sourceProps.value[0] ?? el.getAttribute('name')
    // sourceProps.type.forEach(type => {
    //   switch(type) {
    //     case 'querystring': {
    //       const querystring = new URLSearchParams(location.search)
    //       querystring.forEach((value, key) => {
    //         if (key === keyName)
    //           el.value = value
    //         if (!hasValue(el.value))
    //           el.value = ''
    //       })
    //     }
    //   }
    // })
  }

  fillElement(el, obj, datasetName, handler) {
    assert(isElement(el), 1, 'HTMLElement')
    assert(isObject(obj), 2, 'Object')
    assert(isNotBlank(datasetName), 3, 'NonBlankString')
    assert(isFunction(handler), 4, 'Function')

    const attrValue = this.datasetHelper.getValue(el, datasetName, '')
    const keys = split(attrValue, ',')

    if (keys.length === 0) {
      return
    } else if (keys.length === 1) {
      const { value: selectValue } = findObjectValue(obj, keys[0])
      if (isArray(selectValue)) {
        this.setArrayToElement(el, selectValue)
      } else {
        handler(el, [ selectValue ], datasetName)
      }
    } else {
      const values = keys
        .map(key => findObjectValue(obj, key).value)
        .map(valueToString)
      handler(el, values, datasetName)
    }  
  }

  setDisplay(el, data) {
    assert(isElement(el), 1, 'HTMLElement')

    const { keyToAttrName, getValue } = this.datasetHelper
    const hiddenKey = 'hidden'
    querySelector(`[${keyToAttrName(hiddenKey)}]`, el, true).forEach(elem => {
      const filter = createFilter(getValue(elem, hiddenKey))
      const result = filter.attributes.reduce((isValid, attribute) => {
        return isValid && filter.filter(attribute, findObjectValue(data, attribute).value)
      }, true)

      if (result) {
        hideElements(elem)
      } else {
        showElements(elem)
      }
    })

    const filterKey = 'filter'
    querySelector(`[${keyToAttrName(filterKey)}]`, el, true).forEach(elem => {
      const filter = createFilter(getValue(elem, filterKey))
      const result = filter.attributes.reduce((isValid, attribute) => {
        return isValid && filter.filter(attribute, findObjectValue(data, attribute).value)
      }, true)

      if (!result) {
        elem.remove()
        addClass(elem, REMOVE_CLASS_NAME)
      }
    })
  }

  setClass(el, classNames) {
    assert(isElement(el), 1, 'HTMLElement')

    const enums = this.datasetHelper.getValue(el, 'class-enum')
    const valueFormat = this.generateValue(classNames, { enums })
    split(valueFormat).filter(isNotBlank).forEach(value => addClass(el, value))
  }

  setAttr(el, values, attrName) {
    assert(isElement(el), 1, 'HTMLElement')
    //TODO attr case insensitive
    let tag = attrName.replace('attr-', '')
    const format = this.datasetHelper.getValue(el, `attr-${tag}-format`)
    const enums = this.datasetHelper.getValue(el, `attr-${tag}-enum`)
    const valueFormat = this.generateValue(values, { format, enums })

    if (!tag.includes('data-'))
      tag = toCamelCase(tag)

    if (ATTR_BOOLEAN_KEYS.includes(tag)) {
      if (isTrue(valueFormat))
        el.toggleAttribute(tag)
    } else {
      el.setAttribute(tag, valueFormat)
    }
  }

  setValue(el, values) {
    assert(isElement(el), 1, 'HTMLElement')

    addClass(el, FILLED_CLASS_NAME)
    const valueFormat = this.generateValue(values, {
      format: this.datasetHelper.getValue(el, 'value-format'),
      valueType: this.datasetHelper.getValue(el, 'value-type'),
      valueTypeFormat: this.datasetHelper.getValue(el, 'value-type-format'),
      enums: this.datasetHelper.getValue(el, 'value-enum'),
      empty: this.datasetHelper.getValue(el, 'value-empty')
    })

    switch(el.tagName?.toLowerCase()) {
    case 'input':
    case 'select':
      if (el.getAttribute('type') === 'checkbox') {
        if (isTrue(valueFormat)) {
          el.setAttribute('checked', 'checked')
        } else {
          el.removeAttribute('checked')
        }
      } else {
        el.value = valueFormat
      }
      break
    case 'a':
      const link = addBasePath(valueFormat, this.basePath)
      if (hasClass(el, 'link-with-js')) {
        el.style.cursor = 'pointer'
        registerEvent(el, 'click', event => location.href = link)
      } else {
        el.setAttribute('href', link)
      }
      break
    case 'img':
    case 'iframe':
      el.setAttribute('src', valueFormat)
      break
    case 'object':
      el.setAttribute('data', valueFormat)
      break
    case 'form':
      el.setAttribute('action', addBasePath(valueFormat, this.basePath))
      break
    default:
      el.textContent = valueFormat
    }
  }

  generateValue(values, { format, enums, empty, valueType = 'string', valueTypeFormat }) {
    let result = empty ?? ''
    if (!isArray(values))
      return result

    let validValues = values.filter(value => hasValue(value))
    if (validValues.length === 0)
      return result

    switch(valueType) {
      case 'date':
        const dateValues = validValues.map(value => formatDate(value, valueTypeFormat))
        return processString(format, dateValues)
      case 'string':
        return processString(format, processEnum(enums, validValues))
      case 'number':
        const numberValue = processNumber(validValues.reduce((a, b) => a + Number(b), 0), valueTypeFormat)
        return processString(format, processEnum(enums, numberValue))
      case 'percentage':
        let percentage = validValues.reduce((a, b) => a + Number(b), 0) * 100
        return processEnum(enums, `${formatNumber(percentage, format)}%`)
      default:
        return processEnum(enums, validValues).join()
    }
  }
}

function processString(format, args = []) {
  return formatString(format, args) || args.join?.() || args
}

function processNumber(input, valueTypeFormat) {
  const format = createProperty(valueTypeFormat)[0]
  format['*']?.forEach(value => input *= value)
  format['/']?.forEach(value => input /= value)
  format['+']?.forEach(value => input += value)
  format['-']?.forEach(value => input -= value)
  return formatNumber(input, format['.']?.[0])
}

function processEnum(enums, args = []) {
  if (enums) {
    const enumObj = createEnums(enums)
    if (isArray(args)) {
      return args.map(enumObj.get)
    } else {
      return enumObj.get(args)
    }
  } else {
    return args
  }
}

function createDefaultChild(el, data) {
  const defaultTag = elementIs(el, 'select') ? 'option' : 'span'
  const newElem = document.createElement(defaultTag)
  newElem.value = data
  newElem.textContent = data
  return newElem
}

function createEnums(props) {
  let enums = {}
  const result = {
    get: key => {
      if (!isNotBlank(`${key}`))
        return key
      const result = enums[key] ?? enums['default'] ?? key
      return isArray(result) ? result[0] : result
    }
  }

  if (isNotBlank(props)) {
    const globalValue = window?.[props]
    if (isObject(globalValue)) {
      enums = globalValue
    } else {
      const el = querySelector(props)[0]
      if (isElement(el)) {
        if (elementIs(el, 'input')) {
          enums ||= stringToValue(el.value)
        } else if (elementIs(el, 'select')) {
          querySelector('option', el).forEach(elem => {
            enums[elem.value] = elem.textContent
          })      
        }
      } else {
        enums = createProperty(props)[0]
      }
    }
  }
 
  return result
}
