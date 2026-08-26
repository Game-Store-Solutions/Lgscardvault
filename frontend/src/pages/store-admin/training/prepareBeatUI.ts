import type { TrainingBeat, TrainingBeatPrepare, TrainingDemo } from './types'
import { bringTargetIntoView, findGuideElement } from './trainingTargetUtils'
import { setTrainingPrepareActive } from './trainingSafeMode'
import { waitForTrainingState } from './trainingWaitFor'

export interface BeatUIPrep {

  target: string

  prepare?: TrainingBeatPrepare

  demo?: TrainingDemo

}



const BLOCKED_CLICK_GUIDES = new Set([

  'Connect Square',

  'Reconnect',

  'Import',

  'Add case',

  'Add',

  'Add to board',

  'Save rates',

  'Save events & board',

  'Save events',

  'Save spotlight',

  'Mark delivered',

  'Accept order',

  'Ready for pickup',

])



function guideKeys(target: string): string[] {

  return target.split('|').map((part) => part.trim()).filter(Boolean)

}



function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {

  const proto =

    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype

  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set

  if (setter) setter.call(el, value)

  else el.value = value

  el.dispatchEvent(new Event('input', { bubbles: true }))

  el.dispatchEvent(new Event('change', { bubbles: true }))

}



async function safeTrainingClick(doc: Document, target: string): Promise<boolean> {

  for (const key of guideKeys(target)) {

    const el = findGuideElement(doc, key)

    if (!el) continue

    if (BLOCKED_CLICK_GUIDES.has(key)) return false



    const clickEl =

      el.matches('button, a, input[type="button"], [role="button"], [role="tab"], [role="link"]')

        ? el

        : el.querySelector('button, a, [role="button"], [role="tab"]') ??

          el.parentElement?.querySelector('button[aria-expanded]')



    if (clickEl instanceof HTMLElement) {
      bringTargetIntoView(doc, clickEl)
      if (key === 'trade-rates' || key === 'buy-list' || key === 'sell-submissions') {
        doc.dispatchEvent(new CustomEvent('training:open-accordion', { detail: { id: key } }))
        await new Promise((r) => window.setTimeout(r, 420))
        return true
      }
      if (key === 'Search catalog') {
        doc.dispatchEvent(new CustomEvent('training:search-catalog'))
        return true
      }
      if (key === 'Lightning Bolt') {
        doc.dispatchEvent(new CustomEvent('training:select-catalog-card', { detail: { name: key } }))
        await new Promise((r) => window.setTimeout(r, 360))
        return true
      }
      if (key === 'Singles') {
        clickEl.click()
        doc.dispatchEvent(new Event('training:seed-import'))
        await new Promise((r) => window.setTimeout(r, 520))
        return true
      }
      clickEl.click()
      return true
    }

  }

  return false

}



function fillGuideField(doc: Document, guideKey: string, value: string): void {

  const field = findGuideElement(doc, guideKey)

  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {

    field.focus({ preventScroll: true })

    setNativeValue(field, value)

    doc.dispatchEvent(new CustomEvent('training:fill-guide', { detail: { guide: guideKey, value } }))

    return

  }

  const nested =

    field?.querySelector('input, textarea') ??

    field?.closest('label')?.querySelector('input, textarea')

  if (nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement) {

    nested.focus({ preventScroll: true })

    setNativeValue(nested, value)

    doc.dispatchEvent(new CustomEvent('training:fill-guide', { detail: { guide: guideKey, value } }))

  }

}



async function selectFirstGamePillWhenReady(doc: Document, selectorLabel: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 10_000) {
    const group = findGuideElement(doc, selectorLabel)
    const pill = group?.querySelector('button')
    if (pill instanceof HTMLButtonElement) {
      pill.click()
      await new Promise((r) => window.setTimeout(r, 120))
      return
    }
    await new Promise((r) => window.setTimeout(r, 80))
  }
}

function accordionToggle(doc: Document, panelId: string): HTMLButtonElement | null {

  const header = findGuideElement(doc, panelId)

  if (!header) return null

  const row = header.parentElement

  const toggle =

    (header.matches('button[aria-expanded]')

      ? header

      : row?.querySelector('button[aria-expanded]')) ??

    header.querySelector('button[aria-expanded]')

  return toggle instanceof HTMLButtonElement ? toggle : null

}



function openAccordionPanel(doc: Document, panelId: string): void {

  const toggle = accordionToggle(doc, panelId)

  if (!toggle) return

  if (toggle.getAttribute('aria-expanded') === 'false') {

    bringTargetIntoView(doc, toggle)

    toggle.click()

  }

}



async function ensureAccordionOpen(doc: Document, panelId: string): Promise<void> {
  doc.dispatchEvent(new CustomEvent('training:open-accordion', { detail: { id: panelId } }))
  openAccordionPanel(doc, panelId)
  await waitForTrainingState(doc, { expanded: panelId }, 4000)
}



async function applyFill(

  doc: Document,

  beat: BeatUIPrep | TrainingBeat,

  fill: string | undefined,

  fillTarget: string | undefined,

): Promise<void> {

  if (!fill) return

  fillGuideField(doc, fillTarget ?? beat.target, fill)
  if ((fillTarget ?? beat.target) === 'Card name') {
    doc.dispatchEvent(new CustomEvent('training:fill-card-name', { detail: { value: fill } }))
  }
  await new Promise((r) => window.setTimeout(r, 120))
  await waitForTrainingState(doc, { targetGone: 'Loading' }, 400)

}



/** Safe UI prep: open panels/tabs, demo fills — never persist or connect integrations. */

export async function prepareBeatUI(doc: Document, beat: BeatUIPrep | TrainingBeat): Promise<void> {
  setTrainingPrepareActive(doc, true)
  try {

  if (beat.prepare?.openPanel) {

    const panel = findGuideElement(doc, beat.prepare.openPanel)

    panel?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })

    panel?.classList.add('training-demo-focus')

  }



  if (beat.prepare?.openTab) {

    const tab = findGuideElement(doc, beat.prepare.openTab)

    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })

    await safeTrainingClick(doc, beat.prepare.openTab)

    doc.dispatchEvent(new CustomEvent('training:open-tab', { detail: { label: beat.prepare.openTab } }))

    await new Promise((r) => window.setTimeout(r, 680))

    tab?.classList.add('training-demo-focus')

  }



  if (beat.prepare?.selectGuide) {
    doc.dispatchEvent(new CustomEvent('training:select-catalog-card', { detail: { name: beat.prepare.selectGuide } }))
    await new Promise((r) => window.setTimeout(r, 420))
  }



  if (beat.prepare?.selectFirstGame) {
    await selectFirstGamePillWhenReady(doc, beat.prepare.selectFirstGame)
  }

  const importStepTargets = new Set(['Upload', 'Preview', 'Import'])
  if (beat.prepare?.waitFor?.target && importStepTargets.has(beat.prepare.waitFor.target)) {
    doc.dispatchEvent(new Event('training:seed-import'))
    await new Promise((r) => window.setTimeout(r, 360))
  }



  if (beat.prepare?.openAccordion) {

    await ensureAccordionOpen(doc, beat.prepare.openAccordion)

  }



  await applyFill(doc, beat, beat.prepare?.fill, beat.prepare?.fillTarget)

  if (beat.prepare?.fill && (beat.prepare.fillTarget ?? beat.target)) {
    await new Promise((r) => window.setTimeout(r, 280))
  }

  if (beat.prepare?.thenClick) {
    await safeTrainingClick(doc, beat.prepare.thenClick)
    await new Promise((r) => window.setTimeout(r, 320))
  }

  await waitForTrainingState(doc, beat.prepare?.waitFor, 16_000)

  const revealTarget = beat.prepare?.waitFor?.target
  if (revealTarget) {
    const el = findGuideElement(doc, revealTarget)
    if (el) {
      bringTargetIntoView(doc, el)
      await new Promise((r) => window.setTimeout(r, 240))
    }
  }



  await applyFill(doc, beat, beat.demo?.fill, beat.demo?.fillTarget)

  if (beat.demo?.thenClick) {
    if (beat.demo.thenClick === 'Search catalog') {
      await new Promise((r) => window.setTimeout(r, 400))
    }
    await safeTrainingClick(doc, beat.demo.thenClick)
    await new Promise((r) => window.setTimeout(r, 320))
  }

  await waitForTrainingState(doc, beat.demo?.waitFor, 20_000)
  } finally {
    setTrainingPrepareActive(doc, false)
  }
}



/** Run prepare/demo for beats 0…index so seek-to-step restores required UI state. */

export async function prepareBeatChain(doc: Document, beats: TrainingBeat[], upToIndex: number): Promise<void> {

  const last = Math.max(0, Math.min(upToIndex, beats.length - 1))

  for (let i = 0; i <= last; i++) {

    await prepareBeatUI(doc, beats[i]!)

  }

}



export function clearBeatHighlights(doc: Document): void {

  doc.querySelectorAll('.training-guide-highlight, .training-demo-focus').forEach((node) => {

    if (node instanceof HTMLElement) {

      node.classList.remove('training-guide-highlight', 'training-demo-focus')

      node.style.outline = ''

      node.style.outlineOffset = ''

      node.style.borderRadius = ''

    }

  })

}


