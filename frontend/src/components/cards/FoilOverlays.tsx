/**
 * Shared holographic layers for card art.
 *
 * Glare is always present (non-foils still catch a specular highlight). Foil
 * printings add a Holo-style light-split field — iridescence at the hotspot,
 * no glitter. Colors emerge from color-dodge, not a painted rainbow.
 */
export function FoilOverlays({ foil = false, glare = true }: { foil?: boolean; glare?: boolean }) {
  return (
    <>
      {glare && <span aria-hidden className="tilt-glare pointer-events-none absolute inset-0 z-[1]" />}
      {foil && <span aria-hidden className="tilt-holo pointer-events-none absolute inset-0 z-[2]" />}
    </>
  )
}
