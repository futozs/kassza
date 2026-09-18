import { highlight } from 'fumadocs-core/highlight'
import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins/rehype-code'
import { transformerTwoslash } from 'fumadocs-twoslash'
import { createFileSystemTypesCache } from 'fumadocs-twoslash/cache-fs'
import * as Twoslash from 'fumadocs-twoslash/ui'
import type { ComponentProps, ReactNode } from 'react'
import { CodeBlock } from '@/components/mdx/code-block'
import { kasszaCodeTheme } from './code-theme'

const twoslash = transformerTwoslash({
  typesCache: createFileSystemTypesCache(),
  twoslashOptions: {
    compilerOptions: {
      target: 'ES2023',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2023', 'DOM'],
      types: ['node'],
      strict: true,
    },
    handbookOptions: { noErrors: true },
  },
  explicitTrigger: false,
})

export interface HighlightOptions {
  readonly lang: string
  readonly title?: string | undefined
  readonly twoslash?: boolean | undefined
}

export async function highlightCode(code: string, options: HighlightOptions): Promise<ReactNode> {
  const title = options.title
  return highlight(code, {
    lang: options.lang,
    themes: { light: kasszaCodeTheme, dark: kasszaCodeTheme },
    defaultColor: false,
    transformers: [
      ...(rehypeCodeDefaultOptions.transformers ?? []),
      ...(options.twoslash ? [twoslash] : []),
    ],
    components: {
      ...Twoslash,
      pre: (props: ComponentProps<'pre'>) => <CodeBlock {...props} title={title} />,
    },
  })
}
