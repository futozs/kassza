export const REHEARSAL_STEPS = [
  'authenticate',
  'registerSoftware',
  'vatCategories',
  'submitReport',
  'submitAgain',
  'listReports',
  'getReport',
  'modifyReport',
  'invalidateReport',
  'verifyInvalidated',
]

export function rehearsalReport(applicableDate, serialNumber, total) {
  return {
    applicableDate,
    serialNumber,
    currency: 'HUF',
    exchangeRate: null,
    vatCategories: [{ vat: '27%', saleDocument: total, modifyingDocument: 0 }],
    total,
    numberOfSaleDocument: 1,
    numberOfModifyingDocument: 0,
  }
}

export async function runNavRehearsal(nav, options) {
  if (nav.environment !== 'test') {
    throw new Error('A NAV próba csak a teszt környezetben (bv-receipt-if) futhat.')
  }
  if (!nav.canWrite)
    throw new Error('A próbához allowWrite: true kell (csak a teszt környezetben).')
  const log = options.log ?? (() => undefined)
  const results = []
  const step = async (name, run) => {
    const started = Date.now()
    try {
      const value = await run()
      results.push({ step: name, ok: true, durationMs: Date.now() - started })
      log(`✓ ${name}`)
      return value
    } catch (error) {
      results.push({
        step: name,
        ok: false,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      })
      log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`)
      throw Object.assign(new Error(`A NAV próba a(z) ${name} lépésnél megállt.`), {
        cause: error,
        results,
      })
    }
  }
  const report = rehearsalReport(options.date, options.serialNumber, 1270)
  await step('authenticate', () => nav.authenticate())
  await step('registerSoftware', () => nav.registerSoftware(options.softwareName))
  await step('vatCategories', async () => {
    const categories = await nav.vatCategories()
    if (!categories.some((category) => category.name === '27%')) {
      throw new Error('A NAV áfakategória-listájában nincs 27%.')
    }
  })
  const submitted = await step('submitReport', () => nav.submitReport(report))
  await step('submitAgain', async () => {
    const again = await nav.submitReport(report)
    if (again.created || again.id !== submitted.id) {
      throw new Error('Az ismételt beküldés nem a meglévő jelentést adta vissza (idempotencia).')
    }
  })
  await step('listReports', async () => {
    const page = await nav.listReports({ from: options.date, to: options.date })
    if (!page.items.some((item) => item.id === submitted.id)) {
      throw new Error('A beküldött jelentés nem szerepel a listában.')
    }
  })
  await step('getReport', async () => {
    const detail = await nav.getReport(submitted.id)
    if (detail.total !== report.total)
      throw new Error(`A visszaolvasott összeg eltér: ${detail.total}`)
  })
  const modified = await step('modifyReport', () =>
    nav.modifyReport(submitted.id, rehearsalReport(options.date, options.serialNumber, 2540)),
  )
  await step('invalidateReport', () => nav.invalidateReport(modified.id))
  await step('verifyInvalidated', async () => {
    const detail = await nav.getReport(modified.id)
    if (detail.status !== 'INVALIDATED') throw new Error(`Az állapot: ${detail.status}`)
  })
  return results
}
