export type TokenKind = 'kw' | 'fn' | 'str' | 'num' | 'prop' | 'punc' | 'plain'

export type CodeToken = readonly [kind: TokenKind, text: string]

export interface TimedToken {
  readonly id: string
  readonly kind: TokenKind
  readonly text: string
}

export interface TimedLine {
  readonly id: string
  readonly tokens: readonly TimedToken[]
  readonly chars: number
  readonly delay: number
  readonly duration: number
}

export const HERO_CODE: readonly (readonly CodeToken[])[] = [
  [
    ['kw', 'const'],
    ['plain', ' kassza '],
    ['punc', '='],
    ['plain', ' '],
    ['fn', 'createKassza'],
    ['punc', '()'],
  ],
  [],
  [
    ['kw', 'const'],
    ['plain', ' szamla '],
    ['punc', '='],
    ['plain', ' '],
    ['kw', 'await'],
    ['plain', ' kassza.invoices.'],
    ['fn', 'create'],
    ['punc', '({'],
  ],
  [
    ['plain', '  '],
    ['prop', 'orderNumber'],
    ['punc', ': '],
    ['str', "'REND-1001'"],
    ['punc', ','],
  ],
  [
    ['plain', '  '],
    ['prop', 'buyer'],
    ['punc', ': '],
    ['plain', 'vevo'],
    ['punc', ','],
  ],
  [
    ['plain', '  '],
    ['prop', 'items'],
    ['punc', ': [{'],
  ],
  [
    ['plain', '    '],
    ['prop', 'name'],
    ['punc', ': '],
    ['str', "'Póló'"],
    ['punc', ', '],
    ['prop', 'quantity'],
    ['punc', ': '],
    ['num', '3'],
    ['punc', ','],
  ],
  [
    ['plain', '    '],
    ['prop', 'grossUnitPrice'],
    ['punc', ': '],
    ['num', '5_990'],
    ['punc', ', '],
    ['prop', 'vat'],
    ['punc', ': '],
    ['num', '27'],
    ['punc', ','],
  ],
  [
    ['plain', '  '],
    ['punc', '}],'],
  ],
  [['punc', '})']],
]

export const TYPE_START_MS = 550
const CHAR_MS = 9
const LINE_MIN_MS = 120
const LINE_GAP_MS = 45
const BLANK_LINE_MS = 90

export const SEND_MS = 800
export const PRINT_MS = 1400

function scheduleLines(lines: readonly (readonly CodeToken[])[]): readonly TimedLine[] {
  const timed: TimedLine[] = []
  let cursor = TYPE_START_MS
  for (const [lineIndex, tokens] of lines.entries()) {
    const chars = tokens.reduce((sum, [, text]) => sum + text.length, 0)
    const duration = chars === 0 ? 0 : Math.max(LINE_MIN_MS, chars * CHAR_MS)
    timed.push({
      id: `line-${lineIndex}`,
      tokens: tokens.map(([kind, text], tokenIndex) => ({
        id: `${lineIndex}-${tokenIndex}`,
        kind,
        text,
      })),
      chars,
      delay: cursor,
      duration,
    })
    cursor += chars === 0 ? BLANK_LINE_MS : duration + LINE_GAP_MS
  }
  return timed
}

export const TIMED_CODE: readonly TimedLine[] = scheduleLines(HERO_CODE)

const lastLine = TIMED_CODE.at(-1)

export const SEND_AT_MS: number = lastLine
  ? lastLine.delay + lastLine.duration + 250
  : TYPE_START_MS
export const PRINT_AT_MS: number = SEND_AT_MS + SEND_MS
export const DONE_AT_MS: number = PRINT_AT_MS + PRINT_MS
