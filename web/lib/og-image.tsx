import { brandColors, logoPaths } from '@/lib/brand'
import { OG_IMAGE_SIZE } from '@/lib/docs-links'
import { ogFontFamilies } from '@/lib/og-fonts'

const LONG_TITLE_LENGTH = 56
const DESCRIPTION_LIMIT = 160
const DESCRIPTION_LIMIT_LONG_TITLE = 100
const TOOTH_WIDTH = 24
const TOOTH_HEIGHT = 14

interface DocsOgImageProps {
  readonly title: string
  readonly description?: string | undefined
  readonly section?: string | undefined
}

export function truncateText(text: string, limit: number): string {
  const normalized = text.trim()
  if (normalized.length <= limit) return normalized
  const cut = normalized.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')
  const wordSafe = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${wordSafe.replace(/[\s,.;:]+$/, '')}…`
}

export function ogTitleSize(title: string): number {
  if (title.length <= 28) return 88
  if (title.length <= LONG_TITLE_LENGTH) return 72
  return 56
}

export function ogDescriptionLimit(title: string): number {
  return title.length > LONG_TITLE_LENGTH ? DESCRIPTION_LIMIT_LONG_TITLE : DESCRIPTION_LIMIT
}

export function receiptEdgePath(width: number): string {
  const teeth = Math.ceil(width / TOOTH_WIDTH)
  const zigzag = Array.from({ length: teeth }, (_, index) => {
    const x = index * TOOTH_WIDTH
    return `L${x + TOOTH_WIDTH / 2} 0 L${x + TOOTH_WIDTH} ${TOOTH_HEIGHT}`
  })
  return `M0 ${TOOTH_HEIGHT} ${zigzag.join(' ')} Z`
}

function LogoMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="og-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={brandColors.brand} />
          <stop offset="1" stopColor={brandColors.brandDeep} />
        </linearGradient>
        <linearGradient id="og-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={brandColors.receipt} />
          <stop offset="1" stopColor={brandColors.receiptEdge} />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#og-tile)" />
      <path d={logoPaths.receipt} fill="#000" opacity=".22" transform="translate(0 10)" />
      <path d={logoPaths.receipt} fill="url(#og-paper)" />
      <path d={logoPaths.letter} fill={brandColors.brand} />
      <rect x="160" y="368" width="120" height="12" rx="6" fill={brandColors.brand} opacity=".28" />
      <rect x="304" y="368" width="48" height="12" rx="6" fill={brandColors.amber} />
    </svg>
  )
}

export function docsOgImage({ title, description, section }: DocsOgImageProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: brandColors.paper,
        color: brandColors.ink,
        fontFamily: ogFontFamilies.sans,
      }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, padding: '64px 80px 44px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <LogoMark size={68} />
            <span
              style={{
                fontFamily: ogFontFamilies.display,
                fontWeight: 800,
                fontSize: 46,
                letterSpacing: -1.6,
              }}
            >
              kassza
            </span>
          </div>
          <span
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              background: brandColors.accentSoft,
              color: brandColors.accent,
              fontWeight: 500,
              fontSize: 24,
            }}
          >
            Dokumentáció
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flexGrow: 1,
            paddingRight: 40,
          }}
        >
          {section ? (
            <span
              style={{ color: brandColors.accent, fontWeight: 500, fontSize: 28, marginBottom: 14 }}
            >
              {section}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: ogFontFamilies.display,
              fontWeight: 700,
              fontSize: ogTitleSize(title),
              lineHeight: 1.04,
              letterSpacing: -2.4,
            }}
          >
            {title}
          </span>
          {description ? (
            <span
              style={{ marginTop: 20, color: brandColors.muted, fontSize: 28, lineHeight: 1.35 }}
            >
              {truncateText(description, ogDescriptionLimit(title))}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 26,
            borderTop: `2px dashed ${brandColors.ruleStrong}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <span
              style={{
                display: 'flex',
                padding: '8px 16px',
                borderRadius: 10,
                background: brandColors.brand,
                color: brandColors.brandInk,
                fontFamily: ogFontFamilies.mono,
                fontWeight: 500,
                fontSize: 24,
              }}
            >
              npm install kassza
            </span>
            <span style={{ color: brandColors.ink2, fontSize: 24 }}>
              TypeScript kliens a Számlázz.hu Számla Agenthez
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              width: 72,
              height: 12,
              borderRadius: 6,
              background: brandColors.amber,
            }}
          />
        </div>
      </div>
      <svg
        width={OG_IMAGE_SIZE.width}
        height={TOOTH_HEIGHT}
        viewBox={`0 0 ${OG_IMAGE_SIZE.width} ${TOOTH_HEIGHT}`}
        aria-hidden="true"
      >
        <path d={receiptEdgePath(OG_IMAGE_SIZE.width)} fill={brandColors.brand} />
      </svg>
    </div>
  )
}
