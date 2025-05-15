import { build } from 'esbuild'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const entryFiles = (await readdir(path.join(__dirname, 'src')))
  .filter(file => file.endsWith('.js'))

for (const file of entryFiles) {
  const entry = path.join('src', file)
  const baseName = path.basename(file, '.js')
  const outPath = path.join('dist', `${baseName}.min.js`)
  const sourcemapPath = path.join('dist', `${baseName}.min.js.map`)

  await build({
    entryPoints: [entry],
    outfile: outPath,
    alias: {
      '#': path.resolve(__dirname, 'src'),
      '#libs': path.resolve(__dirname, 'libs'),
    },
    minify: true,
    bundle: true,
    sourcemap: true
  })

  const stats = await stat(outPath)
  const sizeKB = (stats.size / 1024).toFixed(2)
  console.log(`✔  ${outPath} (${sizeKB} KB)`)

  try {
    const sourcemapStats = await stat(sourcemapPath)
    const sourcemapSizeKB = (sourcemapStats.size / 1024).toFixed(2)
    console.log(`✔  ${sourcemapPath} (${sourcemapSizeKB} KB)`)
  } catch(_) {
  }
}