import {
  assert,
  hasValue,
  isArray,
  isObject,
  isNotBlank,
  isFunction,
  split,
  startsWith
} from './js-utils'

export function isElement(el) {
  return el instanceof Element || el instanceof DocumentFragment
}

export function elementIs(el, type) {
  if (!isElement(el))
    return false
  
  const elemType = el.tagName.toLowerCase()
  if (isNotBlank(type)) {
    return type === elemType
  } else if (isArray(type)) {
    for (const token of type) {
      if (token === elemType)
        return true
    }
  } else {
    assert(false, 2, 'NonBlankString or Array')
  }
  return false
}

export function hasClass(el, classname) {
  return isElement(el) && el.classList.contains(classname)
}

export function addClass(el, classname) {
  assert(isElement(el), 'first argument must be HTMLElement')
  assert(isNotBlank(classname), 'second argument must be NonBlankString')
  split(classname).forEach(token => el.classList.add(token))
}

export function removeClass(el, classname) {
  assert(isElement(el), 'first argument must be HTMLElement')
  assert(isNotBlank(classname), 'second argument must be NonBlankString')
  split(classname).forEach(token => el.classList.remove(token))
}

export function querySelector(selectors, el, withSelf = false) {
  const result = new Set()
  const input = isArray(selectors) ? selectors : [ selectors ]
  let self = el
  if (!isElement(el)) {
    self = document
    withSelf = false
  }

  for (const selector of input) {
    if (isElement(selector)) {
      result.add(selector)
      continue
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

  const input = isArray(targets) ? targets : split(targets, ',')
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

export function registerEvent(elements, eventName, callback) {
  assert(isArray(eventName) || isNotBlank(eventName), 2, 'Array or NonBlankString')
  assert(isFunction(callback), 3, 'Function')

  const events = split(eventName)
  checkElements(elements).forEach(elem => {
    events.forEach(event => elem.addEventListener(event, callback))
  })
}

export function triggerEvent(elements, eventName, payload) {
  assert(isNotBlank(eventName), 'second argument must be NonBlankString')
  
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
  } else if (isElement(elements)) {
    result.push(elements)
  } else if (isObject(elements)) {
    Object.values(elements).map(checkElements)
      .flat().forEach(elem => result.push(elem))
  } else {
    assert(false, 1, 'HTMLElement, HTMLElementArray or HTMLElementObject')
  }
  return result
}
