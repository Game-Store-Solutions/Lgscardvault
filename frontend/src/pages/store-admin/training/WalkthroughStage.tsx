import { useEffect, useRef, useState } from 'react'
import type { TrainingBeat, TrainingModule } from './types'
import { beatImagePath, moduleVideoPath } from './trainingAudio'
import { modulePoster } from './modulePosters'
import { getVideoChapters } from './videoChapters'

interface Props {
  module: TrainingModule
  beat: TrainingBeat
  beatIndex: number
}

function chapterSeconds(
  module: TrainingModule,
  beatIndex: number,
  duration: number,
): number {
  const chapters = module.videoChapters
  if (chapters && typeof chapters[beatIndex] === 'number') return chapters[beatIndex]!
  if (duration > 0 && module.beats.length > 1) {
    return (beatIndex / module.beats.length) * duration
  }
  return 0
}

/**
 * Video chapter (always advances per beat) + optional beat screenshot overlay.
 * Even when a PNG is missing or duplicate, the recorded walkthrough still moves.
 */
export default function WalkthroughStage({ module, beat, beatIndex }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [imageOk, setImageOk] = useState(true)
  const [visible, setVisible] = useState(false)

  const imageSrc = beat.image ?? beatImagePath(module.id, beatIndex)
  const videoSrc = beat.video ?? module.walkthroughVideo ?? moduleVideoPath(module.id)
  const poster = modulePoster(module.id)

  const moduleWithChapters = (() => {
    const recorded = getVideoChapters(module.id)
    return recorded?.length ? { ...module, videoChapters: recorded } : module
  })()

  useEffect(() => {
    setImageOk(true)
    setVisible(false)
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [beatIndex, module.id, imageSrc])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const seek = () => {
      v.currentTime = chapterSeconds(moduleWithChapters, beatIndex, v.duration || 0)
      v.pause()
    }

    if (v.readyState >= 1) seek()
    else v.addEventListener('loadedmetadata', seek, { once: true })
  }, [moduleWithChapters, beatIndex, videoSrc])

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-white/10">
      <video
        ref={videoRef}
        key={videoSrc}
        className="absolute inset-0 h-full w-full object-contain object-top"
        src={videoSrc}
        poster={poster}
        playsInline
        muted
        preload="metadata"
      />
      {imageOk && (
        <img
          key={`${module.id}-${beatIndex}`}
          src={`${imageSrc}?b=${beatIndex}`}
          alt={beat.imageAlt ?? beat.title}
          className={`absolute inset-0 h-full w-full object-contain object-top transition-opacity duration-300 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setVisible(true)}
          onError={() => setImageOk(false)}
        />
      )}
    </div>
  )
}
