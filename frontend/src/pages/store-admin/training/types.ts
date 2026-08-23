export type TrainingCategory = 'start' | 'inventory' | 'sales' | 'storefront'

export interface TrainingStep {
  title: string
  body: string
  /** Public file under /training/… or a full URL. */
  image?: string
  imageAlt?: string
  /** YouTube, Vimeo, or a same-origin mp4. */
  videoUrl?: string
  /** Admin or storefront path after /s/{slug} — e.g. /admin/payments or /cart. */
  href?: string
  hrefLabel?: string
}

export interface TrainingModule {
  id: string
  title: string
  summary: string
  minutes: number
  category: TrainingCategory
  steps: TrainingStep[]
}
