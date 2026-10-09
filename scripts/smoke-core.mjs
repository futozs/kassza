export async function runSmoke(modules) {
  const { createKassza, isSzamlazzError } = modules.root
  const { createFakeAgentFetch } = modules.testing
  const { navDailyReports } = modules.reports
  const { createJournal, memoryJournal } = modules.journal
  const { memoryStore } = modules.stores
  const { allocateRefund } = modules.money
  const { observe, createMetricsRegistry, combineHooks } = modules.observe

  const checks = []
  const assert = (condition, message) => {
    if (!condition) throw new Error(`Smoke hiba: ${message}`)
    checks.push(message)
  }

  const now = () => new Date('2026-10-02T10:00:00Z')
  const agent = createFakeAgentFetch({ now, testAccount: false })
  const journal = createJournal(memoryJournal(), { now })
  const metrics = createMetricsRegistry()
  const kassza = createKassza({
    agentKey: 'smoketesztkulcs0123456789',
    fetch: agent.fetch,
    retryDelayMs: 0,
    createOnceLock: memoryStore(),
    defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
    hooks: combineHooks(observe({ metrics }), {
      onDocument: (event) => journal.record(event),
      onDocumentError: 'throw',
    }),
  })

  const buyer = { name: 'Smoke Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }
  const invoiceInput = {
    orderNumber: 'SMOKE-1',
    buyer,
    items: [
      { name: 'Áru 27%', quantity: 2, grossUnitPrice: 1270, vat: 27 },
      { name: 'Könyv 5%', quantity: 1, netUnitPrice: 1000, vat: 5 },
    ],
  }
  const [first, second] = await Promise.all([
    kassza.invoices.createOnce(invoiceInput),
    kassza.invoices.createOnce(invoiceInput),
  ])
  assert(first.number === second.number, 'a párhuzamos createOnce egy számlát ad')
  assert([first.created, second.created].filter(Boolean).length === 1, 'pontosan egy kiállítás')
  const details = await kassza.invoices.get(first.number, { includePdf: false })
  assert(details.totals.grossAmount === 3590, 'a számla bruttó végösszege 3590')

  const reversal = await kassza.invoices.reverse(first.number)
  assert(typeof reversal.number === 'string', 'a számla sztornózható')

  const receipt = await kassza.receipts.createOnce({
    orderNumber: 'SMOKE-2',
    items: [{ name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 }],
  })
  assert(receipt.receipt.totals.grossAmount === 1780, 'a nyugta bruttó végösszege 1780')
  await kassza.receipts.reverse(receipt.receipt.number)

  const receipts = await journal.receipts({ from: '2026-10-02', to: '2026-10-02' })
  const reports = navDailyReports(receipts)
  assert(reports.length === 1, 'a naplóból NAV napi összesítő készül')
  assert(reports[0].numberOfSaleDocument === 1, 'egy eladási nyugta')
  assert(reports[0].numberOfModifyingDocument === 1, 'egy módosító nyugta')

  const allocation = allocateRefund(
    [
      { name: 'A', vat: 27, grossAmount: 100 },
      { name: 'B', vat: 5, grossAmount: 1 },
    ],
    50,
  )
  assert(
    allocation.reduce((sum, item) => sum + item.grossAmount, 0) === 50,
    'a visszatérítés pontosan szétosztható',
  )

  try {
    await kassza.invoices.create({ buyer, items: [] })
    assert(false, 'az üres számla hibát dob')
  } catch (error) {
    assert(isSzamlazzError(error) && error.category === 'validation', 'validációs hiba magyarul')
  }

  const country = modules.root.buyerFromCustomer({
    name: 'Max Muster',
    address: { country: 'at', zip: '1010', city: 'Wien', line1: 'Ring 1' },
  })
  assert(typeof country?.country === 'string', 'a külföldi országnév előáll (Intl)')

  assert(
    metrics.renderPrometheus().includes('kassza_requests_total'),
    'a metrikák Prometheus formában olvashatók',
  )
  return checks
}
