import { fileURLToPath } from 'node:url'

const { Miniflare } = await import(process.env.MINIFLARE_MODULE ?? 'miniflare')
const root = fileURLToPath(new URL('..', import.meta.url))
const miniflare = new Miniflare({
  modules: true,
  modulesRoot: root,
  scriptPath: fileURLToPath(new URL('./smoke-worker.mjs', import.meta.url)),
  modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
  compatibilityDate: '2025-09-01',
})
try {
  const response = await miniflare.dispatchFetch('https://smoke.kassza/')
  const body = await response.json()
  if (!body.ok) {
    console.error(body.error)
    process.exitCode = 1
  } else {
    console.log(`✓ Cloudflare workerd: ${body.checks.length} ellenőrzés`)
  }
} finally {
  await miniflare.dispose()
}
