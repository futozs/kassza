'use client'

import dynamic from 'next/dynamic'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'

const SearchDialog = dynamic(() => import('./search-dialog').then((mod) => mod.SearchDialog), {
  ssr: false,
})

interface SearchContextValue {
  openSearch: () => void
}

const SearchContext = createContext<SearchContextValue | null>(null)

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const openSearch = useCallback(() => {
    setMounted(true)
    setOpen(true)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)
      const isSlash = event.key === '/' && !isTypingTarget(event.target)
      if (!isShortcut && !isSlash) return
      if (event.target instanceof HTMLElement && event.target.closest('.monaco-editor')) return
      event.preventDefault()
      openSearch()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearch])

  return (
    <SearchContext.Provider value={{ openSearch }}>
      {children}
      {mounted ? <SearchDialog open={open} onOpenChange={setOpen} /> : null}
    </SearchContext.Provider>
  )
}

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext)
  if (!context) throw new Error('A useSearch csak SearchProvider alatt használható.')
  return context
}
