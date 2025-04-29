import {
  assert,
  isFunction,
  isNotBlank,
} from './js-utils'

import {
  querySelector,
  triggerEvent,
  stopDefaultEvent,
} from './js-dom-utils'

let BEFORE_HANDLERS = {
  reset: handleReset,
  clear: handleClear
}

let AFTER_HANDLERS = {
  submit: handleSubmit
}

export default class AjaxFormSubmitResetHandler {

  static add = (type, callback, after) => {
    assert(isNotBlank(type), 1, 'NonBlankString')
    assert(isFunction(callback), 1, 'Function')
    if (after) {
      AFTER_HANDLERS[type] = callback
    } else {
      BEFORE_HANDLERS[type] = callback
    }
  }

  #root

  constructor(el) {
    this.#root = el
  }

  run(props) {
    props?.type?.forEach(type => BEFORE_HANDLERS[type]?.(this.#root))
    this.#root?.reset?.()
    requestAnimationFrame?.(() => props?.type?.forEach(type => AFTER_HANDLERS[type]?.(this.#root)))
  }
}

function handleReset(el, opt) {
}

function handleClear(el, opt) {
  querySelector('[name]', el).forEach(field => {
    const { type, tagName, disabled } = field
    const tag = tagName.toLowerCase()

    if (type === 'hidden' || disabled)
      return

    field.defaultValue = ''
    if (type === 'checkbox' || type === 'radio')
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

function handleSubmit(el, opt) {
  triggerEvent(el, 'submit')
}
