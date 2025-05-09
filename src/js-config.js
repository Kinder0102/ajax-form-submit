import { FUNCTION, ARRAY_STRING, STRING_NON_BLANK } from './js-constant.js'
import { assert, isFunction, isNotBlank, toArray, findObjectValue } from './js-utils.js'

export function createConfig(getSourceCallback) {
  assert(isFunction(getSourceCallback), 0, FUNCTION)
  return {
    get: keys => {
      let result = {}
      const sources = toArray(getSourceCallback())
      toArray(keys).forEach(key => {
        assert(isNotBlank(key), 0, [ARRAY_STRING, STRING_NON_BLANK])
        for (const source of sources) {
          const { exist, key: name, value } = findObjectValue(source, key)
          if (exist) {
            result[name] = value
            break
          }
        }
      })
      return result
    }
  }
}
