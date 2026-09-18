import { calculateInvoiceItem, calculateReceiptItem, summarizeItems } from 'kassza/money'

const nettoAlapu = calculateInvoiceItem({ quantity: 3, netUnitPrice: 1_999, vat: 27 })
const bruttoAlapu = calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })
const nyugtaTetel = calculateReceiptItem({ grossUnitPrice: 1_000, vat: 27 })
const devizas = calculateInvoiceItem({ quantity: 7, netUnitPrice: 12.35, vat: 27 }, 'EUR')

console.log('Nettó alapú (B2B):', nettoAlapu)
console.log('Bruttó alapú (B2C):', bruttoAlapu)
console.log('Nyugta tétel:', nyugtaTetel)
console.log('Euró:', devizas)

const osszesen = summarizeItems([
  nettoAlapu,
  bruttoAlapu,
  calculateInvoiceItem({ grossUnitPrice: 3_500, vat: 5 }),
])
console.log('Áfabontás:', osszesen)
