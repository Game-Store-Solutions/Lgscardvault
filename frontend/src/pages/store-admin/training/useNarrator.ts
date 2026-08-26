import { useEffect, useRef, useState } from 'react'
import { beatAudioPath } from './trainingAudio'
import { isTrainingAudioUnlocked, unlockTrainingAudio, unlockTrainingVoice } from './audioUnlock'

export type NarratorStatus = 'idle' | 'loading' | 'speaking' | 'browser' | 'unavailable' | 'blocked'

interface Options {
  moduleId: string
  beatIndex: number
  text: string
  enabled: boolean
  /** Called when narration for this beat finishes. Second arg is true only after full WAV/TTS playback. */
  onEnd?: (finishedBeat: number, natural: boolean) => void
}

export function useNarrator({ moduleId, beatIndex, text, enabled, onEnd }: Options) {
  const [status, setStatus] = useState<NarratorStatus>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const onEndRef = useRef(onEnd)
  const generationRef = useRef(0)
  onEndRef.current = onEnd

  useEffect(() => {
    if (!enabled || !text.trim()) {
      setStatus('idle')
      return
    }

    const generation = ++generationRef.current
    const playedBeat = beatIndex
    let finished = false
    const staticSrc = beatAudioPath(moduleId, beatIndex)

    const finish = (natural = false) => {
      if (finished || generation !== generationRef.current) return
      finished = true
      onEndRef.current?.(playedBeat, natural)
    }

    const speakBrowser = () => {
      if (generation !== generationRef.current) return
      if (!window.speechSynthesis) {
        setStatus('unavailable')
        finish(false)
        return
      }
      setStatus('browser')
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.rate = 0.95
      utter.onend = () => finish(true)
      utter.onerror = () => {
        if (import.meta.env.DEV) console.warn('[training] speech synthesis failed')
        finish(false)
      }
      window.speechSynthesis.speak(utter)
    }

    const playFile = async (src: string, retryAfterUnlock = true) => {
      if (generation !== generationRef.current) return

      await unlockTrainingAudio()

      const audio = new Audio(src)
      audioRef.current = audio
      audio.preload = 'auto'

      audio.onended = () => finish(true)
      audio.onerror = () => {
        if (import.meta.env.DEV) console.warn('[training] WAV failed, falling back to browser voice:', src)
        speakBrowser()
      }

      try {
        await audio.play()
        if (generation === generationRef.current) setStatus('speaking')
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[training] audio.play blocked:', err)
        if (retryAfterUnlock && !isTrainingAudioUnlocked()) {
          setStatus('blocked')
          // Wait for a user gesture to unlock, then retry once.
          const onUnlock = () => {
            document.removeEventListener('pointerdown', onUnlock, true)
            if (generation !== generationRef.current) return
            void playFile(src, false)
          }
          document.addEventListener('pointerdown', onUnlock, true)
          return
        }
        if (!isTrainingAudioUnlocked()) setStatus('blocked')
        speakBrowser()
      }
    }

    setStatus('loading')
    void playFile(staticSrc)

    return () => {
      generationRef.current += 1
      audioRef.current?.pause()
      audioRef.current = null
      window.speechSynthesis?.cancel()
      setStatus('idle')
    }
  }, [moduleId, beatIndex, text, enabled])

  return { status }
}

export { unlockTrainingVoice, unlockTrainingVoice as unlockSpeech }
