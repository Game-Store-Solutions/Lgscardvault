/**
 * Shared holographic layers for card art.
 *
 * Glare is always present (non-foils still catch a specular highlight). Rainbow
 * holo, prism bloom, and sparkle only render for foil printings. Pointer-driven
 * CSS variables (`--mx/--my/--op`) come from `useTilt`, including the idle orbit.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  return (
    <>
      {glare && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1]" />}
      {foil && <span aria-hidden className="tilt-holo pointer-events-none absolute inset-0 z-[2]" />}
      {foil && <span aria-hidden className="tilt-prism pointer-events-none absolute inset-0 z-[3]" />}
      {foil && <span aria-hidden className="tilt-sparkle pointer-events-none absolute inset-0 z-[4]" />}
    </>
  )
}
