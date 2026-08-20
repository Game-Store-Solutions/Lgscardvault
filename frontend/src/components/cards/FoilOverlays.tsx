import { useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Shared holographic layers for card art (Pokemon / effect-labs style).
 *
 * Rainbow gradient in color-dodge + fine cross-grid. `--foil-seed` desyncs the
 * holo-gradient loop so a grid of foils does not pulse in sync.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  const seed = useRef(0.12 + Math.random() * 0.76)

  return (
    <>
      {glare && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1]" />}
      {foil && (
        <>
          <span
            aria-hidden
            className="tilt-holo pointer-events-none absolute inset-0 z-[2]"
            style={{ '--foil-seed': seed.current } as CSSProperties}
          />
          <span aria-hidden className="tilt-grid pointer-events-none absolute inset-0 z-[3]" />
        </>
      )}
    </>
  )
}
