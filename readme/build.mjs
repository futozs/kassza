import { readdir, readFile, writeFile } from 'node:fs/promises'
import { loadSiteData } from './site-data.mjs'

const ROOT = new URL('../', import.meta.url)
const TEMPLATE = new URL('readme/template.md', ROOT)
const CONFIG = new URL('readme/config.json', ROOT)
const ASSETS = new URL('readme/assets/', ROOT)
const OUTPUT = new URL('README.md', ROOT)
const PACKAGE = new URL('package.json', ROOT)
const PLACEHOLDER = /\{\{\s*([\w-]+)(?:\s*:\s*([^{}]*?))?\s*\}\}/g
const GENERIC_TITLES = new Set(['Kérés', 'Válasz', 'Minta'])
const NOTICE =
  '<!-- Ezt a fájlt a readme/build.mjs generálja a readme/template.md alapján. Ne szerkeszd kézzel: írd át a sablont, és futtasd az npm run readme parancsot. -->'

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char],
  )
}

function linkText(value) {
  return String(value).replace(/[[\]]/g, '\\$&')
}

function shieldsUrl(path, params) {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `https://img.shields.io/${path}?${query}`
}

function staticBadgePart(value) {
  return encodeURIComponent(String(value).replaceAll('-', '--').replaceAll('_', '__'))
}

function createUrls(config, pkg) {
  const web = config.web.replace(/\/+$/, '')
  const repo = `https://github.com/${config.repo}`
  return {
    web,
    docs: `${web}/docs`,
    sandbox: `${web}/sandbox`,
    recipes: `${web}/docs/receptek`,
    host: new URL(web).host,
    llms: `${web}/llms.txt`,
    llmsFull: `${web}/llms-full.txt`,
    repo,
    license: `${repo}/blob/${config.branch}/LICENSE`,
    changelog: `${repo}/blob/${config.branch}/CHANGELOG.md`,
    npm: `https://www.npmjs.com/package/${pkg.name}`,
    officialDocs: config.officialDocs,
    assets: `https://raw.githubusercontent.com/${config.repo}/${config.branch}/readme/assets`,
  }
}

function createRenderer({ config, pkg, site, assetNames }) {
  const urls = createUrls(config, pkg)
  const problems = []
  const examples = new Map(site.examples.map((example) => [example.slug, example]))

  function page(path) {
    const slug = path.replace(/^\/+|\/+$/g, '')
    const found = site.pages.get(slug)
    if (!found) problems.push(`Nincs ilyen dokumentációs oldal: ${path}`)
    return found ?? { slug, title: slug }
  }

  function pageTitle(found) {
    if (!GENERIC_TITLES.has(found.title)) return found.title
    const parent = site.pages.get(found.slug.split('/').slice(0, -1).join('/'))
    return parent ? `${parent.title} › ${found.title}` : found.title
  }

  function docsUrl(path) {
    return path ? `${urls.docs}/${page(path).slug}` : urls.docs
  }

  function example(slug) {
    const found = examples.get(slug)
    if (!found) problems.push(`Nincs ilyen sandbox példa: ${slug}`)
    return found ?? { slug, title: slug }
  }

  function sandboxUrl(slug) {
    return slug ? `${urls.sandbox}?pelda=${encodeURIComponent(example(slug).slug)}` : urls.sandbox
  }

  function recipe(slug) {
    return page(`receptek/${slug}`)
  }

  function asset(name, theme) {
    const file = `${name}-${theme}.svg`
    if (!assetNames.has(file)) problems.push(`Hiányzó kép: readme/assets/${file} (npm run readme)`)
    return `${urls.assets}/${file}`
  }

  function picture(name, alt, size) {
    const dimension = size.startsWith('h') ? `height="${size.slice(1)}"` : `width="${size}"`
    return `<picture><source media="(prefers-color-scheme: dark)" srcset="${asset(name, 'dark')}"><img src="${asset(name, 'light')}" alt="${escapeHtml(alt)}" ${dimension}></picture>`
  }

  function linkedPicture(href, name, alt, size) {
    return `<a href="${href}">${picture(name, alt, size)}</a>`
  }

  function badges() {
    const color = config.badgeColor
    const style = { style: 'flat-square', labelColor: '1c2620', color }
    const items = [
      [urls.npm, shieldsUrl(`npm/v/${pkg.name}`, { label: 'npm', ...style }), 'npm verzió'],
      [
        urls.npm,
        shieldsUrl(`npm/dm/${pkg.name}`, { label: 'letöltés', ...style }),
        'havi letöltés',
      ],
      [
        `${urls.repo}/blob/${config.branch}/package.json`,
        `https://img.shields.io/badge/${staticBadgePart('függőség')}-0-${color}?style=flat-square&labelColor=1c2620`,
        '0 futásidejű függőség',
      ],
      [urls.license, shieldsUrl(`npm/l/${pkg.name}`, { label: 'licenc', ...style }), 'MIT licenc'],
    ]
    return items
      .map(([href, src, alt]) => `<a href="${href}"><img src="${src}" alt="${alt}"></a>`)
      .join('\n  ')
  }

  function nav() {
    const cards = [
      [urls.web, 'nav-web', `Weboldal: ${urls.host}`],
      [urls.docs, 'nav-docs', `Dokumentáció: ${site.pages.size} oldal, magyarul`],
      [urls.sandbox, 'nav-sandbox', `Sandbox: ${site.examples.length} futtatható példa`],
      [urls.recipes, 'nav-recipes', `Receptek: ${site.recipes.length} kész integráció`],
    ].map(([href, name, alt]) => linkedPicture(href, name, alt, '428'))
    return [
      '<p align="center">',
      `  ${cards[0]}`,
      `  ${cards[1]}`,
      '  <br>',
      `  ${cards[2]}`,
      `  ${cards[3]}`,
      '</p>',
    ].join('\n')
  }

  function links(docsPath, sandboxSlug, recipeSlug) {
    const buttons = []
    if (docsPath) {
      const found = page(docsPath)
      buttons.push(
        linkedPicture(docsUrl(docsPath), 'button-docs', `Dokumentáció: ${pageTitle(found)}`, 'h44'),
      )
    }
    if (sandboxSlug) {
      buttons.push(
        linkedPicture(
          sandboxUrl(sandboxSlug),
          'button-sandbox',
          `Futtasd a sandboxban: ${example(sandboxSlug).title}`,
          'h44',
        ),
      )
    }
    if (recipeSlug) {
      const found = recipe(recipeSlug)
      buttons.push(
        linkedPicture(
          `${urls.docs}/${found.slug}`,
          `button-recipe-${recipeSlug}`,
          `Recept: ${found.title}`,
          'h44',
        ),
      )
    }
    return ['<p>', ...buttons.map((button) => `  ${button}`), '</p>'].join('\n')
  }

  function docsLink(path) {
    return `[${linkText(pageTitle(page(path)))}](${docsUrl(path)})`
  }

  function exampleLink(slug) {
    return `[${linkText(example(slug).title)}](${sandboxUrl(slug)})`
  }

  function recipeLink(slug) {
    const found = recipe(slug)
    return `[${linkText(found.title)}](${urls.docs}/${found.slug})`
  }

  function more(docsPath, sandboxSlug) {
    const parts = []
    if (docsPath) {
      parts.push(`📖 **Dokumentáció:** ${docsLink(docsPath)}`)
    }
    if (sandboxSlug) {
      parts.push(`▶️ **Sandbox:** ${exampleLink(sandboxSlug)}`)
    }
    return parts.join(' &nbsp;·&nbsp; ')
  }

  function firstSentence(text) {
    return /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text
  }

  function recipeList() {
    return site.recipes
      .map(
        (item) =>
          `- **${recipeLink(item.slug.split('/').at(-1))}**: ${firstSentence(item.description)}`,
      )
      .join('\n')
  }

  function exampleList() {
    const groups = new Map()
    for (const item of site.examples) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item])
    }
    return [...groups]
      .map(
        ([group, items]) =>
          `**${group}:** ${items.map((item) => exampleLink(item.slug)).join(' · ')}`,
      )
      .join('\n\n')
  }

  const values = {
    ...urls,
    pages: String(site.pages.size),
    examples: String(site.examples.length),
    recipeCount: String(site.recipes.length),
  }

  const helpers = {
    docs: (path) => docsUrl(path),
    doc: (path) => docsLink(path),
    sandbox: (slug) => sandboxUrl(slug),
    example: (slug) => exampleLink(slug),
    recipe: (slug) => recipeLink(slug),
    picture: (name, alt = '', size = '100%') => picture(name, alt, size),
    badges: () => badges(),
    nav: () => nav(),
    links: (docsPath, sandboxSlug, recipeSlug) => links(docsPath, sandboxSlug, recipeSlug),
    more: (docsPath, sandboxSlug) => more(docsPath, sandboxSlug),
    'recipe-list': () => recipeList(),
    'example-list': () => exampleList(),
  }

  function render(template) {
    const output = template.replace(PLACEHOLDER, (match, name, argument) => {
      const args = argument === undefined ? [] : argument.split('|').map((item) => item.trim())
      if (name in helpers && (argument !== undefined || !(name in values))) {
        return helpers[name](...args)
      }
      if (name in values) return values[name]
      problems.push(`Ismeretlen helyőrző: ${match}`)
      return match
    })
    if (problems.length > 0) {
      throw new Error(
        `A README sablon hibás:\n${[...new Set(problems)].map((item) => `  - ${item}`).join('\n')}`,
      )
    }
    return `${NOTICE}\n\n${output.trim()}\n`
  }

  return { render }
}

async function ifExists(read, fallback) {
  try {
    return await read()
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    throw error
  }
}

async function loadAssetNames() {
  return new Set(await ifExists(() => readdir(ASSETS), []))
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'))
}

async function syncHomepage(pkgText, pkg, web, check) {
  const homepage = web.replace(/\/+$/, '')
  if (pkg.homepage === homepage) return null
  if (check) {
    return `A package.json homepage mezője (${pkg.homepage}) eltér a readme/config.json web értékétől (${homepage}).`
  }
  const indent = /\n(\s+)"/.exec(pkgText)?.[1] ?? '  '
  await writeFile(PACKAGE, `${JSON.stringify({ ...pkg, homepage }, null, indent)}\n`)
  return null
}

async function main() {
  const check = process.argv.includes('--check')
  const [template, config, pkgText, site, assetNames] = await Promise.all([
    readFile(TEMPLATE, 'utf8'),
    readJson(CONFIG),
    readFile(PACKAGE, 'utf8'),
    loadSiteData(),
    loadAssetNames(),
  ])
  const pkg = JSON.parse(pkgText)
  const readme = createRenderer({ config, pkg, site, assetNames }).render(template)
  const homepageProblem = await syncHomepage(pkgText, pkg, config.web, check)
  if (!check) {
    await writeFile(OUTPUT, readme)
    console.log('README.md frissítve.')
    return
  }
  const current = await ifExists(() => readFile(OUTPUT, 'utf8'), '')
  const problems = [
    current === readme
      ? null
      : 'A README.md nem egyezik a readme/template.md-ből generált változattal.',
    homepageProblem,
  ].filter(Boolean)
  if (problems.length > 0) {
    console.error(`${problems.join('\n')}\nFuttasd: npm run readme`)
    process.exitCode = 1
    return
  }
  console.log('A README.md naprakész.')
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
