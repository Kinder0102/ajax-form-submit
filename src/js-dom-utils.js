import {
  ARRAY,
  ARRAY_HTML_ELEMENT,
  STRING_NON_BLANK,
  FUNCTION,
  DOCUMENT,
  HTML_ELEMENT
} from './js-constant.js'

import {
  assert,
  isObject,
  isArray,
  isNotBlank,
  isFunction,
  toArray,
  objectValues,
  split,
  startsWith
} from './js-utils.js'

export function isElement(el) {
  return el instanceof Element || el instanceof DocumentFragment
}

export function elementIs(el, type) {
  if (!isElement(el))
    return false
  
  const elemType = el.tagName?.toLowerCase()
  if (isNotBlank(type)) {
    return type === elemType
  } else if (isArray(type)) {
    return type.includes(elemType)
  } else {
    assert(false, 2, [ARRAY, STRING_NON_BLANK])
  }
  return false
}

export function hasClass(el, classname) {
  return isElement(el) && isNotBlank(classname) && el.classList?.contains(classname)
}

export function addClass(el, classname) {
  assert(isElement(el), 1, HTML_ELEMENT)
  split(classname).forEach(token => el.classList?.add(token))
}

export function removeClass(el, classname) {
  assert(isElement(el), 1, HTML_ELEMENT)
  split(classname).forEach(token => el.classList?.remove(token))
}

export function querySelector(selectors, el, withSelf = false) {
  const result = new Set()
  const input = toArray(selectors)
  let self = el
  if (!isElement(el)) {
    self = document
    withSelf = false
  }

  for (const selector of input) {
    if (isElement(selector)) {
      result.add(selector)
    } else if (isNotBlank(selector)) {
      try {
        if (withSelf && self.matches(selector))
          result.add(self)
        self.querySelectorAll(selector).forEach(elem => result.add(elem))
      } catch(ignored) { }
    }
  }
  return Array.from(result)
}

export function getTargets(targets, el) {
  const input = toArray(targets, ',')
  const result = new Set()

  input.forEach(target => {
    if (target.startsWith('self') || target.startsWith('parent') || target.startsWith('peer')) {
      let elems = [ el ].filter(isElement)
      split(target, '.').forEach(pointer => {
        if (pointer === 'parent') {
          elems = elems.map(elem => elem.parentNode)
        } else if (pointer === 'peer') {
          elems = elems.map(elem => querySelector(`:scope>.peer`, elem.parentNode)).flat()
        }
      })
      elems.forEach(elem => isElement(elem) && result.add(elem))
    } else if (isElement(target)) {
      result.add(target)
    } else if (isNotBlank(target)) {
      const elems = querySelector(target)
      if (elems.length !== 0) {
        elems.forEach(elem => result.add(elem))
      } else {
        console.warn(`Could not find element by selector "${target}"`)
      }
    }
  })
  return Array.from(result)
}

export function showElements(elements) {
  checkElements(elements)
    .forEach(elem => elem.classList.remove('hidden'))
}

export function hideElements(elements) {
  checkElements(elements)
    .forEach(elem => elem.classList.add('hidden'))
}

export function enableElements(elements) {
  checkElements(elements)
    .forEach(elem => elem.removeAttribute('disabled'))
}

export function disableElements(elements) {
  checkElements(elements)
    .forEach(elem => elem.setAttribute('disabled', ''))
}

export function registerMutationObserver(callback, target) {
  const root = isElement(target) ? target : document.body
  const observer = new MutationObserver(mutations =>
    mutations.forEach(({ addedNodes }) =>
      addedNodes.forEach(callback)))
  observer.observe(root, { childList: true, subtree: true })
  return observer
}


export function registerAttributeChange(el, attrName, callback) {
  const observer = new MutationObserver(mutations => mutations.forEach(({ type, attributeName }) => {
    if (type === 'attributes' && startsWith(attributeName, attrName).exist)
      callback()
  }))
  observer.observe(el, { attributes: true })
  return observer
}

export function registerEvent(elements, eventName, callback, options) {
  assert(isArray(eventName) || isNotBlank(eventName), 2, [ARRAY, STRING_NON_BLANK])
  assert(isFunction(callback), 3, FUNCTION)

  const events = split(eventName)
  checkElements(elements).forEach(elem => {
    events.forEach(event => elem.addEventListener(event, callback, options))
  })
}

export function triggerEvent(elements, eventName, payload) {
  assert(isNotBlank(eventName), 2, STRING_NON_BLANK)
  
  const event = new CustomEvent(eventName, { detail: payload })
  checkElements(elements).forEach(elem => elem.dispatchEvent(event))
}

export function stopDefaultEvent(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
}

function checkElements(elements) {
  let result = []
  if (isArray(elements)) {
    elements.forEach(elem => isElement(elem) && result.push(elem))
  } else if (elements === document || isElement(elements)) {
    result.push(elements)
  } else if (isObject(elements)) {
    for (const value of objectValues(elements))
      result.push(...checkElements(value))
  } else {
    assert(false, 1, [DOCUMENT, HTML_ELEMENT, ARRAY_HTML_ELEMENT])
  }
  return result
}
