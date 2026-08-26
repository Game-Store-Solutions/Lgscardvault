type KokoroModule = {
  KokoroTTS: {
    from_pretrained: (
      id: string,
      options: {
        dtype?: string
        device?: string
        progress_callback?: (info: { status?: string; loaded?: number; total?: number; progress?: number }) => void
      },
    ) => Promise<KokoroInstance>
  }
}

type KokoroInstance = {
  generate: (text: string, options: { voice?: string; speed?: number }) => Promise<RawAudio>
}

type RawAudio = {
  audio: Float32Array
  sampling_rate: number
  toBlob?: () => Blob
}

let instance: KokoroInstance | null = null
let loading: Promise<KokoroInstance> | null = null

export type VoiceStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export async function loadKokoro(onProgress?: (percent: number) => void): Promise<KokoroInstance> {
  if (instance) return instance
  if (loading) return loading

  loading = (async () => {
    const mod = (await import('kokoro-js')) as KokoroModule
    const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (info) => {
        if (!onProgress) return
        if (typeof info.progress === 'number') {
          onProgress(Math.round(info.progress))
          return
        }
        if (info.loaded && info.total) {
          onProgress(Math.round((info.loaded / info.total) * 100))
        }
      },
    })
    instance = tts
    return tts
  })()

  try {
    return await loading
  } catch (error) {
    loading = null
    throw error
  }
}

export function floatToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
