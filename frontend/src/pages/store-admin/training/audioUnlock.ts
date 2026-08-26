/** Unlock HTMLAudioElement playback after a user gesture (browser autoplay policy). */
let unlocked = false
let pending: Promise<void> | null = null

export function isTrainingAudioUnlocked(): boolean {
  return unlocked
}

/** Call on the first Training interaction (open module, Next, Play, etc.). */
export function unlockTrainingAudio(): Promise<void> {
  if (unlocked) return Promise.resolve()
  if (pending) return pending

  pending = (async () => {
    try {
      const audio = new Audio('/training/audio/see-your-shop/01.wav')
      audio.volume = 0.001
      await audio.play()
      audio.pause()
      audio.currentTime = 0
      unlocked = true
    } catch {
      /* Browser may still block until a louder interaction — narrator falls back to TTS. */
    }
  })()

  return pending
}

export function unlockSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  window.speechSynthesis.speak(u)
  window.speechSynthesis.cancel()
}

/** One call unlocks both WAV playback and speech synthesis. */
export function unlockTrainingVoice(): void {
  unlockSpeech()
  void unlockTrainingAudio()
}
