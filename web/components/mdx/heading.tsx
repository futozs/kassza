import type { ComponentProps } from 'react'

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5'

export function createHeading(Tag: HeadingTag) {
  function Heading({ id, children, ...props }: ComponentProps<HeadingTag>) {
    return (
      <Tag id={id} {...props}>
        {children}
        {id ? (
          <a
            href={`#${id}`}
            className="hash-link"
            aria-label="Közvetlen hivatkozás erre a szakaszra"
          >
            #
          </a>
        ) : null}
      </Tag>
    )
  }
  Heading.displayName = `Heading(${Tag})`
  return Heading
}
