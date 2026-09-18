'use client'

import {
  calculateInvoiceItem,
  calculateReceiptItem,
  type ItemAmounts,
  type VatRate,
} from 'kassza/money'
import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'

type DocumentKind = 'invoice' | 'receipt'
type PriceBasis = 'net' | 'gross'

const VAT_OPTIONS: readonly VatRate[] = [27, 18, 5, 0, 'AAM', 'TAM', 'F.AFA', 'EUFAD37']
const amountFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 6 })

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-medium text-ink-2">{label}</legend>
      <div className="inline-flex rounded-full border border-rule bg-surface p-0.5">
        {options.map(([optionValue, optionLabel]) => (
          <label
            key={optionValue}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1 text-sm whitespace-nowrap transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              value === optionValue
                ? 'bg-paper-raised font-medium text-ink shadow-[var(--shadow-whisper)]'
                : 'text-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
            />
            {optionLabel}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const inputClass =
  'h-10 w-full rounded-[var(--radius-md)] border border-rule bg-paper px-3 font-mono text-sm text-ink transition-colors outline-2 outline-transparent outline-offset-1 hover:bg-surface focus-visible:outline-focus aria-[invalid=true]:border-danger-ink'

export function RoundingCalculator() {
  const id = useId()
  const [kind, setKind] = useState<DocumentKind>('invoice')
  const [basis, setBasis] = useState<PriceBasis>('gross')
  const [currency, setCurrency] = useState<'HUF' | 'EUR'>('HUF')
  const [unitPrice, setUnitPrice] = useState('5990')
  const [quantity, setQuantity] = useState('3')
  const [vat, setVat] = useState<string>('27')

  const vatRate: VatRate = Number.isNaN(Number(vat)) ? (vat as VatRate) : Number(vat)
  const result = useMemo((): { amounts?: ItemAmounts; error?: string } => {
    const price = Number(unitPrice.replace(',', '.'))
    const qty = Number(quantity.replace(',', '.'))
    const input = {
      quantity: qty,
      vat: vatRate,
      ...(basis === 'net' ? { netUnitPrice: price } : { grossUnitPrice: price }),
    }
    try {
      return {
        amounts:
          kind === 'invoice'
            ? calculateInvoiceItem(input, currency)
            : calculateReceiptItem(input, currency),
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }, [unitPrice, quantity, vatRate, basis, kind, currency])

  const priceField = basis === 'net' ? 'netUnitPrice' : 'grossUnitPrice'
  const fn = kind === 'invoice' ? 'calculateInvoiceItem' : 'calculateReceiptItem'
  const vatLiteral = typeof vatRate === 'number' ? vatRate : `'${vatRate}'`
  const currencyArgument = currency === 'HUF' ? '' : `, '${currency}'`

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Segmented
          label="Bizonylat"
          value={kind}
          onChange={setKind}
          options={[
            ['invoice', 'Számla'],
            ['receipt', 'Nyugta'],
          ]}
        />
        <Segmented
          label="Az ár alapja"
          value={basis}
          onChange={setBasis}
          options={[
            ['gross', 'Bruttó (B2C)'],
            ['net', 'Nettó (B2B)'],
          ]}
        />
        <Segmented
          label="Pénznem"
          value={currency}
          onChange={setCurrency}
          options={[
            ['HUF', 'HUF'],
            ['EUR', 'EUR'],
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-price`} className="mb-1.5 block text-xs font-medium text-ink-2">
            {basis === 'net' ? 'Nettó egységár' : 'Bruttó egységár'}
          </label>
          <input
            id={`${id}-price`}
            inputMode="decimal"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            aria-invalid={result.error !== undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-qty`} className="mb-1.5 block text-xs font-medium text-ink-2">
            Mennyiség
          </label>
          <input
            id={`${id}-qty`}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={result.error !== undefined}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-vat`} className="mb-1.5 block text-xs font-medium text-ink-2">
            Áfakulcs
          </label>
          <select
            id={`${id}-vat`}
            value={vat}
            onChange={(event) => setVat(event.target.value)}
            className={inputClass}
          >
            {VAT_OPTIONS.map((option) => (
              <option key={String(option)} value={String(option)}>
                {typeof option === 'number' ? `${option}%` : option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div aria-live="polite">
        {result.amounts ? (
          <dl className="tnum grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-rule bg-rule sm:grid-cols-4">
            {(
              [
                ['Nettó egységár', result.amounts.netUnitPrice],
                ['Nettó érték', result.amounts.netAmount],
                ['Áfa', result.amounts.vatAmount],
                ['Bruttó érték', result.amounts.grossAmount],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="bg-paper px-3 py-2.5">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-mono text-base font-semibold text-ink">
                  {amountFormat.format(value)} {currency === 'HUF' ? 'Ft' : '€'}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rounded-[var(--radius-md)] border border-danger-border bg-danger-bg px-3 py-2.5 text-sm text-danger-ink">
            {result.error}
          </p>
        )}
      </div>

      <pre className="overflow-x-auto rounded-[var(--radius-md)] border border-rule bg-[var(--code-background)] px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-[var(--code-foreground)]">
        <span className="text-[var(--code-token-function)]">{fn}</span>({'{ '}quantity:{' '}
        <span className="text-[var(--code-token-constant)]">{quantity || '0'}</span>, {priceField}:{' '}
        <span className="text-[var(--code-token-constant)]">{unitPrice || '0'}</span>, vat:{' '}
        <span className="text-[var(--code-token-constant)]">{vatLiteral}</span>
        {' }'}
        <span className="text-[var(--code-token-string)]">{currencyArgument}</span>)
      </pre>
    </div>
  )
}
