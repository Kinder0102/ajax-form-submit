import { ARRAY_STRING, STRING_NON_BLANK } from './js-constant.js'
import { assert, isNotBlank, toArray, findObjectValue } from './js-utils.js'

export function createConfig() {
  const sources = [...arguments]
  return {
    get: keys => {
      return toArray(keys).reduce((acc, key) => {
        assert(isNotBlank(key), 0, [ARRAY_STRING, STRING_NON_BLANK])
        for (const source of sources) {
          const { exist, key: name, value } = findObjectValue(source, key)
          if (exist) {
            acc[name] = value
            break
          }
        }
        return acc
      }, {})
    },
    getSource: index => sources[index]
  }
}
