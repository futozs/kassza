import { createHash } from 'node:crypto'
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, posix, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeDir = join(root, 'public', 'sandbox-runtime')
const generatedDir = join(root, 'generated')

function hashOf(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

async function buildWorker() {
  const result = await build({
    entryPoints: [join(root, 'sandbox', 'worker.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    logLevel: 'warning',
  })
  const code = result.outputFiles[0].contents
  const file = `runner.${hashOf(code)}.js`
  await writeFile(join(runtimeDir, file), code)
  return { path: `/sandbox-runtime/${file}`, bytes: code.byteLength }
}

async function buildTypes() {
  const packageRoot = join(root, 'node_modules', 'kassza')
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  const files = {}
  for await (const file of walk(join(packageRoot, 'dist'))) {
    if (!file.endsWith('.d.ts')) continue
    const relativePath = relative(packageRoot, file).split(sep).join('/')
    files[`file:///node_modules/kassza/${relativePath}`] = await readFile(file, 'utf8')
  }
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (subpath === './package.json' || subpath === './storage/fs') continue
    const shim = subpath === '.' ? 'index.d.ts' : `${subpath.slice(2)}/index.d.ts`
    const types = target.import.types.replace(/^\.\//, '').replace(/\.d\.ts$/, '.js')
    let specifier = posix.relative(posix.dirname(shim), types)
    if (!specifier.startsWith('.')) specifier = `./${specifier}`
    files[`file:///node_modules/kassza/${shim}`] = `export * from '${specifier}'\n`
  }
  files['file:///node_modules/@types/kassza-sandbox/index.d.ts'] = await readFile(
    join(root, 'sandbox', 'kassza-sandbox.d.ts'),
    'utf8',
  )
  const content = JSON.stringify({ version: manifest.version, files })
  const file = `types.${hashOf(content)}.json`
  await writeFile(join(runtimeDir, file), content)
  return { path: `/sandbox-runtime/${file}`, count: Object.keys(files).length }
}

async function copyMonaco() {
  const source = join(root, 'node_modules', 'monaco-editor')
  const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  const target = join(root, 'public', 'monaco')
  const marker = join(target, 'VERSION')
  const current = await readFile(marker, 'utf8').catch(() => '')
  if (current.trim() !== version) {
    await rm(target, { recursive: true, force: true })
    await cp(join(source, 'min', 'vs'), join(target, 'vs'), { recursive: true })
    await writeFile(marker, version)
  }
  return { path: '/monaco/vs', version }
}

async function runExamples() {
  const outfile = join(generatedDir, 'examples-runner.mjs')
  await build({
    entryPoints: [join(root, 'scripts', 'examples-runner.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    outfile,
    logLevel: 'warning',
  })
  const { runExamples: run } = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`)
  const examples = await run(root)
  await writeFile(join(generatedDir, 'examples.json'), `${JSON.stringify(examples, null, 2)}\n`)
  await rm(outfile, { force: true })
  return examples.length
}

const started = performance.now()
await rm(runtimeDir, { recursive: true, force: true })
await mkdir(runtimeDir, { recursive: true })
await mkdir(generatedDir, { recursive: true })

const [worker, types, monaco] = await Promise.all([buildWorker(), buildTypes(), copyMonaco()])
const exampleCount = await runExamples()

await writeFile(
  join(generatedDir, 'sandbox-manifest.json'),
  `${JSON.stringify({ runner: worker.path, types: types.path, monaco: monaco.path, monacoVersion: monaco.version }, null, 2)}\n`,
)

console.log(
  `[sandbox] worker ${(worker.bytes / 1024).toFixed(0)} KB · ${types.count} típusfájl · Monaco ${monaco.version} · ${exampleCount} példa · ${Math.round(performance.now() - started)} ms`,
)
