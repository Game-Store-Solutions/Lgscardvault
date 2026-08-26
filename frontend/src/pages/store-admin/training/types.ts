export type TrainingCategory = 'start' | 'inventory' | 'sales' | 'storefront'

export type CalloutPlace = 'left' | 'right' | 'top' | 'bottom'

/** How the learner may interact with the live iframe during a beat. */
export type TrainingInteractionMode = 'locked' | 'target-only' | 'free'

/** Whether Training demonstrates or waits for learner practice. */
export type BeatKind = 'demonstration' | 'practice'

/** How the walkthrough viewport should behave when a beat activates. */
export type BeatFocus = 'target' | 'target-if-needed' | 'current' | 'panel'

/** What advances the beat — informational vs interactive. */
export type BeatCompletion = 'narration' | 'continue' | 'target-click'

/** Percentages of the screenshot (0–100). */
export interface TrainingCallout {
  x: number
  y: number
  label: string
  place?: CalloutPlace
}

/** Optional dimmed cutout around the control being taught. */
export interface TrainingSpotlight {
  x: number
  y: number
  w: number
  h: number
}

export interface TrainingWaitFor {
  /** Guide key that must resolve before continuing. */
  target?: string
  /** Guide key that must disappear (e.g. loading state). */
  targetGone?: string
  /** Loading label text that must leave the document. */
  loadingGone?: string
  /** Accordion / panel id that must be expanded. */
  expanded?: string
  /** Tab guide key that must be present (panel open). */
  tab?: string
}

export interface TrainingDemo {
  /** Type into the targeted field (does not submit a form). */
  fill?: string
  /** Fill a different guide target than the beat target. */
  fillTarget?: string
  /** After fill, click this guide target (safe training clicks only). */
  thenClick?: string
  /** Wait for UI preconditions after demo actions. */
  waitFor?: TrainingWaitFor
}

export interface TrainingBeatPrepare {
  /** Highlight / scroll to a panel control before focusing the beat target. */
  openPanel?: string
  /** Highlight / scroll to a tab before focusing the beat target. */
  openTab?: string
  /** Click the first game pill in a GameSelector with this label / data-guide. */
  selectFirstGame?: string
  /** Open a collapsed accordion panel by its data-guide id. */
  openAccordion?: string
  /** Safe demo fill before resolving the beat target. */
  fill?: string
  fillTarget?: string
  /** Select a catalog result card by its data-guide name (training fixture safe). */
  selectGuide?: string
  /** Click a guide target during prepare (safe training clicks only). */
  thenClick?: string
  /** Wait for UI preconditions after prepare actions. */
  waitFor?: TrainingWaitFor
}

export interface TrainingBeat {
  title: string
  /** Spoken by the in-browser narrator. Write it the way a trainer would say it. */
  narration: string
  /** Live page after /s/{slug}. `/` is the public storefront. */
  href: string
  hrefLabel?: string
  /** Per-beat screen recording (overrides module walkthrough). */
  video?: string
  /** Pre-generated Kokoro clip — auto path if omitted. */
  audio?: string
  /** Semantic target id — must match exactly one `[data-guide]` / `[data-training-target]` in the live UI. */
  target: string
  /** Scroll this element into view before highlighting (defaults to target). */
  scrollTarget?: string
  /** Element to highlight (defaults to target). */
  spotlightTarget?: string
  /** Element to anchor the instruction card (defaults to spotlight). */
  tooltipTarget?: string
  /** Optional strict label check during target validation. */
  expectedLabel?: string
  /** Optional strict ARIA role check during target validation. */
  expectedRole?: string
  callout?: string
  /** Hint for instruction-box placement; runtime may adjust to avoid covering the target. */
  place?: CalloutPlace
  /** Viewport behavior when this beat activates. Default: target-if-needed. */
  focus?: BeatFocus
  /** How the beat completes. Default: narration (auto-advance when voice finishes). */
  completion?: BeatCompletion
  /** Demonstration (watch) vs practice (learner performs). */
  kind?: BeatKind
  /** Override iframe interaction lock for this beat. */
  interactionMode?: TrainingInteractionMode
  /** Optional post-click verification — element must be visible before advancing. */
  verifyTarget?: string
  /** UI state to establish before resolving the target. */
  prepare?: TrainingBeatPrepare
  demo?: TrainingDemo
  /** Optional fallback screenshot — live iframe is primary. */
  image?: string
  imageAlt?: string
}

export interface TrainingModule {
  id: string
  title: string
  summary: string
  minutes: number
  category: TrainingCategory
  beats: TrainingBeat[]
  /** One continuous screen recording for the whole module. */
  walkthroughVideo?: string
  /** Start time in seconds for each beat index in walkthroughVideo. */
  videoChapters?: number[]
}
