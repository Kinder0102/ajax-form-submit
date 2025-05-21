import { ARRAY_STRING, STRING_NON_BLANK } from '#libs/js-constant'
import { assert, isNotBlank, toArray, findObjectValue } from '#libs/js-utils'

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
