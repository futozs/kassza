import type { ReactNode } from 'react'
import { sidebarAsideClass, sidebarScrollClass } from '@/components/docs/sidebar-styles'
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
        <aside className={sidebarAsideClass}>
          <div className={sidebarScrollClass}>
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
