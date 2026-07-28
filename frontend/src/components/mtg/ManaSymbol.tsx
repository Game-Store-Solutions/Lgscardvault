/**
 * In-house mana symbols: hand-drawn SVG glyphs on classic colored discs —
 * no external icon fonts or Wizards assets. `ManaSymbol` renders one
 * symbol ("W", "3", "X", "W/U", …); `ManaCost` renders a whole cost
 * string like "{2}{R}{R}".
 */

const DISC: Record<string, string> = {
  W: '#f7f2da',
  U: '#b6d9f2',
  B: '#c9c2bd',
  R: '#f2a58d',
  G: '#a9d3ac',
  C: '#d8d3cf',
}

const GLYPH: Record<string, string> = {
  W: '#8a7a2e',
  U: '#1e4c7a',
  B: '#241f26',
  R: '#8c2b18',
  G: '#1d5928',
  C: '#5f5a56',
}

/** Hand-drawn glyph paths on a 100×100 viewBox, centered. */
function Glyph({ symbol, color }: { symbol: string; color: string }) {
  switch (symbol) {
    case 'W': // sun: core + 8 rays
      return (
        <g fill={color}>
          <circle cx="50" cy="50" r="16" />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d="M50 18 L56 34 L44 34 Z" transform={`rotate(${i * 45} 50 50)`} />
          ))}
        </g>
      )
    case 'U': // water droplet
      return <path fill={color} d="M50 16 C50 16 24 48 24 64 C24 78 36 88 50 88 C64 88 76 78 76 64 C76 48 50 16 50 16 Z" />
    case 'B': // skull
      return (
        <g fill={color}>
          <path d="M50 18 C31 18 22 32 22 47 C22 58 27 64 32 68 L32 80 C32 84 35 86 39 86 L61 86 C65 86 68 84 68 80 L68 68 C73 64 78 58 78 47 C78 32 69 18 50 18 Z" />
          <circle cx="39" cy="50" r="8" fill={DISC.B} />
          <circle cx="61" cy="50" r="8" fill={DISC.B} />
          <rect x="46" y="64" width="8" height="12" rx="3" fill={DISC.B} />
        </g>
      )
    case 'R': // flame
      return (
        <path
          fill={color}
          d="M54 14 C58 28 48 32 46 42 C44 50 50 54 54 50 C56 48 56 44 55 41 C64 46 74 56 74 68 C74 81 63 89 50 89 C37 89 26 81 26 66 C26 52 38 44 40 32 C41 26 40 20 38 16 C46 18 52 24 54 14 Z"
        />
      )
    case 'G': // tree
      return (
        <g fill={color}>
          <path d="M50 12 L70 40 L60 40 L74 62 L58 62 L58 62 L26 62 L40 40 L30 40 Z" />
          <path d="M50 12 L70 40 L60 40 L74 62 L26 62 L40 40 L30 40 Z" />
          <rect x="44" y="60" width="12" height="26" rx="3" />
        </g>
      )
    case 'C': // colorless diamond
      return <path fill={color} d="M50 16 L80 50 L50 84 L20 50 Z" />
    case 'S': // snow
      return (
        <g stroke={color} strokeWidth="8" strokeLinecap="round">
          <path d="M50 18 V82" />
          <path d="M22 34 L78 66" />
          <path d="M78 34 L22 66" />
        </g>
      )
    case 'T': // tap arrow
      return (
        <g fill="none" stroke={color} strokeWidth="10" strokeLinecap="round">
          <path d="M30 62 A26 26 0 1 1 66 60" />
          <path d="M66 44 L66 62 L48 62" fill="none" />
        </g>
      )
    default: // numbers, X, Y, unknown — bold text
      return (
        <text x="50" y="68" textAnchor="middle" fontSize="56" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif" fill={color}>
          {symbol}
        </text>
      )
  }
}

export function ManaSymbol({ symbol, className = 'size-5' }: { symbol: string; className?: string }) {
  const parts = symbol.toUpperCase().split('/')
  // Phyrexian ({W/P}) renders on its color's disc; hybrid ({W/U}) splits the disc.
  const colors = parts.filter((part) => part in DISC)
  const isPhyrexian = parts.includes('P')
  const isHybrid = colors.length === 2 && !isPhyrexian
  const primary = colors[0]
  const disc = primary ? DISC[primary] : DISC.C
  const glyphColor = primary ? GLYPH[primary] : GLYPH.C
  const gradientId = isHybrid ? `mana-${colors[0]}-${colors[1]}` : undefined

  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={`{${symbol}}`}
      className={`inline-block shrink-0 drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)] ${className}`}
    >
      {isHybrid && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="50%" stopColor={DISC[colors[0]]} />
            <stop offset="50%" stopColor={DISC[colors[1]]} />
          </linearGradient>
        </defs>
      )}
      <circle cx="50" cy="50" r="48" fill={isHybrid ? `url(#${gradientId})` : disc} />
      <circle cx="50" cy="50" r="48" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="3" />
      {isHybrid ? (
        <>
          <g transform="translate(-19,-19) scale(0.62)">
            <Glyph symbol={colors[0]} color={GLYPH[colors[0]]} />
          </g>
          <g transform="translate(57,57) scale(0.62) translate(-31,-31)">
            <Glyph symbol={colors[1]} color={GLYPH[colors[1]]} />
          </g>
        </>
      ) : isPhyrexian ? (
        <g fill="none" stroke={glyphColor} strokeWidth="9" strokeLinecap="round">
          {/* Phyrexian phi */}
          <circle cx="50" cy="48" r="20" />
          <path d="M50 16 V84" />
        </g>
      ) : (
        <Glyph symbol={parts.length === 1 ? parts[0] : symbol.toUpperCase()} color={glyphColor} />
      )}
    </svg>
  )
}

/** Render a full mana cost string, e.g. "{2}{W}{W}" or "{X}{U/R}". */
export function ManaCost({ cost, className = 'size-5' }: { cost?: string | null; className?: string }) {
  if (!cost) return null
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])
  if (symbols.length === 0) return null

  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {symbols.map((symbol, index) => (
        <ManaSymbol key={`${symbol}-${index}`} symbol={symbol} className={className} />
      ))}
    </span>
  )
}

export default ManaSymbol
