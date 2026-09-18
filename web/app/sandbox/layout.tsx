import type { ReactNode } from 'react'
import { Navbar } from '@/components/site/navbar'

export default function SandboxLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="tartalom">{children}</main>
    </>
  )
}
