import { useEffect, useRef } from 'react'
import { useStore, useIsDarkTheme } from '../../../hooks'
import {
  resolveActiveBackgroundPreset,
  resolvePatternColorsForRender,
  resolvePageBackgrounds,
} from '../../../lib/pageBackgrounds'
import { PageBackgroundLayer } from './PageBackgroundLayer'

export function StorefrontBackground({ slug }: { slug?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { data: store } = useStore(slug)
  const isDark = useIsDarkTheme()
  const settings = resolvePageBackgrounds(store?.pageBackgrounds)
  const preset = resolveActiveBackgroundPreset(settings, isDark)
  const patternColors = resolvePatternColorsForRender(settings, isDark)

  useEffect(() => {
    const themeRoot = hostRef.current?.closest('.store-theme')
    if (!themeRoot) return
    themeRoot.setAttribute('data-page-background', preset)
    return () => themeRoot.removeAttribute('data-page-background')
  }, [preset])

  return (
    <div ref={hostRef} className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      <div className="absolute inset-0 bg-bg" />
      {preset !== 'none' ? (
        <PageBackgroundLayer
          preset={preset}
          opacity={settings.opacity ?? 72}
          patternColors={patternColors}
        />
      ) : null}
    </div>
  )
}
