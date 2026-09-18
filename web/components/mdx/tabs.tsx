'use client'

import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { Children, isValidElement, type ReactNode, useMemo } from 'react'
import { cn } from '@/lib/cn'
import { useTabGroup } from './tab-group-store'

function collectValues(children: ReactNode, component: unknown): string[] {
  const values: string[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: string }>(child)) return
    if (child.type === component && typeof child.props.value === 'string')
      values.push(child.props.value)
  })
  return values
}

export function CodeBlockTabs({
  defaultValue,
  groupId,
  children,
}: {
  defaultValue?: string
  groupId?: string
  persist?: boolean | null
  children: ReactNode
}) {
  const values = useMemo(() => collectValues(children, CodeBlockTab), [children])
  const [value, setValue] = useTabGroup(groupId, defaultValue ?? values[0] ?? '', values)
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next) => setValue(String(next))}
      className="codeblock-tabs"
    >
      {children}
    </BaseTabs.Root>
  )
}

export function CodeBlockTabsList({ children }: { children: ReactNode }) {
  return <BaseTabs.List className="codeblock-tabs-list">{children}</BaseTabs.List>
}

export function CodeBlockTabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Tab value={value} className="codeblock-tabs-trigger">
      {children}
    </BaseTabs.Tab>
  )
}

export function CodeBlockTab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Panel value={value} keepMounted className="data-[hidden]:hidden">
      {children}
    </BaseTabs.Panel>
  )
}

export function Tabs({
  items,
  defaultValue,
  groupId,
  children,
  className,
}: {
  items?: string[]
  defaultValue?: string
  groupId?: string
  children: ReactNode
  className?: string
}) {
  const values = useMemo(() => items ?? collectValues(children, Tab), [items, children])
  const [value, setValue] = useTabGroup(groupId, defaultValue ?? values[0] ?? '', values)
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next) => setValue(String(next))}
      className={cn('not-prose mb-6', className)}
    >
      <BaseTabs.List className="relative flex gap-1 overflow-x-auto border-b border-rule [scrollbar-width:none]">
        {values.map((item) => (
          <BaseTabs.Tab
            key={item}
            value={item}
            className="relative px-4 py-2.5 text-[0.95rem] font-medium whitespace-nowrap text-ink-2 transition-colors duration-150 ease-out hover:text-ink data-[active]:text-accent"
          >
            {item}
          </BaseTabs.Tab>
        ))}
        <BaseTabs.Indicator className="absolute bottom-[-1px] left-[var(--active-tab-left)] h-[2px] w-[var(--active-tab-width)] rounded-t-[2px] bg-accent transition-[left,width] duration-200 ease-out" />
      </BaseTabs.List>
      <div className="docs-prose pt-5">{children}</div>
    </BaseTabs.Root>
  )
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  return (
    <BaseTabs.Panel value={value} keepMounted className="data-[hidden]:hidden [&>:last-child]:mb-0">
      {children}
    </BaseTabs.Panel>
  )
}
