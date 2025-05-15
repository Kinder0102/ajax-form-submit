import { STRING_NON_BLANK, HTML_ELEMENT } from './js-constant.js'
import { assert, isNotBlank } from './js-utils.js'
import { isElement, registerEvent, triggerEvent } from './js-dom-utils.js'

const CLASS_NAME = 'js-plugin'
const EVENT_CHECK = `${CLASS_NAME}:check`
const EVENT_REGISTER = `${CLASS_NAME}:register`

export class PluginHost {

  #root
  #plugins = new Map()
  #pollers = new Map()

  constructor(root) {
    assert(isElement(root), 0, HTML_ELEMENT)

    this.#root = root
    registerEvent(root, EVENT_REGISTER, event => {
      const { pluginName, pluginRoot } = event.detail
      if (this.#pollers.has(pluginRoot)) {
        const { intervalId, timeoutId } = this.#pollers.get(pluginRoot)
        clearInterval(intervalId)
        clearTimeout(timeoutId)
        this.#pollers.delete(pluginRoot)
        this.#plugins.set(pluginRoot, pluginName)
      }
    })
  }

  addPlugin(pluginRoot, intervalMs = 100, timeoutMs = 5000) {
    assert(isElement(pluginRoot), 0, HTML_ELEMENT)

    const intervalId = setInterval(() => {
      triggerEvent(pluginRoot, EVENT_CHECK, { systemRoot: this.#root })
    }, intervalMs)

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId)
      this.#pollers.delete(pluginRoot)
      console.error(`[PluginHost] Plugin failed to register in time.`)
    }, timeoutMs)
    this.#pollers.set(pluginRoot, { intervalId, timeoutId })
  }

  async ready() {
    return new Promise(resolve => {
      if (this.#pollers.size === 0) {
        resolve()
        return
      }
      const timer = setInterval(() => {
        if (this.#pollers.size === 0) {
          clearInterval(timer)
          resolve()
        }
      }, 50)
    })
  }

  broadcast(eventName, payload) {
    for (const plugin of this.#plugins.keys()) {
      triggerEvent(plugin, eventName, payload)
    }
  }
}

export class Plugin {

  #root
  #pluginHosts = new Set()

  constructor(pluginName, pluginRoot) {
    assert(isNotBlank(pluginName), 0, STRING_NON_BLANK)
    assert(isElement(pluginRoot), 1, HTML_ELEMENT)

    registerEvent(pluginRoot, EVENT_CHECK, event => {
      const { systemRoot } = event.detail
      this.#pluginHosts.add(systemRoot)
      triggerEvent(systemRoot, EVENT_REGISTER, { pluginName, pluginRoot })
    })
  }

  broadcast(eventName, payload) {
    for (const plugin of this.#pluginHosts) {
      triggerEvent(plugin, eventName, payload)
    }
  }
}
