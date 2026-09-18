'use client'

import { useCallback, useEffect, useState } from 'react'

const EVENT = 'kassza:tab-group'
const STORAGE_PREFIX = 'kassza.tabs.'

function readStored(groupId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + groupId)
  } catch {
    return null
  }
}

function writeStored(groupId: string, value: string): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + groupId, value)
  } catch {
    return
  }
}

export function useTabGroup(
  groupId: string | undefined,
  defaultValue: string,
  values: readonly string[],
): [string, (value: string) => void] {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (!groupId) return
    const stored = readStored(groupId)
    if (stored && values.includes(stored)) setValue(stored)
    function onChange(event: Event) {
      const detail = (event as CustomEvent<{ groupId: string; value: string }>).detail
      if (detail.groupId === groupId && values.includes(detail.value)) setValue(detail.value)
    }
    window.addEventListener(EVENT, onChange)
    return () => window.removeEventListener(EVENT, onChange)
  }, [groupId, values])

  const update = useCallback(
    (next: string) => {
      setValue(next)
      if (!groupId) return
      writeStored(groupId, next)
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { groupId, value: next } }))
    },
    [groupId],
  )

  return [value, update]
}
