import { rehypeCodeDefaultOptions } from 'fumadocs-core/mdx-plugins/rehype-code'
import { defineConfig } from 'fumadocs-mdx/config'
import lastModified from 'fumadocs-mdx/plugins/last-modified'
import { transformerTwoslash } from 'fumadocs-twoslash'
import { createFileSystemTypesCache } from 'fumadocs-twoslash/cache-fs'
import { kasszaCodeTheme } from './lib/code-theme'

export default defineConfig({
  plugins: [lastModified()],
  mdxOptions: {
    rehypeCodeOptions: {
      themes: { light: kasszaCodeTheme, dark: kasszaCodeTheme },
      langs: ['ts', 'tsx', 'js', 'json', 'bash', 'xml', 'html', 'css', 'dotenv', 'diff', 'http'],
      transformers: [
        ...(rehypeCodeDefaultOptions.transformers ?? []),
        transformerTwoslash({
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
          },
        }),
      ],
    },
    remarkNpmOptions: { persist: { id: 'package-manager' } },
    remarkCodeTabOptions: { parseMdx: true },
  },
})
