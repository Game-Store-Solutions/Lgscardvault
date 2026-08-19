/**
 * Shared holographic layers for card art.
 *
 * Glare is always present (non-foils still catch a specular highlight). Foil
 * printings add a thin-film fringe + fine sparkle. Colors emerge where light
 * hits the surface — not a painted rainbow wash.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  return (
    <>
      {glare && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1]" />}
      {foil && <span aria-hidden className="tilt-holo pointer-events-none absolute inset-0 z-[2]" />}
      {foil && <span aria-hidden className="tilt-sparkle pointer-events-none absolute inset-0 z-[3]" />}
    </>
  )
}
