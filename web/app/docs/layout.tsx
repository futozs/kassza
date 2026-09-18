import type { ReactNode } from 'react'
import { SidebarTree } from '@/components/docs/sidebar-tree'
import { Navbar } from '@/components/site/navbar'
import { SiteFooter } from '@/components/site/site-footer'
import { source } from '@/lib/source'

export default function DocsLayout({ children }: { children: ReactNode }) {
  const tree = source.getPageTree()
  return (
    <>
      <Navbar tree={tree} />
      <div className="flex w-full">
        <aside className="hidden w-[var(--sidebar-width)] shrink-0 border-r border-rule lg:block">
          <div className="scrollbar-thin sticky top-[var(--navbar-height)] h-[calc(100dvh-var(--navbar-height))] overflow-y-auto overscroll-contain px-2 pt-3 pb-10">
            <SidebarTree tree={tree} />
          </div>
        </aside>
        <main id="tartalom" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
      <SiteFooter />
    </>
  )
}
