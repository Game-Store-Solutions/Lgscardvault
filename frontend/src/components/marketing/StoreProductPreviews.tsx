import { useState } from 'react'
import { cx } from '../../lib/cx'

const ADMIN_SHOTS = [
  {
    id: 'singles',
    src: '/brand/for-stores/admin-singles.png?v=console',
    alt: 'Store admin Singles tab with the inventory sidebar and live Magic listings.',
    title: 'Singles',
    caption: 'Game switcher, live listings, and quantity and price on the same screen.',
    url: 'lgscardvault.com/s/…/admin',
  },
  {
    id: 'sealed',
    src: '/brand/for-stores/admin-sealed.png?v=console',
    alt: 'Store admin Sealed tab listing boxes and booster packs with quantity and price.',
    title: 'Sealed',
    caption: 'Boxes, packs, and displays next to a market snapshot.',
    url: 'lgscardvault.com/s/…/admin/sealed',
  },
  {
    id: 'imports',
    src: '/brand/for-stores/admin-imports.png?v=console',
    alt: 'Store admin Imports tab with the CSV import wizard and a completed singles run.',
    title: 'Imports',
    caption: 'CSV for singles or sealed: pick a game, upload, preview, then run.',
    url: 'lgscardvault.com/s/…/admin/csv',
  },
] as const

type AdminShot = (typeof ADMIN_SHOTS)[number]

export function AdminHeroShot() {
  const shot = ADMIN_SHOTS[0]
  return (
    <ProductFrame
      src={shot.src}
      alt={shot.alt}
      url={shot.url}
      crop
    />
  )
}

export function AdminProductShots() {
  const [activeId, setActiveId] = useState<AdminShot['id']>(ADMIN_SHOTS[0].id)
  const shot = ADMIN_SHOTS.find((item) => item.id === activeId) ?? ADMIN_SHOTS[0]

  return (
    <div>
      <div
        role="tablist"
        aria-label="Store admin screens"
        className="flex gap-6 border-b border-white/15"
      >
        {ADMIN_SHOTS.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`admin-shot-${item.id}`}
              aria-selected={selected}
              aria-controls={`admin-shot-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(item.id)}
              className={cx(
                'relative min-h-10 px-0 py-2 text-sm font-semibold transition-colors',
                selected ? 'text-white' : 'text-white/50 hover:text-white',
              )}
            >
              {item.title}
              {selected ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-white" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`admin-shot-panel-${shot.id}`}
        aria-labelledby={`admin-shot-${shot.id}`}
        className="mt-5"
      >
        <ProductFrame src={shot.src} alt={shot.alt} url={shot.url} />
        <p className="mt-4 text-sm font-medium leading-6 text-white/70">{shot.caption}</p>
      </div>
    </div>
  )
}

function ProductFrame({
  src,
  alt,
  url,
  crop = false,
}: {
  src: string
  alt: string
  url: string
  crop?: boolean
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-white/10 bg-[#111827] shadow-[0_28px_64px_-28px_rgba(10,16,27,0.55)]">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
        <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-white/40">
          Admin
        </span>
        <p className="min-w-0 flex-1 truncate rounded bg-white/[0.08] px-2.5 py-1 text-center text-[11px] font-medium text-white/55">
          {url}
        </p>
      </div>
      <img
        src={src}
        alt={alt}
        width={1440}
        height={900}
        className={cx(
          'block w-full bg-[#f3f4f6]',
          crop ? 'aspect-[16/10] object-cover object-left-top' : 'h-auto',
        )}
        loading={crop ? 'eager' : 'lazy'}
      />
    </figure>
  )
}
