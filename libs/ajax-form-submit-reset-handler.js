import { STRING_NON_BLANK, FUNCTION, HTML_CHECKBOX, HTML_RADIO } from './js-constant.js'
import { assert, isFunction, isNotBlank } from './js-utils.js'
import { querySelector, triggerEvent } from './js-dom-utils.js'

let HANDLERS_BEFORE = { clear }
let HANDLERS_AFTER = { submit }

export default class AjaxFormSubmitResetHandler {

  static add = addHandler(HANDLERS_BEFORE, HANDLERS_AFTER)

  #root
  #handlerBefore
  #handlerAfter

  constructor(el) {
    this.#root = el
    this.#handlerBefore = { ...HANDLERS_BEFORE }
    this.#handlerAfter = { ...HANDLERS_AFTER }
    this.add = addHandler(this.#handlerBefore, this.#handlerAfter)
  }

  run({ type = [] } = {}) {
    type.forEach(type => this.#handlerBefore[type]?.(this.#root))
    this.#root?.reset?.()
    requestAnimationFrame?.(() => type.forEach(type => this.#handlerAfter[type]?.(this.#root)))
  }
}

function addHandler(cacheBefore = {}, cacheAfter = {}) {
  return (type, callback, after) => {
    assert(isNotBlank(type), 1, STRING_NON_BLANK)
    assert(isFunction(callback), 1, FUNCTION)
    if (after) {
      cacheAfter[type] = callback
    } else {
      cacheBefore[type] = callback
    }
  }
}

function clear(el, opts) {
  querySelector('[name]', el).forEach(field => {
    const { type, tagName, disabled } = field
    const tag = tagName.toLowerCase()

    if (type === 'hidden' || disabled)
      return

    field.defaultValue = ''
    if (type === HTML_CHECKBOX || type === HTML_RADIO)
      field.defaultChecked = false
    if (tag === 'select') {
      const options = field.options
      for (let i = 0; i < options.length; i++) {
        options[i].defaultSelected = false
      }
      field.selectedIndex = field.multiple ? -1 : 0
    }
  })
}

function submit(el, opts) {
  triggerEvent(el, 'submit')
}
