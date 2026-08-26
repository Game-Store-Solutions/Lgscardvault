/** @deprecated Import from prepareBeatUI / trainingTargetUtils directly. */
export { clearBeatHighlights, prepareBeatUI } from './prepareBeatUI'
export { bringTargetIntoView as scrollBeatTargetInIframe } from './trainingTargetUtils'

import type { TrainingBeat } from './types'
import { prepareBeatUI } from './prepareBeatUI'
import { bringTargetIntoView, findGuideElement } from './trainingTargetUtils'

/** @deprecated Pipeline now runs via useLiveTarget — kept for iframe onLoad. */
export function applyBeatDemo(doc: Document, beat: TrainingBeat): void {
  prepareBeatUI(doc, beat)
  const target = findGuideElement(doc, beat.target)
  if (target) bringTargetIntoView(doc, target)
  if (target) {
    target.classList.add('training-guide-highlight')
    target.style.outline = '3px solid rgb(99 102 241)'
    target.style.outlineOffset = '3px'
    target.style.borderRadius = '6px'
  }
}
