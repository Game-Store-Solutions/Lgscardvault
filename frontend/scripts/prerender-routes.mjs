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
    title: 'Shop Local Game Stores Online',
    description:
      'Browse real inventory from verified local game stores. Online checkout and sell/trade your collection.',
  },
  {
    path: '/stores',
    title: 'Find local game stores',
    description:
      'Browse verified Magic, Pokémon, One Piece, and Flesh & Blood storefronts on LGS Card Vault. Shop real in-store inventory online.',
  },
  {
    path: '/pricing',
    title: 'Store Pricing',
    description:
      'Open your verified storefront on LGS Card Vault for $450 flat or 10% of daily online sales until $450. Full platform access with no monthly fees after the cap.',
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
  const fullTitle = `${route.title} | ${siteName}`
  const url = route.path === '/' ? `${site}/` : `${site}${route.path}`
  const description = escapeHtml(route.description)
  const title = escapeHtml(fullTitle)

  return html
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
}

for (const route of routes) {
  const outDir = route.path === '/' ? distDir : path.join(distDir, route.path.slice(1))
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'index.html'), applyMeta(baseHtml, route))
  console.log(`prerender-routes: wrote ${route.path}`)
}
