import { assert, isFunction, isNotBlank, toArray, findObjectValue } from './js-utils'

export function createConfig(getSourceCallback) {
  assert(isFunction(getSourceCallback), 0, 'Function')
  return {
    get: keys => {
      let result = {}
      const sources = toArray(getSourceCallback())
      toArray(keys).forEach(key => {
        assert(isNotBlank(key), 0, 'StringArray or NotBlankString')
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
