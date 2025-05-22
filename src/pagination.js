import {
  FUNCTION,
  OBJECT,
  HTML_ELEMENT
} from '#libs/js-constant'

import {
  assert,
  hasValue,
  toArray,
  isNotBlank,
  isObject,
  isFunction,
  isElement,
  throttle
} from '#libs/js-utils'

import {
  querySelector,
  elementIs,
  hasClass,
  addClass,
  removeClass,
  showElements,
  hideElements,
  registerEvent,
  registerMutationObserver
} from '#libs/js-dom-utils'

import { createDatasetHelper } from '#libs/js-dataset-helper'
import { createConfig } from '#libs/js-config'
import { createInstanceMap } from '#libs/js-cache'
import { Plugin } from '#libs/js-plugin'

const PREFIX = 'page'
const CLASS_NAME = 'pagination'
const INIT_CLASS_NAME = `${CLASS_NAME}-initialized`
const EVENT_NEXT = `${CLASS_NAME}:next`
const EVENT_SCROLL = 'scroll'

const DEFAULT_CONFIG = {
  'nav-class': '',
  'button-class': '',
  'number-button-class': '',
  'arrow-button-class': '',
  'first-label': '<<',
  'prev-label': '<',
  'next-label': '>',
  'last-label': '>>',
  getPageStat: (pageProp = {}) => ({
    size: pageProp.size || 0,
    currentPage: parseInt(pageProp.number) || 0,
    totalPage: pageProp.totalPages - 1 || 0
  })
}

const EVENT_PAGING = 'ajax-form-submit:page-update'
const EVENT_LIFECYCLE_BEFORE = `ajax-form-submit:before`
const EVENT_LIFECYCLE_AFTER = `ajax-form-submit:after`
const EVENT_LIFECYCLE_RESET = `reset`

export default class Pagination {

  static config = {}
  static instance = createInstanceMap(
    el => isElement(el) && hasClass(el, CLASS_NAME) && !hasClass(el, INIT_CLASS_NAME),
    el => new Pagination(el))

  constructor(root) {
    assert(hasClass(root, CLASS_NAME), `Argument 1 must has class "${CLASS_NAME}"`)
    assert(!hasClass(root, INIT_CLASS_NAME), 'Argument 1 was initialized')

    const datasetHelper = createDatasetHelper(PREFIX)
    const mode = datasetHelper.getValue(root, 'mode') || 'button'
    const plugin = new Plugin(CLASS_NAME, root)
    const modeHandler = this.#createModeHandler(root, mode, datasetHelper,
      (page, size, parameters) => plugin.broadcast(EVENT_PAGING, { page, size, with: parameters }))

    registerEvent(root, [EVENT_LIFECYCLE_BEFORE, EVENT_LIFECYCLE_RESET], event => modeHandler.reset())
    registerEvent(root, EVENT_LIFECYCLE_AFTER, event => modeHandler.setPage(event.detail.page))
    addClass(root, INIT_CLASS_NAME)
  }

  #createModeHandler(root, mode, datasetHelper, callback) {
    const config = createConfig(Pagination.config, DEFAULT_CONFIG)
    switch(mode) {
      case 'button':
        return new ButtonMode(root, config, datasetHelper, callback)
      case 'scroll':
        return new ScrollMode(root, config, datasetHelper, callback)
    }
  }
}

class ScrollMode {

  #callback
  #pageStat
  #loading
  #threshold
  #isVertical
  #getPageStat

  constructor(root, config, datasetHelper, callback) {

    this.#callback = callback
    this.#pageStat = {}
    this.#loading = false
    this.#threshold = datasetHelper.getValue(root, 'threshold') || 0
    this.#isVertical = datasetHelper.getValue(root, 'direction') !== 'horizontal'
    this.#getPageStat = config.get('getPageStat').getPageStat

    const target = elementIs(root, ['html', 'body']) ? document : root
    registerEvent(target, EVENT_NEXT, event => this.#onPaging())
    registerEvent(target, EVENT_SCROLL, throttle(() => this.#isReachThreshold(target) && this.#onPaging()))
  }

  setPage(pageProp) {
    this.#pageStat = { ...this.#getPageStat(pageProp) }
    this.#loading = false
  }

  reset() {
  }

  #onPaging(parameters) {
    if (this.#loading)
      return
    const { currentPage, totalPage, size } = this.#pageStat
    if (currentPage > totalPage)
      return
    this.#loading = true
    this.#callback(currentPage + 1, size, [ 'append' ])
  }

  #isReachThreshold(container) {
    let scrollPos, scrollSize, clientSize

    if (container == document) {
      scrollPos  = (this.#isVertical)
                   ? (window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop)
                   : (window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft)

      scrollSize = (this.#isVertical)
                   ? (document.documentElement.scrollHeight || document.body.scrollHeight)
                   : (document.documentElement.scrollWidth  || document.body.scrollWidth)

      clientSize = (this.#isVertical)
                   ? document.documentElement.clientHeight
                   : document.documentElement.clientWidth

    } else {
      scrollPos  = this.#isVertical ? container.scrollTop : container.scrollLeft
      scrollSize = this.#isVertical ? container.scrollHeight : container.scrollWidth
      clientSize = this.#isVertical ? container.clientHeight : container.clientWidth
    }

    return scrollPos + clientSize >= scrollSize - this.#threshold
  }
}

class ButtonMode {

  #root
  #callback
  #pageStat
  #numberButtons
  #getPageStat
  #anchor
  #firstButton
  #prevButton
  #nextButton
  #lastButton
  #createNumberButton
  
  constructor(root, config, datasetHelper, callback) {
    hideElements(root)
    this.#root = root
    this.#callback = callback
    this.#pageStat = {}
    this.#numberButtons = []
    this.#getPageStat = config.get('getPageStat').getPageStat

    const getSetting = key => datasetHelper.getValue(root, key, config.get(key)[key])
    const anchor = getSetting('anchor')
    const navClass = getSetting('nav-class')
    const firstLabel = getSetting('first-label')
    const prevLabel = getSetting('prev-label')
    const nextLabel = getSetting('next-label')
    const lastLabel = getSetting('last-label')
    const buttonClass = getSetting('button-class')
    const numberButtonClass = getSetting('number-button-class')
    const arrowButtonClass = getSetting('arrow-button-class')
    const arrowClass = `${buttonClass} ${arrowButtonClass}`
    const numberClass = `${buttonClass} ${numberButtonClass}`
    const jumpInput = this.#createElement('input', arrowClass,
      { type: 'number', min: 1, step: 1, placeholder: '...' },
      { width: '4rem' })

    this.#anchor = querySelector(anchor)[0]?.offsetTop
    this.#firstButton = this.#createButton(firstLabel, arrowClass,
      event => this.#onPaging(event, 0, this.#pageStat.size))
    this.#prevButton = this.#createButton(prevLabel, arrowClass,
      event => this.#onPaging(event, this.#pageStat.currentPage - 1, this.#pageStat.size))
    this.#nextButton = this.#createButton(nextLabel, arrowClass,
      event => this.#onPaging(event, this.#pageStat.currentPage + 1, this.#pageStat.size))
    this.#lastButton = this.#createButton(lastLabel, arrowClass,
      event => this.#onPaging(event, this.#pageStat.totalPage, this.#pageStat.size))
    this.#createNumberButton = (number, size) => {
      const button = this.#createButton(number + 1, numberClass, event => this.#onPaging(event, number, size))
      jumpInput.before(button)
      return button
    }

    const nav = this.#createElement('nav', navClass)
    root.append(nav)
    nav.append(this.#firstButton, this.#prevButton, jumpInput, this.#nextButton, this.#lastButton)
    
    registerEvent(jumpInput, 'keydown', event => {
      const { key, target } = event
      const value = parseInt(target.value, 10)
      if (event.key === 'Enter' && value > 0) {
        this.#onPaging(event, value - 1, this.#pageStat.size)
        event.target.value = null
        event.target.blur()
      }
    })
  }

  setPage(pageProp) {
    this.#pageStat = { ...this.#getPageStat(pageProp) }
    const { size, currentPage, totalPage } = this.#pageStat
    const startPage = Math.max(0, currentPage - 2)
    const endPage = Math.min(totalPage, startPage + 4)
    
    this.reset()
    

    if (currentPage == 0)
      [this.#firstButton, this.#prevButton].forEach(button =>  button.disabled = true)

    if (currentPage >= totalPage)
      [this.#nextButton, this.#lastButton].forEach(button => button.disabled = true)

    for (let i = startPage; i <= endPage; i++) {
      const button = this.#createNumberButton(i, size)
      this.#numberButtons.push(button)
      if (i == currentPage) {
        button.setAttribute('aria-selected', true)
        button.disabled = true
      }
    }

    totalPage > 0 && showElements(this.#root)
  }

  reset() {
    hideElements(this.#root)
    this.#numberButtons.forEach(elem => elem.remove())
    this.#numberButtons.length = 0
    toArray([this.#firstButton, this.#prevButton, this.#nextButton, this.#lastButton])
      .forEach(button => button.disabled = false)
  }

  #onPaging(event, page, size) {
    if (event.target.disabled || page > this.#pageStat.totalPage)
      return
    this.#callback(page, size)
    hasValue(this.#anchor) && window.scrollTo(0, this.#anchor)
  }

  #createElement(tag, className, props, styles) {
    const el = document.createElement(tag)
    addClass(el, className)
    isObject(props) && Object.assign(el, props)
    isObject(styles) && Object.assign(el.style, styles)
    return el
  }

  #createButton(text, className, onclick) {
    const button = this.#createElement('button', className)
    if (/<[a-z]+\d?(\s+[\w-]+=("[^"]*"|'[^']*'))*\s*\/?>|&#?\w+;/i.test(text)) {
      button.innerHTML = text
    } else {
      button.textContent = text
    }
    registerEvent(button, 'click', onclick)
    return button
  }
}

window.Pagination = Pagination
window.addEventListener('DOMContentLoaded', event => {
  registerMutationObserver(el => isElement(el) && Pagination.instance.create(el))
  querySelector(`.${CLASS_NAME}`).forEach(el => isElement(el) && Pagination.instance.create(el))
}, { once: true })
