export interface PdfParty {
  readonly label: string
  readonly lines: readonly string[]
}

export interface PdfRow {
  readonly name: string
  readonly quantity: string
  readonly unitPrice: string
  readonly vat: string
  readonly net: string
  readonly gross: string
}

export interface PdfDocument {
  readonly title: string
  readonly number: string
  readonly meta: readonly string[]
  readonly parties: readonly PdfParty[]
  readonly rows: readonly PdfRow[]
  readonly totals: readonly (readonly [string, string])[]
  readonly note?: string | undefined
}

const PAGE_WIDTH = 595
const PAGE_HEIGHT = 842
const MARGIN = 56

const SUBSTITUTES: Readonly<Record<string, string>> = {
  ő: 'ö',
  Ő: 'Ö',
  ű: 'ü',
  Ű: 'Ü',
  '–': '-',
  '—': '-',
  '„': '"',
  '”': '"',
  '’': "'",
  '…': '...',
  '›': '>',
  '·': '-',
}

function toLatin1(value: string): string {
  let result = ''
  for (const char of value) {
    const substitute = SUBSTITUTES[char] ?? char
    for (const piece of substitute) {
      result += piece.charCodeAt(0) <= 0xff ? piece : '?'
    }
  }
  return result
}

function pdfString(value: string): string {
  return `(${toLatin1(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`
}

function encodeLatin1(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index++) bytes[index] = value.charCodeAt(index) & 0xff
  return bytes
}

function cell(value: string, width: number, align: 'left' | 'right' = 'left'): string {
  const trimmed = value.length > width ? `${value.slice(0, width - 1)}…` : value
  return align === 'left' ? trimmed.padEnd(width) : trimmed.padStart(width)
}

class ContentStream {
  readonly ops: string[] = []

  text(
    font: 'F1' | 'F2' | 'F3',
    size: number,
    x: number,
    y: number,
    value: string,
    gray = 0.12,
  ): void {
    this.ops.push(`BT ${gray} g /${font} ${size} Tf ${x} ${y} Td ${pdfString(value)} Tj ET`)
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.82, width = 0.6): void {
    this.ops.push(`${gray} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S`)
  }

  watermark(value: string): void {
    this.ops.push(
      `BT 0.93 g /F2 96 Tf 0.819 0.574 -0.574 0.819 150 260 Tm ${pdfString(value)} Tj ET`,
    )
  }
}

export function renderPdf(doc: PdfDocument): Uint8Array {
  const stream = new ContentStream()
  stream.watermark('MINTA')
  stream.text(
    'F1',
    8.5,
    MARGIN,
    PAGE_HEIGHT - 44,
    'kassza sandbox · szimulált Számlázz.hu bizonylat',
    0.45,
  )
  stream.text('F2', 22, MARGIN, PAGE_HEIGHT - 92, doc.title)
  stream.text('F1', 11, MARGIN, PAGE_HEIGHT - 112, doc.number, 0.3)

  let metaY = PAGE_HEIGHT - 92
  for (const line of doc.meta) {
    stream.text('F1', 9.5, PAGE_WIDTH - MARGIN - 190, metaY, line, 0.25)
    metaY -= 14
  }

  let partyTop = PAGE_HEIGHT - 170
  stream.line(MARGIN, partyTop + 18, PAGE_WIDTH - MARGIN, partyTop + 18)
  doc.parties.forEach((party, index) => {
    const x = MARGIN + index * 250
    stream.text('F2', 9, x, partyTop, party.label.toUpperCase(), 0.4)
    party.lines.forEach((line, lineIndex) => {
      stream.text('F1', 10, x, partyTop - 16 - lineIndex * 14, line)
    })
  })
  partyTop -= 16 + Math.max(...doc.parties.map((party) => party.lines.length), 1) * 14

  let y = partyTop - 30
  stream.line(MARGIN, y + 16, PAGE_WIDTH - MARGIN, y + 16)
  const header = `${cell('Megnevezés', 26)} ${cell('Menny.', 9, 'right')} ${cell('Nettó egységár', 14, 'right')} ${cell('ÁFA', 5, 'right')} ${cell('Nettó', 12, 'right')} ${cell('Bruttó', 12, 'right')}`
  stream.text('F3', 8.4, MARGIN, y, header, 0.4)
  y -= 8
  stream.line(MARGIN, y, PAGE_WIDTH - MARGIN, y)
  y -= 16
  for (const row of doc.rows) {
    const line = `${cell(row.name, 26)} ${cell(row.quantity, 9, 'right')} ${cell(row.unitPrice, 14, 'right')} ${cell(row.vat, 5, 'right')} ${cell(row.net, 12, 'right')} ${cell(row.gross, 12, 'right')}`
    stream.text('F3', 8.4, MARGIN, y, line)
    y -= 15
  }
  stream.line(MARGIN, y + 6, PAGE_WIDTH - MARGIN, y + 6)
  y -= 14
  for (const [label, value] of doc.totals) {
    stream.text('F1', 10, PAGE_WIDTH - MARGIN - 220, y, label, 0.3)
    stream.text('F2', 10.5, PAGE_WIDTH - MARGIN - 110, y, value)
    y -= 16
  }
  if (doc.note) stream.text('F1', 9, MARGIN, y - 18, doc.note, 0.35)
  stream.text(
    'F1',
    8,
    MARGIN,
    40,
    'Ez a dokumentum a kassza sandboxban készült. Nem valódi számla, a NAV felé nem került beküldésre.',
    0.45,
  )

  const content = stream.ops.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${pdfString(doc.number)} /Producer (kassza sandbox) >>`,
  ]

  let output = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return encodeLatin1(output)
}
