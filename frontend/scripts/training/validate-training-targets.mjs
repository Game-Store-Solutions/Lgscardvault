/**
 * Validates every training beat target resolves uniquely in the live iframe
 * and that overlay coordinates align with the resolved element.
 *
 * Run: npm run training:validate-targets --workspace frontend
 * Optional: TRAINING_MODULE=take-cards npm run training:validate-targets
 */
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(dir, '../..')
const moduleFilter = process.env.TRAINING_MODULE?.trim()

const { TRAINING_MODULES } = await import(
  pathToFileURL(path.join(frontendRoot, 'src/pages/store-admin/training/modules.ts')).href
)

const IFRAME_WIDTH = 1280
const POINTER_TOLERANCE_PX = 8

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

console.log('Logging in…')
await page.goto('http://localhost:5174/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.getByRole('textbox', { name: /email/i }).fill('admin@store.local')
await page.locator('input[type="password"]').fill('password123')
await page.getByRole('button', { name: /sign in/i }).click()
await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 })

const accept = page.getByRole('button', { name: /accept all/i })
if (await accept.count()) await accept.click().catch(() => {})

async function dismissCookies() {
  const acceptAll = page.getByRole('button', { name: /accept all/i })
  if (await acceptAll.count()) await acceptAll.click().catch(() => {})
}

/** @type {{ module: string, beat: number, title: string, target: string, status: string, reason?: string }[]} */
const results = []

const modules = moduleFilter
  ? TRAINING_MODULES.filter((m) => m.id === moduleFilter)
  : TRAINING_MODULES

if (moduleFilter && modules.length === 0) {
  console.error(`Unknown module id: ${moduleFilter}`)
  process.exit(1)
}

async function openModule(module) {
  await page.goto('http://localhost:5174/s/acme-store/admin/training', {
    waitUntil: 'networkidle',
    timeout: 30000,
  })
  await dismissCookies()
  await page.getByRole('heading', { name: /^Training$/i }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: module.title }).click({ timeout: 15000 })
  await page.locator('iframe[title^="Training preview"]').waitFor({ timeout: 15000 })
  await page.getByText('1 /').first().waitFor({ timeout: 15000 })
}

async function validateBeat(module, beatIndex) {
  const beat = module.beats[beatIndex]
  if (!beat.target) return

  process.stdout.write(`  ${module.id} beat ${beatIndex + 1}: ${beat.title}… `)

  await openModule(module)

  if (beatIndex > 0) {
    await page.getByRole('button', { name: new RegExp(`^Step ${beatIndex + 1}:`, 'i') }).click()
    await page.getByText(`${String(beatIndex + 1).padStart(2, '0')} /`).first().waitFor({ timeout: 15000 })
  }

  await page.locator('iframe[title^="Training preview"]').waitFor({ timeout: 15000 })

  const keys = beat.target.split('|').map((p) => p.trim()).filter(Boolean)

  await page
    .waitForFunction(
      (targetKeys) => {
        const text = document.body.innerText
        if (/couldn't (bring|find) this step|step unavailable/i.test(text)) return true
        const iframe = document.querySelector('iframe[title^="Training preview"]')
        const doc = iframe?.contentDocument
        if (!doc) return false
        const settled = document.querySelector('[data-training-spotlight][data-training-position-settled="1"]')
        if (!settled) return false
        for (const key of targetKeys) {
          const matches = doc.querySelectorAll(`[data-guide="${key}"], [data-training-target="${key}"]`)
          if (matches.length === 1) return true
        }
        return false
      },
      keys,
      { timeout: 60000 },
    )
    .catch(() => {})

  await page.waitForTimeout(400)

  const frame = page.frameLocator('iframe[title^="Training preview"]')
  await frame.locator('text=Loading payment').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {})
  await frame.locator('text=Loading sealed').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {})
  await frame.locator('text=Loading store users').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {})
  await page.locator('[data-training-spotlight][data-training-position-settled="1"]').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(300)

  let resolvedKey = null
  let matchCount = 0

  for (const key of keys) {
    const locator = frame.locator(`[data-guide="${key}"], [data-training-target="${key}"]`)
    matchCount = await locator.count()
    if (matchCount === 1) {
      resolvedKey = key
      break
    }
    if (matchCount > 1) {
      results.push({
        module: module.id,
        beat: beatIndex + 1,
        title: beat.title,
        target: beat.target,
        status: 'FAIL',
        reason: `Ambiguous: ${matchCount} matches for "${key}"`,
      })
      console.log('FAIL')
      return
    }
  }

  if (!resolvedKey) {
    results.push({
      module: module.id,
      beat: beatIndex + 1,
      title: beat.title,
      target: beat.target,
      status: 'FAIL',
      reason: `Missing data-guide for: ${keys.join(' | ')}`,
    })
    console.log('FAIL')
    return
  }

  const validationPass = !(await page.getByText(/couldn't bring this step|couldn't find this step/i).count())
  if (!validationPass) {
    const reason =
      (await page.getByText(/couldn't bring this step|couldn't find this step/i).first().textContent().catch(() => null)) ??
      'Target did not become ready'
    results.push({
      module: module.id,
      beat: beatIndex + 1,
      title: beat.title,
      target: beat.target,
      status: 'FAIL',
      reason: reason?.trim() || 'App target validation did not PASS',
    })
    console.log('FAIL')
    return
  }

  await page.waitForFunction(
    () => document.querySelector('[data-training-spotlight][data-training-position-settled="1"]') != null,
    { timeout: 12000 },
  ).catch(() => {})
  await page.waitForTimeout(600)

  const driftCheck = await page.evaluate((key) => {
    const iframe = document.querySelector('iframe[title^="Training preview"]')
    const container = iframe?.parentElement
    const ring = document.querySelector('[data-training-spotlight]')
    if (!iframe || !container || !ring) return { ok: false, reason: 'No iframe or spotlight' }
    const doc = iframe.contentDocument
    if (!doc) return { ok: false, reason: 'No iframe document' }
    const target = doc.querySelector(`[data-guide="${key}"], [data-training-target="${key}"]`)
    if (!target) return { ok: false, reason: 'Target not in iframe' }
    const iframeRect = iframe.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const scaleX = iframeRect.width / 1280
    const scaleY = iframeRect.height / 800
    const targetRect = target.getBoundingClientRect()
    const expectedX = targetRect.left * scaleX + (iframeRect.left - containerRect.left)
    const expectedY = targetRect.top * scaleY + (iframeRect.top - containerRect.top)
    const expectedW = targetRect.width * scaleX
    const expectedH = targetRect.height * scaleY
    const ringX = Number.parseFloat(ring.style.left || '0')
    const ringY = Number.parseFloat(ring.style.top || '0')
    const ringW = Number.parseFloat(ring.style.width || '0')
    const ringH = Number.parseFloat(ring.style.height || '0')
    const dx = Math.abs(ringX - expectedX)
    const dy = Math.abs(ringY - expectedY)
    const dw = Math.abs(ringW - expectedW)
    const dh = Math.abs(ringH - expectedH)
    const tol = 8
    const drift = dx > tol || dy > tol || dw > tol || dh > tol
    return {
      ok: !drift,
      reason: drift ? `Highlight drift: dx=${Math.round(dx)} dy=${Math.round(dy)} dw=${Math.round(dw)} dh=${Math.round(dh)}` : null,
    }
  }, resolvedKey)

  results.push({
    module: module.id,
    beat: beatIndex + 1,
    title: beat.title,
    target: beat.target,
    status: driftCheck.ok ? 'PASS' : 'FAIL',
    reason: driftCheck.ok ? undefined : driftCheck.reason ?? 'Alignment check failed',
  })
  console.log(driftCheck.ok ? 'PASS' : 'FAIL')
}

console.log(`Validating ${modules.length} module(s)…`)

for (const module of modules) {
  console.log(`\n${module.title}`)
  for (let i = 0; i < module.beats.length; i++) {
    const beat = module.beats[i]
    if (!beat.target) continue
    try {
      await validateBeat(module, i)
    } catch (err) {
      console.log('FAIL')
      results.push({
        module: module.id,
        beat: i + 1,
        title: beat.title,
        target: beat.target,
        status: 'FAIL',
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

const passed = results.filter((r) => r.status === 'PASS')
const failed = results.filter((r) => r.status === 'FAIL')

console.log(`\nTraining target validation: ${passed.length} PASS, ${failed.length} FAIL (${results.length} beats)\n`)

for (const row of failed) {
  console.log(`FAIL  ${row.module} beat ${row.beat}: ${row.title}`)
  console.log(`      target: ${row.target}`)
  console.log(`      reason: ${row.reason}\n`)
}

if (failed.length) {
  await browser.close()
  process.exit(1)
}

console.log('All pointer-bearing beats validated.')
await browser.close()
