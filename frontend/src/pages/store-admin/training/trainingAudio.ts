/** Pre-generated Kokoro clips — run `.tools/playwright/generate-training-audio.mjs` to refresh. */
export function beatAudioPath(moduleId: string, beatIndex: number): string {
  return `/training/audio/${moduleId}/${String(beatIndex + 1).padStart(2, '0')}.wav`
}

export function beatImagePath(moduleId: string, beatIndex: number): string {
  return `/training/beats/${moduleId}/${String(beatIndex + 1).padStart(2, '0')}.png`
}

export function moduleVideoPath(moduleId: string): string {
  return `/training/${moduleId}.webm`
}
