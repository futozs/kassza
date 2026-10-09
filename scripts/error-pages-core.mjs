export const ERROR_PAGES_DIR = 'web/content/docs/hibakodok'

const CATEGORY = {
  auth: {
    label: 'Hitelesítés',
    when: 'A Számlázz.hu nem fogadta el a bejelentkezést, vagy egy böngészős munkamenet zavarja az Agentet.',
    todo: 'Ellenőrizd az Agent kulcsot (csak kisbetűs lehet), és a `kassza doctor` paranccsal a teljes környezetet. Ugyanazt a kérést ne küldd újra, amíg a kulcs hibás.',
    retry: 'Nem. Előbb javítsd a hitelesítést.',
  },
  account: {
    label: 'Fiókbeállítás',
    when: 'A fiók beállítása, előfizetése vagy jogosultsága nem engedi a műveletet.',
    todo: 'Embernek kell a Számlázz.hu felületén rendeznie (előfizetés, beállítás, jogosultság). A kódból ezt nem lehet megoldani.',
    retry: 'Nem. Újraküldve is ugyanez lesz.',
  },
  validation: {
    label: 'Hibás adat',
    when: 'A kérés valamelyik adata nem felel meg a Számlázz.hu szabályainak.',
    todo: 'Javítsd az adatot a hibaüzenet és a tipp alapján. A kassza a legtöbb ilyen hibát már a kérés elküldése előtt, magyar üzenettel jelzi.',
    retry:
      'Nem. Változatlanul újraküldve ugyanígy elbukik, és a próbálkozások a kitiltási korlátba számítanak.',
  },
  duplicate: {
    label: 'Már létezik',
    when: 'Ezzel a rendelésszámmal vagy hívásazonosítóval már készült bizonylat.',
    todo: 'Ne állítsd ki újra: kérdezd le a meglévőt. A `createOnce()` ezt magától megteszi, és a meglévő bizonylatot adja vissza.',
    retry: 'Nem. A bizonylat valószínűleg már elkészült.',
  },
  partial_success: {
    label: 'Részben sikeres',
    when: 'A bizonylat elkészült, csak egy mellékes lépés (például az értesítő e-mail) maradt el.',
    todo: 'Ne állítsd ki újra. Kérdezd le a bizonylatot rendelésszámmal, és a kimaradt lépést (e-mail) pótold külön.',
    retry: 'Nem. A bizonylat már létezik.',
  },
  not_found: {
    label: 'Nem található',
    when: 'A hivatkozott bizonylat nem létezik ezen a fiókon.',
    todo: 'Ellenőrizd a számot vagy a rendelésszámot. A `find()` metódusok ilyenkor `null`-t adnak hibadobás helyett.',
    retry: 'Nem.',
  },
  maintenance: {
    label: 'Karbantartás',
    when: 'A Számlázz.hu átmenetileg nem érhető el.',
    todo: 'Várj néhány percet. Lekérdezéseknél a kassza magától újrapróbál; kiállításnál a `createOnce()` később biztonságosan újrahívható. Tartós kiesésnél válts tartalék folyamatra (például kézi nyugtatömbre).',
    retry: 'Igen, néhány perc múlva.',
  },
  rate_limit: {
    label: 'Korlát',
    when: 'A tesztfiókban rövid idő alatt túl sok bizonylat készült.',
    todo: 'Várj néhány percet. Tömeges kiállításnál a `kassza/batch` sebességkorláttal fut, és ennél a hibánál megáll.',
    retry: 'Csak percek múlva, automatikusan soha.',
  },
  unknown: {
    label: 'Ismeretlen',
    when: 'A Számlázz.hu olyan hibát adott, amelyet a kassza nem ismer.',
    todo: 'Olvasd el a hibaüzenetet, és jelezd a kassza hibajegyében, hogy a táblát bővíteni lehessen.',
    retry: 'Nem.',
  },
}

const ONES = ['', 'es', 'es', 'as', 'es', 'ös', 'os', 'es', 'as', 'es']
const TENS = ['', 'es', 'as', 'as', 'es', 'es', 'as', 'es', 'as', 'es']

export function hungarianSuffix(number) {
  const value = Math.abs(Math.trunc(number))
  if (value === 0) return 'ás'
  if (value % 10 !== 0) return ONES[value % 10]
  if (value % 100 !== 0) return TENS[(value / 10) % 10]
  if (value % 1000 !== 0) return 'as'
  return 'es'
}

function codeLabel(code) {
  return `${code}-${hungarianSuffix(code)}`
}

function escapeMdx(text) {
  return String(text).replace(/[{}<>]/g, (char) => `\\${char}`)
}

function yamlString(text) {
  return JSON.stringify(String(text))
}

function guidance(category) {
  return CATEGORY[category] ?? CATEGORY.unknown
}

function example(code, category) {
  const lines = [
    "import { isSzamlazzError } from 'kassza'",
    '',
    'try {',
    '  await kassza.invoices.createOnce(szamla)',
    '} catch (error) {',
    `  if (isSzamlazzError(error) && error.code === ${code}) {`,
  ]
  if (category === 'duplicate' || category === 'partial_success') {
    lines.push(
      '    const meglevo = await kassza.invoices.find({ orderNumber: szamla.orderNumber })',
      '    return meglevo',
    )
  } else if (category === 'maintenance' || category === 'rate_limit') {
    lines.push('    return utemezdKesobbre(szamla)')
  } else {
    lines.push(
      '    console.error(error.message, error.hint, error.docsUrl)',
      '    return jelezdEmbernek(error)',
    )
  }
  lines.push('  }', '  throw error', '}')
  return lines.join('\n')
}

export function renderCodePage(code, info, related) {
  const help = guidance(info.category)
  const lines = [
    '---',
    `title: ${yamlString(`${codeLabel(code)} hibakód: ${info.message}`)}`,
    `description: ${yamlString(`A Számlázz.hu Számla Agent ${codeLabel(code)} hibakódja: mit jelent, mikor jön elő, és hogyan kezeld a kasszával.`)}`,
    '---',
    '',
    `**Üzenet:** ${escapeMdx(info.message)}`,
    '',
    '| | |',
    '| --- | --- |',
    `| Kategória | \`${info.category}\` (${help.label}) |`,
    `| Újrapróbálható | ${help.retry} |`,
    `| A kassza hibája | \`SzamlazzError\`, \`code: ${code}\` |`,
    '',
    '## Mikor jön elő',
    '',
    help.when,
    '',
    ...(info.hint ? ['## Tipp', '', escapeMdx(info.hint), ''] : []),
    '## Mi a teendő',
    '',
    help.todo,
    '',
    '## Kezelés a kasszával',
    '',
    '```ts',
    example(code, info.category),
    '```',
    '',
  ]
  if (related.length > 0) {
    lines.push(
      '## Kapcsolódó hibakódok',
      '',
      related.map((other) => `[${other}](/docs/hibakodok/${other})`).join(', '),
      '',
    )
  }
  lines.push(
    'A hibakódok teljes, hivatalos listája a [Számlázz.hu dokumentációjában](https://docs.szamlazz.hu/hu/agent/basics/error-handling) van. Ez az oldal a kassza `AGENT_ERROR_CODES` táblájából készül.',
    '',
  )
  return lines.join('\n')
}

export function renderIndex(codes, table) {
  const rows = codes.map(
    (code) =>
      `| [${code}](/docs/hibakodok/${code}) | ${escapeMdx(table[code].message)} | \`${table[code].category}\` |`,
  )
  return [
    '---',
    'title: Hibakódok',
    'description: A Számlázz.hu Számla Agent hibakódjai egyenként, magyarázattal és kassza-példával.',
    '---',
    '',
    'Minden hibakódhoz külön oldal tartozik: mit jelent, mikor jön elő, mi a teendő, és hogyan kezeld a kódban. A kassza hibáin a `docsUrl` mező közvetlenül ide mutat, így a naplóból egy kattintással megnyitható.',
    '',
    '```ts',
    'console.error(error.message, error.hint, error.docsUrl)',
    '```',
    '',
    '| Kód | Üzenet | Kategória |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
}

export function renderErrorPages(table) {
  const codes = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
  const files = new Map()
  files.set('index.mdx', renderIndex(codes, table))
  files.set(
    'meta.json',
    `${JSON.stringify({ title: 'Hibakódok', pages: ['index', ...codes.map(String)] }, null, 2)}\n`,
  )
  for (const code of codes) {
    const info = table[code]
    const related = codes
      .filter((other) => other !== code && table[other].category === info.category)
      .slice(0, 8)
    files.set(`${code}.mdx`, renderCodePage(code, info, related))
  }
  return files
}
