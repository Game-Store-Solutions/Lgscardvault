/**
 * Pre-generate Kokoro WAV clips using Chrome WASM (same engine as the live app).
 *
 *   cd frontend && npm run training:audio
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDir = path.resolve(__dirname, '../..')
const outRoot = path.join(frontendDir, 'public', 'training', 'audio')

const modulesUrl = pathToFileURL(
  path.join(frontendDir, 'src', 'pages', 'store-admin', 'training', 'modules.ts'),
).href

const { TRAINING_MODULES } = await import(modulesUrl)

const BASE = process.env.TRAINING_BASE ?? 'http://localhost:5174'

function floatToWavBase64(samples, sampleRate) {
  const bytesPerSample = 2
  const buffer = Buffer.alloc(44 + samples.length * bytesPerSample)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * bytesPerSample, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  buffer.writeUInt16LE(bytesPerSample, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * bytesPerSample, 40)
  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset)
    offset += 2
  }
  return buffer.toString('base64')
}

async function main() {
  const filter = process.argv[2]
  const modules = filter ? TRAINING_MODULES.filter((m) => m.id === filter) : TRAINING_MODULES
  if (!modules.length) {
    console.error('No modules matched', filter)
    process.exit(1)
  }

  console.log(`Opening ${BASE} for Kokoro WASM synthesis…`)
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  await page.goto(`${BASE}/training/_generate-audio.html`, { waitUntil: 'load', timeout: 120000 })

  console.log('Loading Kokoro model in Chrome (~80MB first run)…')
  await page.evaluate(async () => {
    await globalThis.__loadKokoro()
  })

  let total = 0
  console.log('Synthesizing…')

  for (const module of modules) {
    const dir = path.join(outRoot, module.id)
    await mkdir(dir, { recursive: true })

    for (let i = 0; i < module.beats.length; i += 1) {
      const text = module.beats[i].narration
      const file = path.join(dir, `${String(i + 1).padStart(2, '0')}.wav`)
      process.stdout.write(`${module.id} #${i + 1} … `)

      const payload = await page.evaluate(async (line) => globalThis.__synthesize(line), text)

      const b64 = floatToWavBase64(payload.samples, payload.rate)
      const buf = Buffer.from(b64, 'base64')
      await writeFile(file, buf)
      total += 1
      console.log(`${buf.length} bytes`)
    }
  }

  await browser.close()
  console.log(`Done — ${total} clips → frontend/public/training/audio/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
