'use client'

import { useEffect, useState } from 'react'

export function useShortcutLabel(): { mod: string; isMac: boolean } {
  const [isMac, setIsMac] = useState(true)
  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ?? navigator.platform
    setIsMac(/mac|iphone|ipad/i.test(platform))
  }, [])
  return { mod: isMac ? '⌘' : 'Ctrl', isMac }
}
