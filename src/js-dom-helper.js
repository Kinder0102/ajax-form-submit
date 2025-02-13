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
const SEQ_NAME = `${CLASS_NAME}-seq`
const VALUE_NAME = `${CLASS_NAME}-value`
const ATTR_IGNORE_KEYS = [ 'format', 'enum', 'value-type', 'value-empty' ]
const ATTR_BOOLEAN_KEYS = [ 'disabled' ]


let SET_VALUE_HANDLERS = {
  input: (el, value, props) => {
    if (el.getAttribute('type') === 'checkbox') {
      if (isTrue(value)) {
        el.setAttribute('checked', 'checked')
      } else {
        el.removeAttribute('checked')
      }
    } else {
      el.value = value
    }
  },
  select: (el, value, props) => el.value = value,
  a: (el, value, props) => el.setAttribute('href', addBasePath(value, props.basePath)),
  img: (el, value, props) => el.setAttribute('src', value),
  iframe: (el, value, props) => el.setAttribute('src', value),
  object: (el, value, props) => el.setAttribute('data', value),
  form: (el, value, props) => el.setAttribute('action', addBasePath(value, props.basePath)),
}

let GENERATE_VALUE_HANDLERS = {
  date: (values, { format, valueTypeFormat }) =>
    processString(format, values.map(value => formatDate(value, valueTypeFormat))),
  string: (values, { format, enums }) =>
    processString(format, processEnum(enums, values)),
  image: (values, { format, enums }) =>
    processString(format, processEnum(enums, processImage(values, valueTypeFormat))),
  number: (values, { format, enums, valueTypeFormat }) => {
    const number = processNumber(values.reduce((a, b) => a + Number(b), 0), valueTypeFormat)
    return processString(format, processEnum(enums, number))
  },
  percentage: (values, { format, enums }) =>
    processEnum(enums, `${formatNumber((values.reduce((a, b) => a + Number(b), 0) * 100), format)}%`),
}

export default class DOMHelper {

  #prefix
  #basePath
  #datasetHelper

  constructor(opt = {}) {
    this.#prefix = opt.prefix
    this.#basePath = opt.basePath || BASE_PATH
    this.#datasetHelper = createDatasetHelper(opt.prefix)
  }

  setValueToElement(el, value, opts = {}) {
    const { template } = opts
    assert(isElement(el), 1, 'HTMLElement')
    
    const templateProp = getTemplateSelector(el, template, this.#datasetHelper)
    if (isArray(value) || isNotBlank(templateProp)) {
      this.setArrayToElement(el, toArray(value), { template: templateProp })
    } else if (hasValue(value)) {
      this.setDisplay(el, value)
      const { keyToAttrName } = this.#datasetHelper
      const valueKey = 'value'
      const valueElems = querySelector(`[${keyToAttrName(valueKey)}]`, el, true)
      const classKey = 'class'
      const classElems = querySelector(`[${keyToAttrName(classKey)}]`, el, true)
      const attrKey = 'attr'
      const attrElems = querySelector('*', el, true)

      attrElems.forEach(elem => this.#datasetHelper.getKeys(elem, attrKey)
        .filter(({ key }) => !ATTR_IGNORE_KEYS.some(attr => key === attr))
        .forEach(({ key }) => this.fillElement(elem, value, key, this.setAttr.bind(this))))
      classElems.forEach(elem => this.fillElement(elem, value, classKey, this.setClass.bind(this)))
      valueElems.forEach(elem => this.fillElement(elem, value, valueKey, this.setValue.bind(this)))
    }
  }

  setArrayToElement(el, arr, opts = {}) {
    assert(isElement(el), 1, 'HTMLElement')
    assert(isArray(arr), 2, 'Array')

    if (el.hasAttribute?.(this.#datasetHelper.keyToAttrName('array-length'))) {
      this.setValue(el, [ arr.length ])
      return
    }

    const { template } = opts
    const templateProp = getTemplateSelector(el, template, this.#datasetHelper)
    const indexKey = { first: 0, last: arr.length - 1 }
    const arrayIndexKey = this.#datasetHelper.getValue(el, 'array-index')
    const arrayIndex = indexKey[arrayIndexKey] ?? arrayIndexKey
    const valueName = this.#datasetHelper.getValue(el, 'array-value')
    const emptyTemplate = this.#datasetHelper.getValue(el, 'value-empty')
    const dataArray = (hasValue(arrayIndex) ? [ arr[arrayIndex] ] : arr).filter(hasValue)
    let arraySeq = parseInt(this.#datasetHelper.getValue(el, 'array-seq')) || 0

    dataArray.forEach((data, index) => {
      let objValue = isObject(data) ? data : { [VALUE_NAME]: data }
      objValue[SEQ_NAME] = arraySeq
      const indexData = { ...objValue, [INDEX]: index }
      const { value } = findObjectValue(indexData, valueName)
      if (isArray(value)) {
        const fragment = document.createDocumentFragment()
        this.setArrayToElement(fragment, value, { template: templateProp })
        el.append(fragment)
      } else {
        this.appendElement(el, value, templateProp)
      }
      arraySeq += 1
      this.#datasetHelper.setValue(el, 'array-seq', arraySeq)
    })

    if (arraySeq === 0 && isNotBlank(emptyTemplate)) {
      this.appendElement(el, null, emptyTemplate)
    }
  }

  appendElement(el, data, templateProp) {
    assert(isElement(el), 1, 'HTMLElement')

    if (elementIs(el, ['input', 'select'])) {
      el.value = data
      return el
    } else {
      const newElem = this.createElement(data, createTemplate(templateProp, {
        datasetHelper: this.#datasetHelper,
        parent: el,
        data: data,
        withDefault: true,
        preventClone: true
      }))
      isElement(newElem) && el.append(newElem)
      return newElem
    }
  }

  createElement(data, templateProp) {
    let newElem = createTemplate(templateProp)

    assert(isElement(newElem), `template not found: ${templateProp}`)

    addClass(newElem, CREATE_CLASS_NAME)
    this.setValueToElement(newElem, data)

    if (!hasClass(newElem, REMOVE_CLASS_NAME))
      return newElem
  }

  clearElement(el) {
    assert(isElement(el), 1, 'HTMLElement')
    querySelector(`.${CREATE_CLASS_NAME}`, el, true).forEach(elem => elem.remove())
    querySelector(`.${FILLED_CLASS_NAME}`, el, true).forEach(elem => this.setValue(elem, ['']))
    this.#datasetHelper.setValue(el, 'array-seq', 0)
  }

  fillElement(el, obj, datasetName, handler) {
    assert(isElement(el), 1, 'HTMLElement')
    assert(isObject(obj), 2, 'Object')
    assert(isNotBlank(datasetName), 3, 'NonBlankString')
    assert(isFunction(handler), 4, 'Function')

    const attrValue = this.#datasetHelper.getValue(el, datasetName, '')
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

    const { keyToAttrName, getValue } = this.#datasetHelper
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

    const enums = this.#datasetHelper.getValue(el, 'class-enum')
    const valueFormat = this.generateValue(classNames, { enums })
    split(valueFormat).filter(isNotBlank).forEach(value => addClass(el, value))
  }

  setAttr(el, values, attrName) {
    assert(isElement(el), 1, 'HTMLElement')
    //TODO attr case insensitive
    let tag = attrName.replace('attr-', '')
    const valueFormat = this.generateValue(values, {
      format: this.#datasetHelper.getValue(el, `attr-${tag}-format`),
      valueType: this.#datasetHelper.getValue(el, `attr-${tag}-type`),
      valueTypeFormat: this.#datasetHelper.getValue(el, `attr-${tag}-type-format`),
      enums: this.#datasetHelper.getValue(el, `attr-${tag}-enum`)
    })

    if (hasValue(valueFormat)) {
      if (!tag.includes('data-'))
        tag = toCamelCase(tag)

      if (ATTR_BOOLEAN_KEYS.includes(tag)) {
        if (isTrue(valueFormat))
          el.toggleAttribute(tag)
      } else {
        el.setAttribute(tag, valueFormat)
      }
    }
  }

  setValue(el, values) {
    assert(isElement(el), 1, 'HTMLElement')

    addClass(el, FILLED_CLASS_NAME)
    const valueFormat = this.generateValue(values, {
      format: this.#datasetHelper.getValue(el, 'value-format'),
      valueType: this.#datasetHelper.getValue(el, 'value-type'),
      valueTypeFormat: this.#datasetHelper.getValue(el, 'value-type-format'),
      enums: this.#datasetHelper.getValue(el, 'value-enum')
    })

    if (hasValue(valueFormat)) {
      let handler = SET_VALUE_HANDLERS[el.tagName?.toLowerCase()]
      handler ||= ((el, value) => el.textContent = valueFormat)
      handler(el, valueFormat, { basePath: this.#basePath })
    }
  }

  generateValue(values, { valueType = 'string', ...props }) {
    const validValues = values.filter(value => hasValue(value))
    if (validValues.length === 0)
      return
    let handler = GENERATE_VALUE_HANDLERS[valueType]
    handler ||= ((values, props) => processEnum(props.enums, values).join())
    return handler(validValues, props)
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

function processImage(inputs, valueTypeFormat) {
  const format = createProperty(valueTypeFormat)[0]
  const value = format.value[0]
  const pattern = format.pattern?.[0] || /\.\w+$/
  return inputs.map(input => {
    if (isNotBlank(value)) {
      return input.replace(pattern, `${value}$&`)
    } else {
      return input
    }
  })
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

function getTemplateSelector(el, value, datasetHelper) {
  if (datasetHelper)
    return value || datasetHelper.getValue(el, 'template')
  return value
}

function createTemplate(templateProp, opts = {}) {
  const { parent, data, datasetHelper, withDefault, preventClone } = opts
  let templateElem

  if (isElement(templateProp)) {
    templateElem = preventClone ? templateProp : templateProp.cloneNode(true)
  } else {
    const templateSelector = getTemplateSelector(parent, templateProp, datasetHelper)
    templateElem = createTemplateHandler(templateProp).getTemplate()
  }

  if (!isElement(templateElem) && withDefault) {
    templateElem = document.createElement('span')
    templateElem.value = data
    templateElem.textContent = data
  }
  return templateElem
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
