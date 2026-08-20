import { useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Shared holographic layers for card art.
 *
 * Glare is always present (non-foils still catch a specular highlight). Foil
 * printings add a Holo-style light-split field — iridescence at the hotspot,
 * no glitter. `--foil-seed` desyncs the idle warp so a grid of foils does not
 * breathe as one.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  const seed = useRef(0.12 + Math.random() * 0.76)

  return (
    <>
      {glare && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1]" />}
      {foil && (
        <span
          aria-hidden
          className="tilt-holo pointer-events-none absolute inset-0 z-[2]"
          style={{ '--foil-seed': seed.current } as CSSProperties}
        />
      )}
    </>
  )
}
