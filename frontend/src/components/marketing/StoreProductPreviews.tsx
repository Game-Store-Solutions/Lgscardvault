const ADMIN_SHOTS = [
  {
    src: '/brand/for-stores/admin-singles.png',
    alt: 'Acme Store admin Singles tab with the inventory sidebar and live Magic listings.',
    title: 'Singles + sidebar',
    caption: 'The store admin: inventory sidebar, game switcher, and your singles on the shelf.',
    wide: true,
  },
  {
    src: '/brand/for-stores/admin-sealed.png',
    alt: 'Acme Store admin Sealed tab listing boxes and booster packs with quantity and price.',
    title: 'Sealed',
    caption: 'Boxes, packs, and displays. Quantity and price next to the catalog snapshot.',
    wide: false,
  },
  {
    src: '/brand/for-stores/admin-imports.png',
    alt: 'Acme Store admin Imports tab with the CSV import wizard and a completed singles run.',
    title: 'Imports',
    caption: 'CSV import for singles or sealed: pick a game, upload, preview, then run.',
    wide: false,
  },
] as const

export function AdminProductShots() {
  return (
    <div className="space-y-8">
      {ADMIN_SHOTS.filter((shot) => shot.wide).map((shot) => (
        <AdminShot key={shot.src} shot={shot} />
      ))}
      <div className="grid gap-8 lg:grid-cols-2">
        {ADMIN_SHOTS.filter((shot) => !shot.wide).map((shot) => (
          <AdminShot key={shot.src} shot={shot} />
        ))}
      </div>
    </div>
  )
}

function AdminShot({
  shot,
}: {
  shot: (typeof ADMIN_SHOTS)[number]
}) {
  return (
    <figure>
      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card dark:border-white/10">
        <img
          src={shot.src}
          alt={shot.alt}
          width={1440}
          height={920}
          className="h-auto w-full"
          loading="lazy"
        />
      </div>
      <figcaption className="mt-2.5 text-xs font-medium leading-5 text-fg-muted">
        <span className="font-bold text-fg">{shot.title}.</span> {shot.caption}
      </figcaption>
    </figure>
  )
}

