import { Braces, FileCode2, FileJson, SquareTerminal } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { CopyButton } from './copy-button'

type PreProps = ComponentProps<'pre'> & {
  title?: string
  icon?: string
  allowCopy?: string | boolean
  'data-line-numbers'?: boolean
  'data-line-numbers-start'?: number
}

function titleIcon(title: string): ReactNode {
  if (/\.(json|jsonc)$/i.test(title)) return <FileJson aria-hidden="true" />
  if (/\.(xml|xsd|html)$/i.test(title)) return <Braces aria-hidden="true" />
  if (/terminal|bash|shell|\.sh$/i.test(title)) return <SquareTerminal aria-hidden="true" />
  return <FileCode2 aria-hidden="true" />
}

export function CodeBlock({
  title,
  icon: _icon,
  allowCopy,
  className,
  style,
  children,
  ...props
}: PreProps) {
  const lineStart = props['data-line-numbers-start']
  const canCopy = allowCopy !== false && allowCopy !== 'false'
  return (
    <figure className="codeblock" dir="ltr">
      {title ? (
        <figcaption className="codeblock-title">
          {titleIcon(title)}
          <span className="truncate">{title}</span>
        </figcaption>
      ) : null}
      <div className="codeblock-viewport">
        <pre
          {...props}
          className={cn(className)}
          style={
            lineStart === undefined
              ? style
              : { ...style, ['--line-start' as string]: String(lineStart) }
          }
        >
          {children}
        </pre>
        {canCopy ? <CopyButton /> : null}
      </div>
    </figure>
  )
}
