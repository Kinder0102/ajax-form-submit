import {
  ARRAY,
  ARRAY_HTML_ELEMENT,
  STRING_NON_BLANK,
  FUNCTION,
  DOCUMENT,
  HTML_ELEMENT,
} from '#libs/js-constant'

import {
  assert,
  isObject,
  isArray,
  isNotBlank,
  isFunction,
  isElement,
  toArray,
  objectValues,
  split,
  startsWith
} from '#libs/js-utils'

export function elementIs(el, type) {
  if (!isElement(el))
    return false

  const types = toArray(type)
  return types.includes(el.tagName.toLowerCase()) || types.includes(el.type)
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

export function querySelector(selectors, el, includeSelf = false) {
  const result = new Set()
  const root = isElement(el) ? el : document
  const includeRoot = includeSelf && root !== document

  for (const selector of toArray(selectors)) {
    if (isElement(selector)) {
      result.add(selector)
    } else if (isNotBlank(selector)) {
      try {
        includeRoot && root.matches(selector) && result.add(root)
        root.querySelectorAll(selector).forEach(elem => result.add(elem))
      } catch(_) { }
    }
  }
  return toArray(result)
}

export function getTargets(targets, el) {
  const result = new Set()

  for (const target of split(targets, ',')) {
    if (isElement(target)) {
      result.add(target)
      continue
    }

    let elems
    for (const selector of split(target, ' ')) {
      switch (selector) {
        case 'self':
          elems = (elems ?? [el])
          break
        case 'parent':
          elems = (elems ?? [el]).map(elem => elem.parentElement)
          break
        case 'children':
          elems = (elems ?? [el]).flatMap(elem => toArray(elem.children))
          break
        default:
          elems = (elems ?? [document]).flatMap(elem => querySelector(selector, elem))
      }
      elems = elems.filter(isElement)
    }
    elems.forEach(elem => result.add(elem))
  }
  return toArray(result)
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
