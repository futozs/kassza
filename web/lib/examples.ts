import examples from '@/generated/examples.json'

export interface GeneratedExampleCall {
  readonly action: string
  readonly field: string
  readonly status: number | string
  readonly sessionReused: boolean
  readonly requestXml: string
  readonly responseHeaders: readonly (readonly string[])[]
  readonly responseBody: string
  readonly responseKind: string
  readonly effects: readonly string[]
}

export interface GeneratedExample {
  readonly slug: string
  readonly title: string
  readonly group: string
  readonly description: string
  readonly docs?: string
  readonly code: string
  readonly output: readonly { readonly level: string; readonly text: string }[]
  readonly calls: readonly GeneratedExampleCall[]
}

const all = examples as readonly GeneratedExample[]

export function getExample(slug: string): GeneratedExample {
  const example = all.find((item) => item.slug === slug)
  if (!example) {
    throw new Error(`Nincs "${slug}" nevű példa a sandbox/examples mappában.`)
  }
  return example
}
