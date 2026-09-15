import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(__dirname, '../dist')
const baseHtmlPath = path.join(distDir, 'index.html')

if (!fs.existsSync(baseHtmlPath)) {
  console.error('prerender-routes: dist/index.html not found — run vite build first')
  process.exit(1)
}

const baseHtml = fs.readFileSync(baseHtmlPath, 'utf8')
const site = 'https://lgscardvault.com'
const siteName = 'LGS Card Vault'
const defaultImage = `${site}/brand/android-chrome-512.png`

const routes = [
  {
    path: '/',
    title: 'LGS Card Vault',
    description:
      'LGS Card Vault is the marketplace for Magic, Pokémon, One Piece, and Flesh & Blood from verified local game stores. Shop real in-store inventory online for pickup.',
    body: `
<main>
  <h1>Build your vault.</h1>
  <p>Discover, play, and trade the cards you care about through trusted local game stores. Shop real shelf inventory online, then pick up at the counter. No shipping. The store is the merchant of record.</p>
  <p>Games include Magic: The Gathering, Pokémon, One Piece, and Flesh &amp; Blood.</p>
  <p><a href="/stores">Explore stores</a> · <a href="/for-stores">Open a store</a></p>
</main>`,
  },
  {
    path: '/stores',
    title: 'Find local game stores',
    description:
      'Browse verified Magic, Pokémon, One Piece, and Flesh & Blood storefronts on LGS Card Vault. Shop real in-store inventory online.',
    body: `
<main>
  <h1>Find singles from trusted local stores</h1>
  <p>Browse verified Magic, Pokémon, One Piece, and Flesh &amp; Blood storefronts on LGS Card Vault. Listings are cards stores actually have on the shelf, searchable by set, rarity, condition, and finish.</p>
  <p>Pay online or in store, then pick up at the counter. Want lists, restock alerts, and sell or trade lists stay with your local shop.</p>
  <p><a href="/">Home</a> · <a href="/for-stores">For local game stores</a></p>
</main>`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Find local game stores',
      url: `${site}/stores`,
      description:
        'Browse verified Magic, Pokémon, One Piece, and Flesh & Blood storefronts on LGS Card Vault. Shop real in-store inventory online for pickup.',
    },
  },
  {
    path: '/for-stores',
    title: 'For Local Game Stores',
    description:
      'Put your cases online and keep the sale at your counter. Branded storefront, live inventory, pickup checkout, buylist, want lists, and set alerts. $450 a month.',
    body: `
<main>
  <h1>For local game stores</h1>
  <p>Put your cases online and keep the sale at your counter. LGS Card Vault gives US shops a branded storefront, live singles and sealed inventory, pickup checkout, buylist, want lists, and set restock alerts.</p>
  <p>Square or pay-in-store. Pickup only. You are the merchant of record. Stores are reviewed before they can list. Plans start at $450 a month.</p>
  <p><a href="/register/owner">Apply to open a store</a> · <a href="/stores">See the marketplace</a></p>
</main>`,
  },
]

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function applyMeta(html, route) {
  const fullTitle = route.title.includes(siteName) ? route.title : `${route.title} | ${siteName}`
  const url = route.path === '/' ? `${site}/` : `${site}${route.path}`
  const description = escapeHtml(route.description)
  const title = escapeHtml(fullTitle)
  const canonical = `<link rel="canonical" href="${url}" />`

  let next = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"/,
      `<meta name="description" content="${description}"`,
    )
    .replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${title}"`)
    .replace(
      /<meta property="og:description" content="[^"]*"/,
      `<meta property="og:description" content="${description}"`,
    )
    .replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${url}"`)
    .replace(
      /<meta property="og:image" content="[^"]*"/,
      `<meta property="og:image" content="${defaultImage}"`,
    )

  if (next.includes('rel="canonical"')) {
    next = next.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, canonical)
  } else {
    next = next.replace('</head>', `    ${canonical}\n  </head>`)
  }

  if (route.jsonLd) {
    const script = `<script type="application/ld+json">${JSON.stringify(route.jsonLd)}</script>`
    next = next.replace('</head>', `    ${script}\n  </head>`)
  }

  if (!next.includes('<div id="root"></div>')) {
    console.error(`prerender-routes: missing empty #root in HTML for ${route.path}`)
    process.exit(1)
  }

  return next.replace('<div id="root"></div>', `<div id="root">${route.body.trim()}</div>`)
}

for (const route of routes) {
  const outDir = route.path === '/' ? distDir : path.join(distDir, route.path.slice(1))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), applyMeta(baseHtml, route))
  console.log(`prerender-routes: wrote ${route.path}`)
}
