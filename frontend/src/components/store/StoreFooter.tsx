import { Clock3, Facebook, Globe, Instagram, Mail, MapPin, MessageCircle, Phone, Twitter } from 'lucide-react'
import { STOREFRONT_SHELL } from '../../lib/layoutShell'
import { useStore } from '../../hooks'

/**
 * Storefront footer: hours, address, contact, and social links — everything a
 * shopper needs to actually visit or reach the store. Renders only when a
 * store is in scope and only the columns the owner has filled in; a store
 * with no footer data at all falls back to a slim name-only bar.
 */
export function StoreFooter({ slug }: { slug: string }) {
  const { data: store } = useStore(slug)
  if (!store) return null

  const addressLines = [
    store.addressLine1,
    store.addressLine2,
    [store.city, store.region].filter(Boolean).join(', ') + (store.postalCode ? ` ${store.postalCode}` : ''),
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))

  const hoursLines = (store.hoursText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const socials = [
    { href: store.facebookUrl, label: 'Facebook', icon: Facebook },
    { href: store.instagramUrl, label: 'Instagram', icon: Instagram },
    { href: store.twitterUrl, label: 'Twitter / X', icon: Twitter },
    { href: store.discordUrl, label: 'Discord', icon: MessageCircle },
  ].filter((s): s is { href: string; label: string; icon: typeof Facebook } => Boolean(s.href))

  const hasVisitColumn = addressLines.length > 0 || Boolean(store.phone)
  const hasContactColumn = Boolean(store.contactEmail || store.websiteUrl) || socials.length > 0
  const hasAnything = hasVisitColumn || hasContactColumn || hoursLines.length > 0

  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className={STOREFRONT_SHELL + ' py-10'}>
        {hasAnything && (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {hoursLines.length > 0 && (
              <section aria-label="Store hours">
                <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
                  <Clock3 aria-hidden className="size-4 text-brand-600" />
                  Store hours
                </h2>
                <ul className="space-y-1 text-sm text-fg">
                  {hoursLines.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            {hasVisitColumn && (
              <section aria-label="Visit us">
                <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
                  <MapPin aria-hidden className="size-4 text-brand-600" />
                  Visit us
                </h2>
                <address className="space-y-1 text-sm not-italic text-fg">
                  {addressLines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                  {store.phone && (
                    <p>
                      <a href={`tel:${store.phone}`} className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline">
                        <Phone aria-hidden className="size-3.5" />
                        {store.phone}
                      </a>
                    </p>
                  )}
                </address>
              </section>
            )}

            {hasContactColumn && (
              <section aria-label="Contact and social">
                <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-fg-muted">
                  <Mail aria-hidden className="size-4 text-brand-600" />
                  Get in touch
                </h2>
                <div className="space-y-1 text-sm text-fg">
                  {store.contactEmail && (
                    <p>
                      <a href={`mailto:${store.contactEmail}`} className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline">
                        <Mail aria-hidden className="size-3.5" />
                        {store.contactEmail}
                      </a>
                    </p>
                  )}
                  {store.websiteUrl && (
                    <p>
                      <a
                        href={store.websiteUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 hover:text-brand-600 hover:underline"
                      >
                        <Globe aria-hidden className="size-3.5" />
                        {store.websiteUrl.replace(/^https?:\/\//, '')}
                      </a>
                    </p>
                  )}
                </div>
                {socials.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {socials.map(({ href, label, icon: Icon }) => (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={label}
                        title={label}
                        className="grid size-9 place-items-center rounded-btn border border-border bg-bg text-fg-muted transition-colors hover:border-brand-500 hover:text-brand-600"
                      >
                        <Icon aria-hidden className="size-4" />
                      </a>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        <div className={`flex flex-wrap items-center justify-between gap-3 text-xs text-fg-muted ${hasAnything ? 'mt-8 border-t border-border pt-6' : ''}`}>
          <p className="inline-flex items-center gap-2">
            <img src="/brand/mark.png" alt="" aria-hidden className="size-5 rounded-[20%] object-cover" />
            Powered by LGS Card Vault
          </p>
          <div className="flex items-center gap-2">
            <span className="font-bold text-fg">{store.name}</span>
            {store.logoUrl && (
              <img
                src={store.logoUrl}
                alt=""
                aria-hidden
                loading="lazy"
                className="size-8 rounded-btn border border-border object-cover"
              />
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
