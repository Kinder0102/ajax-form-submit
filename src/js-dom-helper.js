import { OBJECT, FUNCTION, ARRAY, STRING_NON_BLANK, HTML_ELEMENT } from './js-constant.js'
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
} from './js-utils.js'

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
} from './js-dom-utils.js'

import { createDatasetHelper } from './js-dataset-helper.js'
import { createProperty, createFilter, createTemplateHandler } from './js-property-factory.js'
import { createCache } from './js-cache.js'

const BASE_PATH = '/'
const CLASS_NAME = 'dom-helper'
const CREATE_CLASS_NAME = `${CLASS_NAME}-create`
const FILLED_CLASS_NAME = `${CLASS_NAME}-filled`
const INDEX = `${CLASS_NAME}-index`
const SEQ_NAME = `${CLASS_NAME}-seq`
const VALUE_NAME = `${CLASS_NAME}-value`
const ATTR_IGNORE_KEYS = [ 'format', 'enum', 'value-type' ]
const ATTR_BOOLEAN_KEYS = [ 'disabled' ]
const TEMPLATE_KEY = 'template'
const ELEMENT_CACHE = createCache()

let SET_VALUE_HANDLERS = {
  input: (el, value, props) => el.type === 'checkbox' ? (el.checked = isTrue(value)) : (el.value = value),
  select: (el, value, props) => el.value = value,
  a: (el, value, props) => el.setAttribute('href', addBasePath(value, props.basePath)),
  img: (el, value, props) => el.setAttribute('src', value),
  iframe: (el, value, props) => el.setAttribute('src', value),
  object: (el, value, props) => el.setAttribute('data', value),
  form: (el, value, props) => el.setAttribute('action', addBasePath(value, props.basePath)),
  fallback: (el, value) => el.textContent = value
}

let GENERATE_VALUE_HANDLERS = {
  date: (values, { format, valueTypeFormat }) =>
    formatString(format, values.map(value => formatDate(value, valueTypeFormat))),
  string: (values, { format, enums }) =>
    formatString(format, processEnum(enums, values)),
  image: (values, { format, enums }) =>
    formatString(format, processEnum(enums, processImage(values, valueTypeFormat))),
  number: (values, { format, enums, valueTypeFormat }) =>
    formatString(format, processEnum(enums, processNumber(values.reduce((a, b) => a + Number(b), 0), valueTypeFormat))),
  percentage: (values, { format, enums }) =>
    processEnum(enums, `${formatNumber((values.reduce((a, b) => a + Number(b), 0) * 100), format)}%`),
  fallback: (values, props) => processEnum(props.enums, values).join()
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
    assert(isElement(el), 1, HTML_ELEMENT)

    const { template, group = 'item' } = opts
    const { getValue } = this.#datasetHelper
    const templateProp = template || getValue(el, TEMPLATE_KEY)
    
    if (isArray(value) || isNotBlank(templateProp)) {
      const result = this.#setArrayToElement(el, toArray(value), templateProp)
      const { empty: [empty] = [] } = createProperty(getValue(el, TEMPLATE_KEY))[0]
      ELEMENT_CACHE.set(el, (elements = {}) => {
        elements[group] ||= []
        result.forEach(elem => elements[group].push(elem))
        if (result.length === 0 && isNotBlank(empty))
          elements[group].push(...this.#setArrayToElement?.(el, [{}], empty))
        return elements
      })
    } else {
      this.#setValueToElement(el, value)
    }
  }

  clearElement(el, group = 'item') {
    assert(isElement(el), 1, HTML_ELEMENT)
    ELEMENT_CACHE.set(el, (elements = {}) => {
      elements[group] ||= []
      elements[group].forEach(elem => {
        elem?.remove?.()
        querySelector(`.${FILLED_CLASS_NAME}`, elem, true).forEach(fill => this.#setValue(fill, ''))
      })
      elements[group].length = 0
      return elements
    })
    if (group === 'item')
      this.#datasetHelper.setValue(el, 'array-seq', 0)
  }

  #setValueToElement(el, value) {
    if (!hasValue(value))
      return
    this.#setDisplay(el, value)
    const { getKeys, keyToAttrName } = this.#datasetHelper
    const attrKey = 'attr'
    const attrElems = querySelector('*', el, true)
    const classKey = 'class'
    const classElems = querySelector(`[${keyToAttrName(classKey)}]`, el, true)
    const valueKey = 'value'
    const valueElems = querySelector(`[${keyToAttrName(valueKey)}]`, el, true)

    attrElems.forEach(elem => getKeys(elem, attrKey)
      .filter(({ key }) => !ATTR_IGNORE_KEYS.some(attr => key === attr))
      .forEach(({ key }) => this.#fillElement(elem, value, key, this.#setAttr.bind(this))))
    classElems.forEach(elem => this.#fillElement(elem, value, classKey, this.#setClass.bind(this)))
    valueElems.forEach(elem => this.#fillElement(elem, value, valueKey, this.#setValue.bind(this)))
  }

  #setArrayToElement(el, arr, template) {
    const result = []
    const { getValue, setValue, keyToDatasetName } = this.#datasetHelper

    if (keyToDatasetName('array-length') in el.dataset) {
      this.#setValue(el, arr.length)
      return result
    }

    const templateProp = template || getValue(el, TEMPLATE_KEY)
    const valueName = getValue(el, 'array-value')
    let arraySeq = parseInt(getValue(el, 'array-seq')) || 0

    getArray(arr, getValue(el, 'array-index')).forEach((data, index) => {
      const objValue = isObject(data) ? data : { [VALUE_NAME]: data }
      const indexdData = { ...objValue, [INDEX]: index, [SEQ_NAME]: arraySeq }
      const { value } = findObjectValue(indexdData, valueName)
      if (isArray(value)) {
        const fragment = document.createDocumentFragment()
        this.#setArrayToElement(fragment, value, templateProp)
        el.append(fragment)
        result.push(fragment)
      } else {
        result.push(this.#appendElement(el, value, templateProp))
      }
      arraySeq += 1
      setValue(el, 'array-seq', arraySeq)
    })
    return result.filter(hasValue)
  }

  #appendElement(el, data, template) {
    if (elementIs(el, ['input', 'select'])) {
      el.value = data
    } else {
      const elem = createTemplateHandler(template).getTemplate(data)
      this.setValueToElement(elem, data)
      if (!elem._removed) {
        addClass(elem, CREATE_CLASS_NAME)
        el.append(elem)
        return elem
      }
    }
  }

  #setDisplay(el, data) {
    const { keyToAttrName, getValue } = this.#datasetHelper

    const hiddenKey = 'hidden'
    querySelector(`[${keyToAttrName(hiddenKey)}]`, el, true).forEach(elem =>
      reduceFilter(data, getValue(elem, hiddenKey)) ? hideElements(elem) : showElements(elem))

    const filterKey = 'filter'
    querySelector(`[${keyToAttrName(filterKey)}]`, el, true).forEach(elem => {
      if (!reduceFilter(data, getValue(elem, filterKey))) {
        elem.remove()
        elem._removed = true
      }
    })
  }

  #fillElement(el, obj, datasetName, handler) {
    const attrValue = this.#datasetHelper.getValue(el, datasetName, '')
    const { value: keys } = createProperty(attrValue)[0]
    const arrayValues = []
    const values = []
    keys.forEach(key => {
      const { exist, value } = findObjectValue(obj, key)
      if (!exist) {
      } else if (isArray(value)) {
        arrayValues.push(value)
      } else {
        values.push(valueToString(value))
      }
    })
    handler(el, values, arrayValues, datasetName)
  }

  #setClass(el, value, arrayValues) {
    const enums = this.#datasetHelper.getValue(el, 'class-enum')
    const valueFormat = this.#generateValue(value, { enums })
    split(valueFormat).filter(isNotBlank).forEach(value => addClass(el, value))
  }

  #setAttr(el, value, arrayValues, attrName) {
    //TODO attr case insensitive
    let tag = attrName.replace('attr-', '')
    const { getValue } = this.#datasetHelper
    const valueFormat = this.#generateValue(value, {
      format: getValue(el, `attr-${tag}-format`),
      valueType: getValue(el, `attr-${tag}-type`),
      valueTypeFormat: getValue(el, `attr-${tag}-type-format`),
      enums: getValue(el, `attr-${tag}-enum`)
    })

    if (!hasValue(valueFormat))
      return

    if (!tag.includes('data-'))
      tag = toCamelCase(tag)

    if (ATTR_BOOLEAN_KEYS.includes(tag)) {
      if (isTrue(valueFormat))
        el.toggleAttribute(tag)
    } else {
      el.setAttribute(tag, valueFormat)
    }
  }

  #setValue(el, value, arrayValues) {
    if (arrayValues?.length > 0) {
      arrayValues.forEach(value => this.#setArrayToElement(el, value))
    } else {
      addClass(el, FILLED_CLASS_NAME)
      const { getValue } = this.#datasetHelper
      const valueFormat = this.#generateValue(value, {
        format: getValue(el, 'value-format'),
        valueType: getValue(el, 'value-type'),
        valueTypeFormat: getValue(el, 'value-type-format'),
        enums: getValue(el, 'value-enum')
      })

      if (!hasValue(valueFormat))
        return
      const handler = SET_VALUE_HANDLERS[el.tagName?.toLowerCase()] || SET_VALUE_HANDLERS.fallback
      handler(el, valueFormat, { basePath: this.#basePath })
    }
  }

  #generateValue(value, { valueType = 'string', ...props }) {
    const values = toArray(value)
    const handler = GENERATE_VALUE_HANDLERS[valueType] || GENERATE_VALUE_HANDLERS.fallback
    return values.length === 0 ? null : handler(values, props)
  }
}

function getArray(arr, index) {
  if (!isArray(arr))
    return []
  if (hasValue(index)) {
    return toArray((index === 'first') ? arr[0] : (index === 'last') ? arr[arr.length - 1] : arr[index])
  } else {
    return arr
  }
}

function reduceFilter(data, props) {
  const filter = createFilter(props)
  return filter.keys.reduce((isValid, key) => {
    const { exist, value } = findObjectValue(data, key)
    return exist ? isValid && filter.filter(key, value) : isValid
  }, true)
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
  return inputs.map(input => isNotBlank(value) ? input.replace(pattern, `${value}$&`) : input)
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
