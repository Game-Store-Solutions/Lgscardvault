/**
 * Captures one PNG per training beat with the exact UI state for that step.
 *
 *   cd frontend && npm run training:capture
 *   cd frontend && npm run training:capture -- orders
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '../..')
const outRoot = path.join(frontendDir, 'public', 'training', 'beats')
const tmpDir = path.join(outRoot, '_tmp')

const modulesUrl = pathToFileURL(
  path.join(frontendDir, 'src', 'pages', 'store-admin', 'training', 'modules.ts'),
).href

const { TRAINING_MODULES } = await import(modulesUrl)

const BASE = process.env.TRAINING_BASE ?? 'http://localhost:5174'
const STORE = process.env.TRAINING_STORE ?? 'acme-store'
const EMAIL = process.env.TRAINING_EMAIL ?? 'admin@store.local'
const PASS = process.env.TRAINING_PASSWORD ?? 'password123'

/** Training target strings that differ from data-guide labels in the UI. */
const TARGET_ALIASES = {
  Type: 'What are you importing',
  Upload: 'Upload your CSV',
  Preview: '4. Preview',
  Import: '5. Import',
  'sealed in stock': 'Sealed in stock',
  'Sell submissions': 'sell-submissions',
}

function beatPath(slug, href) {
  if (href === '/') return `/s/${slug}?guide=1`
  return `/s/${slug}${href}?guide=1`
}

function resolveTarget(target) {
  if (!target) return []
  return target.split('|').flatMap((part) => {
    const t = part.trim()
    return [t, TARGET_ALIASES[t]].filter(Boolean)
  })
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox', { name: /email/i }).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })
}

async function dismissChrome(page) {
  const accept = page.getByRole('button', { name: /accept all/i })
  if (await accept.count()) await accept.click().catch(() => {})
}

async function waitUi(page, ms = 500) {
  await page.waitForTimeout(ms)
}

async function highlightTarget(page, target) {
  for (const needle of resolveTarget(target)) {
    const ok = await page.evaluate((n) => {
      const el = document.querySelector(`[data-guide="${n}"]`)
      if (!el) return false
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
      el.style.outline = '4px solid #6366f1'
      el.style.outlineOffset = '3px'
      el.style.borderRadius = '8px'
      return true
    }, needle)
    if (ok) {
      await waitUi(page, 300)
      return true
    }
  }
  return false
}

async function scrollToGuide(page, target) {
  for (const needle of resolveTarget(target)) {
    const guided = page.locator(`[data-guide="${needle}"]`)
    if (await guided.count()) {
      await guided.first().scrollIntoViewIfNeeded()
      await waitUi(page, 250)
      return true
    }
    const heading = page.getByRole('heading', { name: new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
    if (await heading.count()) {
      await heading.first().scrollIntoViewIfNeeded()
      await waitUi(page, 250)
      return true
    }
    const label = page.getByLabel(needle, { exact: false })
    if (await label.count()) {
      await label.first().scrollIntoViewIfNeeded()
      await waitUi(page, 250)
      return true
    }
    const text = page.getByText(needle, { exact: true })
    if (await text.count()) {
      await text.first().scrollIntoViewIfNeeded()
      await waitUi(page, 250)
      return true
    }
  }
  return false
}

async function clickGuide(page, target) {
  for (const needle of resolveTarget(target)) {
    const guided = page.locator(`[data-guide="${needle}"]`)
    if (await guided.count()) {
      await guided.first().click()
      await waitUi(page, 350)
      return true
    }
    if (needle.endsWith(' tab')) {
      const tabLabel = needle.replace(/ tab$/, '')
      const tab = page.locator(`[data-guide="${needle}"]`).or(page.getByRole('button', { name: tabLabel, exact: true }))
      if (await tab.count()) {
        await tab.first().click()
        await waitUi(page, 350)
        return true
      }
    }
    const btn = page.getByRole('button', { name: needle, exact: true })
    if (await btn.count()) {
      await btn.first().click()
      await waitUi(page, 350)
      return true
    }
    const link = page.getByRole('link', { name: needle, exact: true })
    if (await link.count()) {
      await link.first().click()
      await waitUi(page, 350)
      return true
    }
  }
  return false
}

async function pickImportGame(page) {
  const pills = page.locator('[data-guide="Import for"]').getByRole('button')
  if (await pills.count()) {
    await pills.first().click()
    await waitUi(page, 400)
    return
  }
  const select = page.locator('select').first()
  if (await select.count()) {
    const options = select.locator('option')
    const count = await options.count()
    if (count > 1) await select.selectOption({ index: 1 })
  }
}

async function importWizardLevel(page, level) {
  if (level >= 1) await pickImportGame(page)
  if (level >= 2) {
    await page.getByRole('button', { name: 'Singles' }).click().catch(() => {})
    await waitUi(page, 400)
  }
  if (level >= 3) {
    await mkdir(tmpDir, { recursive: true })
    const csvPath = path.join(tmpDir, 'sample.csv')
    await writeFile(
      csvPath,
      'name,game,set,condition,foil,rarity,quantity,variant,collectorNumber\nLightning Bolt,magic,lea,near_mint,normal,common,1,,\n',
    )
    await page.locator('input[type="file"]').setInputFiles(csvPath)
    await page.getByText(/preview|validating|matched/i).first().waitFor({ timeout: 45000 }).catch(() => {})
    await waitUi(page, 800)
  }
}

async function prepareModuleBeat(page, moduleId, beat, index) {
  switch (moduleId) {
    case 'import-csv':
      if (index <= 1) await scrollToGuide(page, index === 0 ? 'Imports' : 'Import inventory')
      else if (index === 2) await scrollToGuide(page, 'Which game')
      else if (index === 3) await importWizardLevel(page, 1)
      else if (index === 4) await importWizardLevel(page, 2)
      else if (index === 5) {
        await importWizardLevel(page, 2)
        await scrollToGuide(page, 'Upload your CSV')
      } else if (index === 6) {
        await importWizardLevel(page, 3)
        await scrollToGuide(page, 'Preview')
      } else if (index === 7) {
        await importWizardLevel(page, 3)
        await scrollToGuide(page, 'Import')
      } else if (index === 7) await scrollToGuide(page, 'Failed')
      break

    case 'orders':
      if (index >= 3 && index <= 5) await clickGuide(page, 'Pending tab')
      if (index === 4 || index === 5) await page.getByLabel('Order actions').first().click().catch(() => {})
      if (index === 6) await clickGuide(page, 'Ready for pickup tab')
      break

    case 'buy-list':
      if (index === 2) await page.getByRole('button', { name: 'Needs review' }).click().catch(() => {})
      if (index === 3 || (index >= 4 && index <= 6)) {
        await clickGuide(page, 'trade-rates')
        await waitUi(page, 300)
      }
      if (index === 7) await clickGuide(page, 'buy-list')
      break

    case 'branding':
      if (index >= 1) await clickGuide(page, 'Colors')
      if (index === 2) await scrollToGuide(page, 'Theme library')
      if (index >= 3) await clickGuide(page, 'Cards')
      if (index === 4) await clickGuide(page, 'Gallery')
      if (index === 5) await clickGuide(page, 'Marketplace compact')
      break

    case 'take-cards':
      if (index >= 3) await scrollToGuide(page, index === 3 ? 'Connect Square' : index === 4 ? 'Square status' : 'Go live')
      break

    case 'team':
      if (index === 1) await scrollToGuide(page, 'Add an employee')
      if (index === 2) await scrollToGuide(page, 'Employee email')
      if (index === 3) await scrollToGuide(page, 'Access')
      if (index === 4) await scrollToGuide(page, 'Owner')
      break

    case 'credit':
      if (index === 1) await scrollToGuide(page, 'Outstanding credit')
      if (index === 2) await scrollToGuide(page, 'Customer balances')
      if (index === 3) {
        await scrollToGuide(page, 'Customer balances')
        await page.locator('[data-guide="Adjust"]').first().click().catch(() => {})
      }
      break

    case 'events':
      if (index === 1) {
        await page.locator('[data-guide="Board heading"]').fill('Friday Night Magic').catch(() => {})
      }
      if (index === 2) await scrollToGuide(page, 'Intro blurb')
      if (index >= 3) await scrollToGuide(page, 'Add event')
      if (index === 4) await scrollToGuide(page, 'Add to board')
      if (index === 5) await scrollToGuide(page, 'Save events')
      break

    case 'spotlight':
      if (index === 1) await scrollToGuide(page, 'Save spotlight')
      if (index === 2) await scrollToGuide(page, 'Live storefront rail')
      if (index === 3) {
        await scrollToGuide(page, 'Minimum price')
        await page.getByLabel(/store price|minimum/i).first().focus().catch(() => {})
      }
      if (index === 4) await scrollToGuide(page, 'Minimum cards')
      break

    case 'cases':
      if (index === 1) {
        await page.locator('[data-guide="New case name"]').fill('Front counter case').catch(() => {})
      }
      if (index === 2) await scrollToGuide(page, 'Add case')
      if (index === 3) await scrollToGuide(page, 'Display cases')
      break

    case 'sealed':
      if (index === 1) await scrollToGuide(page, 'Manage sealed for')
      if (index === 2) await scrollToGuide(page, 'sealed in stock')
      if (index === 3) {
        await scrollToGuide(page, 'Search sealed')
        await page.locator('[data-guide="Search sealed"]').focus().catch(() => {})
      }
      break

    case 'add-singles':
      if (beat.demo?.thenClick) await clickGuide(page, beat.demo.thenClick)
      if (beat.demo?.fill) {
        const field = page.locator('[data-guide="Card name"]').first()
        if (await field.count()) await field.fill(beat.demo.fill)
      }
      break

    default:
      break
  }

  if (beat.demo?.thenClick && moduleId !== 'add-singles' && moduleId !== 'buy-list') {
    await clickGuide(page, beat.demo.thenClick)
  }

  await scrollToGuide(page, beat.target)
  await highlightTarget(page, beat.target)
}

async function captureBeat(page, module, beat, index) {
  await page.goto(`${BASE}${beatPath(STORE, beat.href)}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  }).catch(() =>
    page.goto(`${BASE}${beatPath(STORE, beat.href)}`, { waitUntil: 'domcontentloaded' }),
  )
  await dismissChrome(page)
  await waitUi(page, 900)
  await prepareModuleBeat(page, module.id, beat, index)
  await waitUi(page, 500)

  const dir = path.join(outRoot, module.id)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${String(index + 1).padStart(2, '0')}.png`)

  const main = page.locator('main').first()
  if (await main.count()) {
    await main.screenshot({ path: file })
  } else {
    await page.screenshot({ path: file, fullPage: false })
  }
  return file
}

async function main() {
  const filter = process.argv[2]
  const list = filter ? TRAINING_MODULES.filter((m) => m.id === filter) : TRAINING_MODULES
  if (!list.length) {
    console.error('No modules matched', filter)
    process.exit(1)
  }

  console.log(`Capturing beats for ${list.length} module(s) at ${BASE}…`)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await login(page)

  let total = 0
  for (const module of list) {
    console.log(module.id)
    for (let i = 0; i < module.beats.length; i += 1) {
      const beat = module.beats[i]
      const file = await captureBeat(page, module, beat, i)
      total += 1
      console.log(`  #${i + 1} ${beat.title} → ${path.relative(frontendDir, file)}`)
    }
  }

  await browser.close()
  console.log(`Done — ${total} screenshots → frontend/public/training/beats/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
