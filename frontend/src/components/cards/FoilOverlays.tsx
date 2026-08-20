import { useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Shared holographic layers for card art.
 *
 * Soft sheen + optional grid, clipped to the card radius. `--foil-seed`
 * desyncs the idle film so a grid of foils does not drift in lockstep.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  const seed = useRef(0.12 + Math.random() * 0.76)

  return (
    <>
      {glare && (
        <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1] rounded-[inherit]" />
      )}
      {foil && (
        <>
          <span
            aria-hidden
            className="tilt-holo pointer-events-none absolute inset-0 z-[2] rounded-[inherit]"
            style={{ '--foil-seed': seed.current } as CSSProperties}
          />
          <span aria-hidden className="tilt-grid pointer-events-none absolute inset-0 z-[3] rounded-[inherit]" />
        </>
      )}
    </>
  )
}
