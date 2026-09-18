import { describe, expect, test } from 'vitest'
import { ogDescriptionLimit, ogTitleSize, receiptEdgePath, truncateText } from './og-image'

describe('OG kép segédfüggvények', () => {
  test('a rövid szöveget változatlanul hagyja', () => {
    expect(truncateText('  Számla létrehozás  ', 40)).toBe('Számla létrehozás')
  })

  test('a hosszú szöveget szóhatáron vágja, írásjel nélkül zárja', () => {
    expect(truncateText('Időtúllépés, újrapróbálkozás, proxy és TLS beállítása', 30)).toBe(
      'Időtúllépés, újrapróbálkozás…',
    )
  })

  test('szóköz nélküli szövegnél a limitnél vág', () => {
    expect(truncateText('a'.repeat(20), 10)).toBe(`${'a'.repeat(10)}…`)
  })

  test('a cím hosszával csökken a betűméret és a leírás hossza', () => {
    expect(ogTitleSize('Telepítés')).toBe(88)
    expect(ogTitleSize('Előlegszámla kiállítása egy lépésben')).toBe(72)
    expect(ogTitleSize('x'.repeat(57))).toBe(56)
    expect(ogDescriptionLimit('Telepítés')).toBeGreaterThan(ogDescriptionLimit('x'.repeat(57)))
  })

  test('a nyugtaél a teljes szélességet lefedi', () => {
    const path = receiptEdgePath(48)

    expect(path).toBe('M0 14 L12 0 L24 14 L36 0 L48 14 Z')
  })
})
