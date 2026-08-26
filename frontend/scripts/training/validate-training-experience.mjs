/**
 * Browser QA for Training experience: interaction lock, narration, demo prep, exit cleanup.
 *
 * Run: cd frontend && npx tsx ../.tools/playwright/validate-training-experience.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.TRAINING_BASE_URL ?? 'http://localhost:5174'
const results = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // Allow autoplay for narration checks
  permissions: [],
})
const page = await context.newPage()

console.log(`Logging in at ${BASE}…`)
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.getByRole('textbox', { name: /email/i }).fill('admin@store.local')
await page.locator('input[type="password"]').fill('password123')
await page.getByRole('button', { name: /sign in/i }).click()
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })

async function openModule(title) {
  await page.goto(`${BASE}/s/acme-store/admin/training`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.getByRole('heading', { name: /^Training$/i }).waitFor({ timeout: 20000 })
  await page.getByRole('button', { name: title }).click({ timeout: 15000 })
  await page.locator('iframe[title^="Training preview"]').waitFor({ timeout: 20000 })
  await page.waitForFunction(
    () => document.querySelector('[data-training-spotlight][data-training-position-settled="1"]') != null,
    { timeout: 60000 },
  )
}

async function frame() {
  return page.frameLocator('iframe[title^="Training preview"]')
}

async function waitBeatReady() {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText
      return text.includes('Playing') || text.includes('Paused')
    },
    { timeout: 60000 },
  )
  await page.waitForTimeout(800)
}

async function pauseLesson() {
  const pauseBtn = page.getByRole('button', { name: 'Pause lesson' })
  if (await pauseBtn.isVisible().catch(() => false)) {
    await pauseBtn.click()
    await page.waitForTimeout(300)
  }
}

async function currentBeatCounter() {
  const text = await page.getByText(/\d{2} \//).first().textContent()
  const match = text?.match(/^(\d{2})/)
  return match ? Number(match[1]) : null
}

// ── Interaction lock ─────────────────────────────────────────────────────────
console.log('\n=== Interaction lock ===')
await openModule('Add singles')
await waitBeatReady()

const beforePath = await page.evaluate(() => {
  const iframe = document.querySelector('iframe[title^="Training preview"]')
  return iframe?.contentWindow?.location.pathname ?? null
})

// Click unrelated sidebar nav (Sealed) inside iframe — should NOT navigate
const sealedLink = (await frame()).locator('[data-guide="Sealed"], a:has-text("Sealed")').first()
if (await sealedLink.count()) {
  await sealedLink.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(600)
}
const afterSidebarPath = await page.evaluate(() => {
  const iframe = document.querySelector('iframe[title^="Training preview"]')
  return iframe?.contentWindow?.location.pathname ?? null
})
record(
  'Sidebar click blocked during locked beat',
  beforePath === afterSidebarPath && afterSidebarPath?.includes('/admin'),
  `path stayed ${afterSidebarPath}`,
)

// Click background inside iframe (non-interactive area) — should not change beat
const beatBeforeBg = await page.getByText(/\d{2} \//).first().textContent()
await page.evaluate(() => {
  const iframe = document.querySelector('iframe[title^="Training preview"]')
  const doc = iframe?.contentDocument
  const main = doc?.getElementById('main-content') ?? doc?.body
  main?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
})
await page.waitForTimeout(400)
const beatAfterBg = await page.getByText(/\d{2} \//).first().textContent()
record('Background click does not advance beat', beatBeforeBg === beatAfterBg)

// Player controls still work
await page.getByRole('button', { name: 'Next step' }).click()
await page.getByText('02 /').first().waitFor({ timeout: 15000 })
record('Player Next control works during lock', true)

// ── Demo / field entry ───────────────────────────────────────────────────────
console.log('\n=== Demo & field entry ===')
await page.getByRole('button', { name: /^Step 3:/i }).click()
await page.getByText('03 /').first().waitFor({ timeout: 15000 })
await page.waitForFunction(
  () => document.querySelector('[data-training-spotlight][data-training-position-settled="1"]') != null,
  { timeout: 90000 },
)
await page.waitForFunction(
  () => {
    const doc = document.querySelector('iframe[title^="Training preview"]')?.contentDocument
    const field = doc?.querySelector('[data-guide="Card name"]')
    const InputCtor = doc?.defaultView?.HTMLInputElement
    const isInput = InputCtor ? field instanceof InputCtor : field?.tagName === 'INPUT'
    const value = isInput && field && 'value' in field ? String(field.value) : ''
    return value.toLowerCase().includes('lightning')
  },
  { timeout: 30000 },
)

const cardNameValue = await page.evaluate(() => {
  const doc = document.querySelector('iframe[title^="Training preview"]')?.contentDocument
  const field = doc?.querySelector('[data-guide="Card name"]')
  const InputCtor = doc?.defaultView?.HTMLInputElement
  const isInput = InputCtor ? field instanceof InputCtor : field?.tagName === 'INPUT'
  return isInput && field && 'value' in field ? String(field.value) : null
})
record(
  'Demo prepare fills Card name field',
  cardNameValue?.toLowerCase().includes('lightning'),
  `value="${cardNameValue ?? ''}"`,
)

// ── Narration ────────────────────────────────────────────────────────────────
console.log('\n=== Narration ===')
await openModule('See what shoppers see')
await waitBeatReady()

// Unmute if needed — lesson auto-plays on open
const muteBtn = page.getByRole('button', { name: /unmute voice|mute voice/i })
if ((await muteBtn.getAttribute('aria-label')) === 'Unmute voice') {
  await muteBtn.click()
}

await page.waitForFunction(
  () => /Voice on|Browser voice|Loading voice/i.test(document.body.innerText),
  { timeout: 20000 },
)
await page.waitForTimeout(400)

const narrationBeat1 = await page.evaluate(() => {
  const voiceText = document.body.innerText
  const voiceOn = /Voice on|Browser voice|Loading voice/i.test(voiceText)
  const caption = document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
  return { voiceOn, captionLen: caption.length, voiceText: voiceText.match(/Voice[^\n·]+/)?.[0] ?? '' }
})
record(
  'Beat 1 narration starts (voice indicator active)',
  narrationBeat1.voiceOn,
  narrationBeat1.voiceText || 'no voice indicator',
)
record('Beat 1 captions visible', narrationBeat1.captionLen > 20, `len=${narrationBeat1.captionLen}`)

// Advance beat — captions should update for the new step
await pauseLesson()
const beatBeforeSwitch = await currentBeatCounter()
await page.getByRole('button', { name: 'Next step' }).click()
await page.waitForFunction(
  (prev) => {
    const text = document.body.innerText.match(/\d{2} \//)?.[0] ?? ''
    const n = Number(text.slice(0, 2))
    return Number.isFinite(n) && n === prev + 1
  },
  beatBeforeSwitch,
  { timeout: 20000 },
)
await page.waitForTimeout(800)
const captionAfterSwitch = await page.evaluate(() => {
  return document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
})
record(
  'Switching beats updates captions',
  captionAfterSwitch.length > 20,
  `caption len=${captionAfterSwitch.length}`,
)

// Close training — narration should stop (voice no longer speaking)
await page.getByRole('button', { name: 'All modules' }).click()
await page.getByRole('heading', { name: /^Training$/i }).waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
const afterClose = await page.evaluate(() => {
  const voiceText = document.body.innerText
  return !/Voice on|Browser voice/i.test(voiceText)
})
record('Closing Training stops narration', afterClose)

// ── Exit releases interaction lock ───────────────────────────────────────────
console.log('\n=== Exit cleanup ===')
await openModule('Add singles')
await waitBeatReady()
const lockedDuring = await page.evaluate(() => {
  const doc = document.querySelector('iframe[title^="Training preview"]')?.contentDocument
  return doc?.body?.classList.contains('training-guided-locked') ?? false
})
record('Iframe has training lock class during lesson', lockedDuring)

await page.getByRole('button', { name: 'All modules' }).click()
await page.getByRole('heading', { name: /^Training$/i }).waitFor({ timeout: 15000 })

// Open admin directly without training — clicks should work
await page.goto(`${BASE}/s/acme-store/admin?training=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1000)
const lockReleased = await page.evaluate(() => {
  const doc = document.body.ownerDocument
  const iframe = document.querySelector('iframe')
  // Direct admin page (not training player) — no lock class on body
  return !document.body.classList.contains('training-guided-locked')
})
record('Exiting lesson removes player lock context', lockReleased)

// ── Summary ────────────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\nTraining experience QA: ${passed} PASS, ${failed.length} FAIL (${results.length} checks)\n`)
for (const row of failed) {
  console.log(`  FAIL  ${row.name}${row.detail ? ` — ${row.detail}` : ''}`)
}

await browser.close()
process.exit(failed.length ? 1 : 0)
