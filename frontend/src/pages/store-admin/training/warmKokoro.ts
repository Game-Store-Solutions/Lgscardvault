import { loadKokoro, floatToWavBlob } from './kokoroEngine'
import { readCachedAudio, writeCachedAudio } from './audioCache'
import type { TrainingModule } from './types'

const VOICE = 'af_heart'
const SPEED = 0.94

let warmPromise: Promise<void> | null = null
let ready = false
let progress = 0
const listeners = new Set<(percent: number, isReady: boolean) => void>()

function notify() {
  for (const fn of listeners) fn(progress, ready)
}

export function subscribeKokoroWarm(onChange: (percent: number, isReady: boolean) => void): () => void {
  listeners.add(onChange)
  onChange(progress, ready)
  return () => listeners.delete(onChange)
}

export function isKokoroReady(): boolean {
  return ready
}

/** Start downloading Kokoro as soon as the Training hub opens — not when a lesson starts. */
export function warmKokoro(): Promise<void> {
  if (ready) return Promise.resolve()
  if (warmPromise) return warmPromise
  warmPromise = loadKokoro((pct) => {
    progress = pct
    notify()
  })
    .then(() => {
      ready = true
      progress = 100
      notify()
    })
    .catch(() => {
      warmPromise = null
      notify()
    })
  return warmPromise
}

async function synthesize(text: string): Promise<Blob | null> {
  const cached = await readCachedAudio(text)
  if (cached) return cached
  try {
    const tts = await loadKokoro()
    const raw = await tts.generate(text, { voice: VOICE, speed: SPEED })
    const blob = raw.toBlob?.() ?? floatToWavBlob(raw.audio, raw.sampling_rate)
    await writeCachedAudio(text, blob)
    return blob
  } catch {
    return null
  }
}

const urlCache = new Map<string, string>()

export async function kokoroAudioUrl(text: string): Promise<string | null> {
  const hit = urlCache.get(text)
  if (hit) return hit
  const blob = await synthesize(text)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  urlCache.set(text, url)
  return url
}

/** After the model is warm, pre-render clips during idle time so beats play instantly. */
export function prefetchModuleVoice(module: TrainingModule): void {
  void warmKokoro().then(async () => {
    for (const beat of module.beats) {
      await new Promise<void>((resolve) => {
        const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 40))
        idle(() => {
          void kokoroAudioUrl(beat.narration).finally(resolve)
        })
      })
    }
  })
}
