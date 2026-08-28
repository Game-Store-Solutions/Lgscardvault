import { useEffect } from 'react'

const SITE_NAME = 'LGS Card Vault'
export const DEFAULT_OG_IMAGE = 'https://lgscardvault.com/brand/android-chrome-512.png'
const DEFAULT_DESCRIPTION =
  'LGS Card Vault — Magic, Pokémon, One Piece, and Flesh & Blood from trusted local game stores.'

export interface PageMeta {
  title: string
  description?: string
  path?: string
  image?: string
  type?: 'website' | 'article'
  noIndex?: boolean
}

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : 'https://lgscardvault.com'

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    const key = selector.includes('property=') ? 'property' : 'name'
    const match = selector.match(/(?:property|name)="([^"]+)"/)
    if (match) el.setAttribute(key, match[1])
    document.head.appendChild(el)
  }
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value)
  }
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Sets document title and common SEO / Open Graph tags for the current route. */
export function usePageMeta(meta: PageMeta) {
  const description = meta.description ?? DEFAULT_DESCRIPTION
  const image = meta.image ?? DEFAULT_OG_IMAGE
  const url = meta.path ? `${ORIGIN}${meta.path}` : undefined
  const title = meta.title.includes(SITE_NAME) ? meta.title : `${meta.title} | ${SITE_NAME}`

  useEffect(() => {
    document.title = title

    upsertMeta('meta[name="description"]', { content: description })
    upsertMeta('meta[property="og:title"]', { content: title })
    upsertMeta('meta[property="og:description"]', { content: description })
    upsertMeta('meta[property="og:type"]', { content: meta.type ?? 'website' })
    upsertMeta('meta[name="twitter:card"]', { content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { content: title })
    upsertMeta('meta[name="twitter:description"]', { content: description })

    if (url) {
      upsertMeta('meta[property="og:url"]', { content: url })
      upsertLink('canonical', url)
    }

    upsertMeta('meta[property="og:image"]', { content: image })
    upsertMeta('meta[name="twitter:image"]', { content: image })

    if (meta.noIndex) {
      upsertMeta('meta[name="robots"]', { content: 'noindex, nofollow' })
    } else {
      const robots = document.head.querySelector('meta[name="robots"]')
      robots?.remove()
    }
  }, [description, image, meta.noIndex, meta.type, title, url])
}

export function useJsonLd(id: string, data: Record<string, unknown>) {
  const payload = JSON.stringify(data)
  useEffect(() => {
    const scriptId = `jsonld-${id}`
    let el = document.getElementById(scriptId) as HTMLScriptElement | null
    if (!el) {
      el = document.createElement('script')
      el.id = scriptId
      el.type = 'application/ld+json'
      document.head.appendChild(el)
    }
    el.textContent = payload
    return () => {
      el?.remove()
    }
  }, [id, payload])
}
