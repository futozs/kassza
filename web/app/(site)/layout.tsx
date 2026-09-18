import type { ReactNode } from 'react'
import { Navbar } from '@/components/site/navbar'
import { SiteFooter } from '@/components/site/site-footer'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main id="tartalom">{children}</main>
      <SiteFooter />
    </>
  )
}
