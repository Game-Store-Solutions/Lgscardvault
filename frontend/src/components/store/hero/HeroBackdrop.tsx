import type { CSSProperties } from 'react'
import { cx } from '../../../lib/cx'
import {
  HERO_BANNER_PHOTO_CLASS,
  HERO_IMAGE_POSITION_DEFAULT,
  clampHeroImageOpacity,
  clampHeroImagePosition,
  heroImagePhotoStyle,
} from '../../../lib/heroImageOpacity'
import { layoutUsesHeroPhotoBackground } from './heroLayouts'

export { layoutUsesHeroPhotoBackground } from './heroLayouts'

export function HeroPhotoBackgroundLayer({
  heroImageUrl,
  hasImage,
  primary,
  imageClassName,
  imageOpacity = 100,
  imagePositionX = HERO_IMAGE_POSITION_DEFAULT,
  imagePositionY = HERO_IMAGE_POSITION_DEFAULT,
  imagePositionMobileX,
  imagePositionMobileY,
  blur = false,
}: {
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
  imageClassName?: string
  imageOpacity?: number
  imagePositionX?: number
  imagePositionY?: number
  imagePositionMobileX?: number | null
  imagePositionMobileY?: number | null
  blur?: boolean
}) {
  if (!hasImage || !heroImageUrl?.trim()) {
    return <div aria-hidden className="absolute inset-0 -z-20" style={{ backgroundColor: primary }} />
  }

  return (
    <>
      <div aria-hidden className="absolute inset-0 -z-[21] bg-bg" />
      <img
        src={heroImageUrl}
        alt=""
        aria-hidden
        decoding="async"
        fetchPriority="high"
        sizes="100vw"
        className={cx(
          'absolute inset-0 -z-20 size-full',
          HERO_BANNER_PHOTO_CLASS,
          blur && 'scale-105 blur-md',
          imageClassName,
        )}
        style={
          heroImagePhotoStyle(
            clampHeroImageOpacity(imageOpacity),
            clampHeroImagePosition(imagePositionX),
            clampHeroImagePosition(imagePositionY),
            imagePositionMobileX,
            imagePositionMobileY,
          ) as CSSProperties
        }
      />
    </>
  )
}

/** Optional full-bleed hero photo when the layout supports it. */
export function HeroOptionalPhoto({
  layout,
  heroImageUrl,
  hasImage,
  primary,
  imageOpacity = 100,
  imagePositionX = HERO_IMAGE_POSITION_DEFAULT,
  imagePositionY = HERO_IMAGE_POSITION_DEFAULT,
  imagePositionMobileX,
  imagePositionMobileY,
}: {
  layout?: import('../../../api/types').HeroLayout | null
  heroImageUrl?: string | null
  hasImage: boolean
  primary: string
  imageOpacity?: number
  imagePositionX?: number
  imagePositionY?: number
  imagePositionMobileX?: number | null
  imagePositionMobileY?: number | null
}) {
  if (!layoutUsesHeroPhotoBackground(layout)) return null
  return (
    <HeroPhotoBackgroundLayer
      heroImageUrl={heroImageUrl}
      hasImage={hasImage}
      primary={primary}
      imageOpacity={imageOpacity}
      imagePositionX={imagePositionX}
      imagePositionY={imagePositionY}
      imagePositionMobileX={imagePositionMobileX}
      imagePositionMobileY={imagePositionMobileY}
    />
  )
}
