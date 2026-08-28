/** Shared layout tokens for public + store deck builder pages. */

export const DECK_BUILDER_PAGE =
  'flex min-h-[calc(100dvh-5rem)] flex-col pb-[max(1rem,env(safe-area-inset-bottom))]'

export const DECK_BUILDER_HEADER =
  'sticky top-0 z-20 border-b border-border/60 bg-bg/85 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8 pt-[max(0.75rem,env(safe-area-inset-top))]'

/** Sticks below the commander header (taller on mobile when search stacks). */
export const DECK_BUILDER_STICKY_TOOLBAR =
  'sticky z-10 mb-5 rounded-card border border-border/80 bg-surface/95 p-3 shadow-sm backdrop-blur-md top-[calc(6.75rem+env(safe-area-inset-top,0px))] lg:top-[calc(4.25rem+env(safe-area-inset-top,0px))]'

export const DECK_BUILDER_LANDING_SHELL =
  'relative mx-auto w-full max-w-5xl px-4 pt-4 sm:px-8 sm:pt-6 lg:px-10'

export const DECK_BUILDER_CONTENT_SHELL =
  'flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:flex-row xl:items-start'

export const DECK_BUILDER_ONBOARDING_SHELL =
  'mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-8 lg:px-10'

/** Matches synergy card cell size without scaling to 10 columns in the narrow sidebar. */
export const COMMANDER_SIDEBAR_CARD_GRID =
  'grid w-full grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2'
