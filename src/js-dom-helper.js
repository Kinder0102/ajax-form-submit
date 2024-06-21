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
  findObjectValue,
  formatNumber,
  formatString,
  addBasePath
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
  hideElements,
  enableElements,
  disableElements
} from './js-dom-utils'

import {
  createHandler,
  createFilter,
  createTemplateHandler
} from './js-handler-factory'

import { createDatasetHelper } from './js-dataset-helper'

const BASE_PATH = '/'
const CLASS_NAME = 'dom-helper'
const CREATE_CLASS_NAME = `${CLASS_NAME}-create`
const FILLED_CLASS_NAME = `${CLASS_NAME}-filled`
const REMOVE_CLASS_NAME = `${CLASS_NAME}-remove`
const INDEX = `${CLASS_NAME}-index`
const SEPARATOR_NAME = 'domHelperSeparator'
const ATTR_IGNORE_KEYS = [ 'format', 'enums' ]
const ATTR_BOOLEAN_KEYS = [ 'disabled' ]

export default class DOMHelper {
   constructor(opt = {}) {
    this.basePath = opt.basePath || BASE_PATH
    this.datasetHelper = createDatasetHelper(opt.prefix)
  }

  setValueToElement(el, value, templateSelector) {
    assert(isElement(el), 1, 'HTMLElement')
    
    const templateProp = templateSelector || this.datasetHelper.getValue(el, 'template')
    if (isArray(value) || isNotBlank(templateProp)) {
      const items = isArray(value) ? value : [ value ].filter(hasValue)
      if (items.length === 0)
        return false
      this.setArrayToElement(el, items, templateProp)
    } else if (hasValue(value)) {
      this.setDisplay(el, value)
      const { keyToAttrName } = this.datasetHelper
      const valueKey = 'value'
      const valueElems = querySelector(`[${keyToAttrName(valueKey)}]`, el, true)
      const classKey = 'class'
      const classElems = querySelector(`[${keyToAttrName(classKey)}]`, el, true)
      const attrKey = 'attr'
      const attrElems = querySelector('*', el, true)

      valueElems.forEach(elem => this.fillElement(elem, value, valueKey, this.setValue.bind(this)))
      classElems.forEach(elem => this.fillElement(elem, value, classKey, this.setClass.bind(this)))
      attrElems.forEach(elem => this.datasetHelper.getKeys(elem, attrKey)
        .filter(({ key }) => !ATTR_IGNORE_KEYS.some(attr => key.includes(attr)))
        .forEach(({ key }) => this.fillElement(elem, value, key, this.setAttr.bind(this))))
      
      this.setInputSource(el)
    }
  }

  setArrayToElement(el, arr, templateSelector) {
    assert(isElement(el), 1, 'HTMLElement')
    assert(isArray(arr), 2, 'Array')

    if (el.hasAttribute(this.datasetHelper.keyToAttrName('array-length'))) {
      this.setValue(el, [ arr.length ])
      return
    }

    const indexKey = { first: 0, last: arr.length - 1 }
    const arrayIndexKey = this.datasetHelper.getValue(el, 'array-index')
    const arrayIndex = indexKey[arrayIndexKey] ?? arrayIndexKey
    const separator = this.datasetHelper.getValue(el, 'array-separator')
    const valueName = this.datasetHelper.getValue(el, 'array-value')
    const valueType = this.datasetHelper.getValue(el, 'value-type')
    const templateProp = templateSelector || this.datasetHelper.getValue(el, 'template')
    const isSelected = hasValue(arrayIndex)
    const hasSeparator = isNotBlank(separator)

    let separatorElem, separatorObj
    if (hasSeparator) {
      separatorElem = createTemplateHandler(separator).getTemplate()
      if (!isElement(separatorElem)) {
        separatorObj = { [SEPARATOR_NAME]: separator }
        separatorElem = document.createElement('span')
        this.datasetHelper.setValue(separatorElem, 'value', SEPARATOR_NAME)
      }
    }

    const dataArray = (isSelected ? [ arr[arrayIndex] ] : arr).filter(hasValue)
    // if (hasValue(valueType)) {
    //   const keys = split(valueName, ',')
    //   const result = dataArray.map(data => (
    //     keys.map(key => findObjectValue(data, key).value).map(valueToString)
    //   )).flat()
    //   this.setValue(el, result)
    // } else {
      const hasTemplate = createTemplateHandler(templateProp).hasTemplate()
      dataArray.forEach((data, index) => {
        const indexData = isObject(data) ? { ...data, [INDEX]: index } : data
        const { value } = findObjectValue(indexData, valueName)
        
        if (isSelected && !hasTemplate) {
          this.setValue(el, [ value ])
        } else {
          this.appendElement(el, value, templateProp)
          const isLastItem = (index === dataArray.length - 1)
          if (hasSeparator && !isLastItem) {
            el.append(this.createElement(separatorObj, separatorElem))
          }
        }
      })
    // }
  }

  appendElement(el, data, templateProp) {
    assert(isElement(el), 1, 'HTMLElement')

    templateProp ||= this.datasetHelper.getValue(el, 'template')
    let templateElem = createTemplateHandler(templateProp).getTemplate(data)
    if (!isElement(templateElem)) {
      templateElem = createDefaultChild(el, data)
    }
    const newElem = this.createElement(data, templateElem)
    removeClass(newElem, 'ajax-form-submit-initialized')
    isElement(newElem) && el.append(newElem)
    elementIs(el, ['svg', 'g']) && (el.innerHTML += '')
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
    assert(isElement(el), 1, 'HTMLElement')

    const inputSource = this.datasetHelper.getValue(el, 'input-source')
    if (!isNotBlank(inputSource))
      return

    const sourceProps = createHandler(inputSource)
    const keyName = sourceProps.value[0] ?? el.getAttribute('name')
    sourceProps.type.forEach(type => {
      switch(type) {
        case 'querystring': {
          const querystring = new URLSearchParams(location.search)
          querystring.forEach((value, key) => {
            if (key === keyName)
              el.value = value
            if (!hasValue(el.value))
              el.value = ''
          })
        }
      }
    })
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
    if (isNotBlank(valueFormat)) {
      valueFormat.split(' ').filter(str => isNotBlank(str))
        .forEach(value => addClass(el, value))
    }
  }

  setAttr(el, values, attrName) {
    assert(isElement(el), 1, 'HTMLElement')
    
    const tag = attrName.replace('attr-', '')
    const format = this.datasetHelper.getValue(el, `attr-${tag}-format`)
    const enums = this.datasetHelper.getValue(el, `attr-${tag}-enum`)
    const valueFormat = this.generateValue(values, { format, enums })

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
    
    if (elementIs(el, 'input') || elementIs(el, 'select')) {
      if (el.getAttribute('type') === 'checkbox') {
        if (isTrue(valueFormat)) {
          el.setAttribute('checked', 'checked')
        } else {
          el.removeAttribute('checked')
        }
      } else {
        el.value = valueFormat
      }
    } else if (elementIs(el, 'a')) {
      const link = addBasePath(valueFormat, this.basePath)
      if (hasClass(el, 'link-with-js')) {
        el.style.cursor = 'pointer'
        registerEvent(el, 'click', event => location.href = link)
      } else {
        el.setAttribute('href', link)
      }
    } else if (elementIs(el, 'img') || elementIs(el, 'iframe')) {
      el.setAttribute('src', valueFormat)
    } else if (elementIs(el, 'form')) {
      el.setAttribute('action', addBasePath(valueFormat, this.basePath))
    } else {
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
        const dateValues = validValues.map(value => new Date(parseInt(value)).format(valueTypeFormat || 'yyyy/MM/dd'))
        return processString(format, dateValues)
      case 'string':
        return processString(format, processEnum(enums, validValues))
      case 'number':
        const numberValue = formatNumber(validValues.reduce((a, b) => a + Number(b), 0), valueTypeFormat)
        const numberEnum = processEnum(enums, numberValue)
        return numberEnum === numberValue ? processString(format, numberEnum) : numberEnum
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
        enums = createHandler(props)
      }
    }
  }
 
  return result
}
