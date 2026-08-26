/** Marks store-mutating controls in the live admin UI. Training must never fire these. */
export const TRAINING_MUTATION_ATTR = 'data-training-mutation'

const MUTATION_SELECTOR = `[${TRAINING_MUTATION_ATTR}]`

/** True when the event target sits on (or inside) a marked mutation control. */
export function isTrainingMutationControl(node: EventTarget | null): boolean {
  if (!node || !(node instanceof Element)) return false
  return node.closest(MUTATION_SELECTOR) != null
}

/** Programmatic training clicks must never hit a marked mutation control. */
export function assertSafeTrainingClick(el: Element | null | undefined): boolean {
  if (!el) return false
  return !el.closest(MUTATION_SELECTOR)
}
