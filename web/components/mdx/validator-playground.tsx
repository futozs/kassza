'use client'

import {
  isValidEuVatNumber,
  isValidHungarianIban,
  parseHungarianAddress,
  parseHungarianBankAccount,
  parseHungarianTaxNumber,
} from 'kassza/validators'
import { Check, X } from 'lucide-react'
import { useId, useState } from 'react'

type Kind = 'tax' | 'bank' | 'iban' | 'eu' | 'address'

const KINDS: readonly { value: Kind; label: string; sample: string; fn: string }[] = [
  { value: 'tax', label: 'Adószám', sample: '12345676-2-41', fn: 'parseHungarianTaxNumber' },
  {
    value: 'bank',
    label: 'Bankszámla',
    sample: '11773016-11111018',
    fn: 'parseHungarianBankAccount',
  },
  {
    value: 'iban',
    label: 'IBAN',
    sample: 'HU42 1177 3016 1111 1018 0000 0000',
    fn: 'isValidHungarianIban',
  },
  { value: 'eu', label: 'EU adószám', sample: 'DE123456789', fn: 'isValidEuVatNumber' },
  {
    value: 'address',
    label: 'Cím',
    sample: '1111 Budapest, XI. kerület, Fő utca 1.',
    fn: 'parseHungarianAddress',
  },
]

function evaluate(kind: Kind, value: string): { valid: boolean; detail: unknown } {
  switch (kind) {
    case 'tax': {
      const parsed = parseHungarianTaxNumber(value)
      return { valid: parsed !== undefined, detail: parsed }
    }
    case 'bank': {
      const parsed = parseHungarianBankAccount(value)
      return { valid: parsed !== undefined, detail: parsed }
    }
    case 'iban':
      return { valid: isValidHungarianIban(value), detail: isValidHungarianIban(value) }
    case 'eu':
      return { valid: isValidEuVatNumber(value), detail: isValidEuVatNumber(value) }
    case 'address': {
      const parsed = parseHungarianAddress(value)
      return { valid: parsed !== undefined, detail: parsed }
    }
  }
}

export function ValidatorPlayground() {
  const id = useId()
  const [kind, setKind] = useState<Kind>('tax')
  const [values, setValues] = useState<Record<Kind, string>>(
    () =>
      Object.fromEntries(KINDS.map((item) => [item.value, item.sample])) as Record<Kind, string>,
  )
  const current = KINDS.find((item) => item.value === kind) ?? KINDS[0]
  const value = values[kind]
  const result = evaluate(kind, value)

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">Validátor</legend>
        {KINDS.map((item) => (
          <label
            key={item.value}
            className="cursor-pointer rounded-full border border-rule px-3 py-1 text-sm whitespace-nowrap text-ink-2 transition-colors hover:border-rule-strong hover:text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:font-medium has-[:checked]:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
          >
            <input
              type="radio"
              name={`${id}-kind`}
              value={item.value}
              checked={kind === item.value}
              onChange={() => setKind(item.value)}
              className="sr-only"
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`${id}-input`} className="mb-1.5 block text-xs font-medium text-ink-2">
          Bemenet
        </label>
        <div className="relative">
          <input
            id={`${id}-input`}
            value={value}
            spellCheck={false}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, [kind]: event.target.value }))
            }
            className="h-10 w-full rounded-[var(--radius-md)] border border-rule bg-paper pr-10 pl-3 font-mono text-sm text-ink transition-colors outline-2 outline-transparent outline-offset-1 hover:bg-surface focus-visible:outline-focus"
          />
          <span
            className={`absolute top-1/2 right-3 -translate-y-1/2 ${result.valid ? 'text-tip-ink' : 'text-danger-ink'}`}
            aria-hidden="true"
          >
            {result.valid ? <Check className="size-4" /> : <X className="size-4" />}
          </span>
        </div>
        <p
          className={`mt-1.5 text-sm ${result.valid ? 'text-tip-ink' : 'text-danger-ink'}`}
          aria-live="polite"
        >
          {result.valid
            ? 'Érvényes.'
            : 'Érvénytelen: a formátum vagy az ellenőrző összeg nem stimmel.'}
        </p>
      </div>
      <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-rule bg-[var(--code-background)] px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-[var(--code-foreground)]">
        <span className="text-[var(--code-token-function)]">{current?.fn}</span>(
        <span className="text-[var(--code-token-string)]">'{value}'</span>){'\n'}
        <span className="text-[var(--code-token-comment)]">
          {JSON.stringify(result.detail ?? null, null, 2)}
        </span>
      </pre>
    </div>
  )
}
