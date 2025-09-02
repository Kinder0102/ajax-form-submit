import { HTML_ELEMENT, HTML_INPUT, HTML_SELECT, HTML_CHECKBOX } from '#libs/js-constant'

import {
  assert,
  hasValue,
  isTrue,
  isNotBlank,
  isArray,
  isObject,
  isElement,
  objectEntries,
  valueToString,
  stringToValue,
  split,
  toArray,
  findObjectValue,
  formatNumber,
  formatString,
  formatDate,
  startsWith,
  endsWith,
  addBasePath,
  toCamelCase
} from '#libs/js-utils'

import {
  elementIs,
  addClass,
  querySelector,
  showElements,
  hideElements
} from '#libs/js-dom-utils'

import { createDatasetHelper } from '#libs/js-dataset-helper'
import { createProperty, createFilter, createTemplateHandler } from '#libs/js-property-factory'
import { createCache } from '#libs/js-cache'

const BASE_PATH = '/'
const CLASS_NAME = 'dom-helper'
const CREATE_CLASS_NAME = `${CLASS_NAME}-create`
const FILLED_CLASS_NAME = `${CLASS_NAME}-filled`
const SEQ_CLASS_NAME = `${CLASS_NAME}-seq`
const ATTR_IGNORE_KEYS = [ 'format', 'enum', 'value-type' ]
const ATTR_BOOLEAN_KEYS = [ 'disabled' ]
const ATTR_SEQ = 'array-seq'
const CURRENT_INDEX_KEY = 'current-index'
const TEMPLATE_KEY = 'template'
const PARENT_KEY = 'parent'
const ELEMENT_CACHE = createCache()

let FIND_VALUE_HANDLERS = {
  value: (value, key) => value,
  index: (value, key, el, helper) =>
    split(helper.getValue(el.closest(`.${SEQ_CLASS_NAME}`), ATTR_SEQ, ''))[key.split(PARENT_KEY).length - 1],
}

let SET_VALUE_HANDLERS = {
  input: (el, value) => el.type === HTML_CHECKBOX ? (el.checked = isTrue(value)) : (el.value = value),
  select: (el, value) => el.value = value,
  img: (el, value) => el.src = value,
  iframe: (el, value) => el.src = value,
  object: (el, value) => el.data = value,
  source: (el, value) => el.srcset = value,
  a: (el, value, props) => el.href = addBasePath(value, props.basePath),
  form: (el, value, props) => el.action = addBasePath(value, props.basePath),
  fallback: (el, value) => el.textContent = value
}

let GENERATE_VALUE_HANDLERS = {
  date: (values, { format, valueTypeFormat }) =>
    formatString(format, values.map(value => formatDate(value, valueTypeFormat))),
  string: (values, { format, enums, valueTypeFormat }) =>
    formatString(format, processEnum(enums, replaceString(values, valueTypeFormat))),
  number: (values, { format, enums, valueTypeFormat }) =>
    formatString(format, processEnum(enums,
      processNumber(values.reduce((a, b) => a + Number(b), 0), valueTypeFormat))),
  percentage: (values, { format, enums }) =>
    processEnum(enums, `${formatNumber((values.reduce((a, b) => a + Number(b), 0) * 100), format)}%`),
  fallback: (values, props) => processEnum(props.enums, values).join()
}

export default class DOMHelper {

  #prefix
  #basePath
  #datasetHelper

  constructor(opts = {}) {
    this.#prefix = opts.prefix
    this.#basePath = opts.basePath || BASE_PATH
    this.#datasetHelper = createDatasetHelper(opts.prefix)
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
        querySelector(`.${FILLED_CLASS_NAME}`, elem, true)
          .forEach(fill => this.#setValue(fill, ''))
      })
      elements[group].length = 0
      return elements
    })
    if (group === 'item')
      this.#datasetHelper.setValue(el, CURRENT_INDEX_KEY, 0)
  }

  #setValueToElement(el, value) {
    if (!hasValue(value))
      return

    this.#setDisplay(el, value)
    if (!isObject(value)) {
      this.#setValue(el, value)
    } else {
      const { getKeys, keyToAttrName } = this.#datasetHelper
      const attrKey = 'attr'
      const attrElems = querySelector('*', el, true)
      const classKey = 'class'
      const classElems = querySelector(`[${keyToAttrName(classKey)}]`, el, true)
      const valueKey = 'value'
      const valueElems = querySelector(`[${keyToAttrName(valueKey)}]`, el, true)

      attrElems.forEach(elem => getKeys(elem, attrKey)
        .filter(({ key }) => !ATTR_IGNORE_KEYS.some(attr => endsWith(key, attr).exist))
        .forEach(({ key }) => this.#fillElement(elem, value, key, this.#setAttr.bind(this))))
      classElems.forEach(elem => this.#fillElement(elem, value, classKey, this.#setClass.bind(this)))
      valueElems.forEach(elem => this.#fillElement(elem, value, valueKey, this.#setValue.bind(this)))
    }
  }

  #setArrayToElement(el, arr, template) {
    const result = []
    const { getValue, setValue } = this.#datasetHelper
    const templateProp = template || getValue(el, TEMPLATE_KEY)
    const valueName = getValue(el, 'array-value')
    let currentIndex = parseInt(getValue(el, CURRENT_INDEX_KEY)) || 0
    
    getArray(arr, getValue(el, 'array-index')).forEach(data => {
      const { value } = findObjectValue(data, valueName)
      let child
      if (isArray(value)) {
        child = document.createDocumentFragment()
        this.#setArrayToElement(child, value, templateProp)
      } else if (!hasValue(templateProp) && elementIs(el, [HTML_INPUT, HTML_SELECT])) {
        el.value = value
      } else {
        child = createTemplateHandler(templateProp).getTemplate(value)
        const seqPath = getValue(el.closest(`.${SEQ_CLASS_NAME}`), ATTR_SEQ, '')
        addClass(child, [CREATE_CLASS_NAME, SEQ_CLASS_NAME])
        setValue(child, ATTR_SEQ, `${currentIndex++},${seqPath}`)
        this.setValueToElement(child, value)
        setValue(el, CURRENT_INDEX_KEY, currentIndex)
      }

      if (isElement(child) && !child._removed) {
        el.append(child)
        result.push(child)
      }
    })
    return result
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

  #fillElement(el, obj, datasetName, fillHandler) {
    const attrValue = this.#datasetHelper.getValue(el, datasetName, '')
    const { value: keys } = createProperty(attrValue)[0]
    const arrayValues = []
    const values = []

    keys.forEach(key => {
      const { exist: isStartWith, value: type } = startsWith(key, `${CLASS_NAME}`)
      const { exist, value } = isStartWith
        ? (() => {
            const [_, handler] = objectEntries(FIND_VALUE_HANDLERS).find(([name]) => type.includes(name)) || []
            const value = handler?.(obj, key, el, this.#datasetHelper)
            return { exist: hasValue(value), value }
          })()
        : findObjectValue(obj, key)

      if (!exist) {
      } else if (isArray(value)) {
        arrayValues.push(value)
      } else {
        values.push(valueToString(value))
      }
    })
    fillHandler(el, values, arrayValues, datasetName)
  }

  #setClass(el, value, arrayValues) {
    const { getValue } = this.#datasetHelper
    const valueFormat = this.#generateValue(value, {
      format: getValue(el, `class-format`),
      enums: getValue(el, 'class-enum')
    })
    split(valueFormat).filter(isNotBlank).forEach(value => addClass(el, value))
  }

  #setAttr(el, value, arrayValues, attrName) {
    let tag = attrName.replace('attr-', '')
    const { getValue } = this.#datasetHelper
    const valueFormat = this.#generateValue(value, {
      format: getValue(el, `attr-${tag}-format`),
      valueType: getValue(el, `attr-${tag}-type`),
      valueTypeFormat: getValue(el, `attr-${tag}-type-format`),
      enums: getValue(el, `attr-${tag}-enum`)
    })

    if (hasValue(valueFormat)) {
      !tag.includes('data-') && (tag = toCamelCase(tag))
      el.setAttribute(tag, ATTR_BOOLEAN_KEYS.includes(tag) ? isTrue(valueFormat) : valueFormat)
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

function replaceString(inputs, valueTypeFormat) {
  const format = createProperty(valueTypeFormat)[0]
  const value = format.value[0]
  const pattern = new RegExp(format.pattern?.[0] ?? /\.\w+$/, 'gi')
  return inputs.map(input => isNotBlank(value) ? input.replace(pattern, value) : input)
}

function processNumber(input, valueTypeFormat) {
  const format = createProperty(valueTypeFormat)[0]
  format['*']?.forEach(value => input *= value)
  format['/']?.forEach(value => input /= value)
  format['+']?.forEach(value => input += value)
  format['-']?.forEach(value => input -= value)
  return formatNumber(input, format['.']?.[0])
}

function processEnum(enumProps, args = []) {
  if (!isNotBlank(enumProps))
    return args

  let enums = {}
  if (isObject(window[enumProps])) {
    enums = window[enumProps]
  } else {
    const el = querySelector(enumProps)[0]
    if (isElement(el)) {
      if (hasValue(el.options)) {
        toArray(el.options).forEach(({ value, text }) => (enums[value] = text))
      } else {
        enums = stringToValue(el.value)
      }
    } else {
      enums = createProperty(enumProps)[0]
    }
  }
  return args.map(key => toArray(enums[key] ?? enums.default ?? key)[0])
}
