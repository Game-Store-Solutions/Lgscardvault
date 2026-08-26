import { lookupTrainingTarget } from './resolveTrainingTarget'
import { findGuideElement } from './trainingTargetUtils'
import type { TrainingWaitFor } from './types'

const DEFAULT_BUDGET_MS = 10_000
const POLL_MS = 80

function isExpanded(doc: Document, panelId: string): boolean {
  const header = findGuideElement(doc, panelId)
  if (!header) return false
  const toggle =
    header.matches('button[aria-expanded]')
      ? header
      : header.parentElement?.querySelector('button[aria-expanded]')
  return toggle?.getAttribute('aria-expanded') === 'true'
}

function loadingVisible(doc: Document, text: string): boolean {
  const needle = text.toLowerCase()
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const value = node.textContent?.trim().toLowerCase() ?? ''
    if (value.includes(needle)) return true
  }
  return false
}

function targetReady(doc: Document, target: string): boolean {
  return lookupTrainingTarget(doc, target) != null
}

export async function waitForTrainingState(
  doc: Document,
  condition: TrainingWaitFor | undefined,
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<boolean> {
  if (!condition) return true
  const started = Date.now()

  while (Date.now() - started < budgetMs) {
    let ready = true

    if (condition.target && !targetReady(doc, condition.target)) ready = false
    if (condition.targetGone && targetReady(doc, condition.targetGone)) ready = false
    if (condition.loadingGone && loadingVisible(doc, condition.loadingGone)) ready = false
    if (condition.expanded && !isExpanded(doc, condition.expanded)) ready = false
    if (condition.tab && !targetReady(doc, condition.tab)) ready = false

    if (ready) return true
    await new Promise((r) => window.setTimeout(r, POLL_MS))
  }

  return false
}
