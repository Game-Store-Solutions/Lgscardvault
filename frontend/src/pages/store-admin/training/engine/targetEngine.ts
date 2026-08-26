import {
  lookupTrainingTarget,
  resolveTrainingTarget,
  type TargetDebugInfo,
  type TargetResolution,
  type TargetResolutionStatus,
} from '../resolveTrainingTarget'
import {
  bringTargetIntoView,
  ensureTrainingScroll,
  guideKeys,
  isTargetCenterInViewport,
  isTargetUsablyVisible,
  waitForLayoutSettle,
} from '../trainingTargetUtils'
import { prepareBeatChain, prepareBeatUI } from '../prepareBeatUI'
import { TARGET_PIPELINE_BUDGET_MS, TARGET_PIPELINE_MAX_PASSES } from '../trainingInteraction'
import type { BeatFocus, TrainingBeat, TrainingBeatPrepare, TrainingDemo } from '../types'
import type { MeasuredTarget } from '../useLiveTarget'
import type { ResolvedTarget, TargetSpec } from './types'

export interface TargetEngineContext {
  doc: Document
  iframe: HTMLIFrameElement
  container: HTMLElement
}

export interface TargetPipelineResult {
  resolved: ResolvedTarget | null
  resolution: TargetResolution
  timedOut: boolean
}

function shouldAutoScroll(focus: BeatFocus): boolean {
  return focus === 'target' || focus === 'target-if-needed' || focus === 'panel'
}

function failDebug(requested: string, reason: string): TargetDebugInfo {
  return {
    requestedTarget: requested,
    resolvedKey: null,
    matchCount: 0,
    tagName: null,
    dataGuide: null,
    accessibleName: null,
    role: null,
    visible: false,
    inViewport: false,
    obscured: false,
    domRect: null,
    overlayRect: null,
    validation: 'FAIL',
    failureReason: reason,
  }
}

function lookupBySpec(doc: Document, specId: string): HTMLElement | null {
  for (const key of guideKeys(specId)) {
    const found = lookupTrainingTarget(doc, key)
    if (found) return found.element
  }
  return null
}

function validateIdentity(
  element: HTMLElement,
  key: string,
  spec: TargetSpec,
  doc: Document,
): string | null {
  const guide = element.getAttribute('data-guide') ?? element.getAttribute('data-training-target')
  if (guide !== key && !spec.id.split('|').some((k) => k.trim() === guide)) {
    return `Identity mismatch: expected "${key}", got "${guide ?? 'none'}"`
  }
  if (spec.expectedRole) {
    const role = element.getAttribute('role') ?? implicitRole(element)
    if (role && spec.expectedRole !== role) {
      return `Role mismatch: expected "${spec.expectedRole}", got "${role}"`
    }
  }
  if (spec.expectedLabel) {
    const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? guide
    if (name && !labelsMatch(spec.expectedLabel, name) && !labelsMatch(spec.expectedLabel, guide ?? '')) {
      return `Label mismatch: expected "${spec.expectedLabel}", found "${name}"`
    }
  }
  void doc
  return null
}

function implicitRole(el: HTMLElement): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag === 'a') return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'input') return 'textbox'
  return null
}

function labelsMatch(expected: string, found: string): boolean {
  const a = expected.toLowerCase().replace(/\s+/g, ' ').trim()
  const b = found.toLowerCase().replace(/\s+/g, ' ').trim()
  return a === b || b.includes(a) || a.includes(b)
}

function userFacingError(status: TargetResolutionStatus, reason: string | null): string {
  if (status === 'missing') return "We couldn't find this step in the live UI. Try again."
  if (status === 'ambiguous') return "This step's target is ambiguous in the UI. Try again."
  if (status === 'offscreen' || status === 'obscured') {
    return "We couldn't bring this step into view. Try again."
  }
  if (status === 'invalid') return reason ?? "This step's target failed validation. Try again."
  return reason ?? "We couldn't prepare this step. Try again."
}

/** Resolve spotlight element and map to overlay rect — no pointer without PASS. */
export function resolveForOverlay(
  ctx: TargetEngineContext,
  spec: TargetSpec,
): TargetResolution & { scrollElement: HTMLElement | null; spotlightElement: HTMLElement | null } {
  const spotlightId = spec.spotlightId ?? spec.id
  const resolution = resolveTrainingTarget(ctx.doc, ctx.iframe, ctx.container, spotlightId)
  const scrollElement = lookupBySpec(ctx.doc, spec.scrollId ?? spec.id)
  const spotlightElement =
    resolution.status === 'validated' && resolution.element
      ? resolution.element
      : lookupBySpec(ctx.doc, spotlightId)

  if (resolution.status === 'validated' && spotlightElement) {
    const key = resolution.key ?? guideKeys(spotlightId)[0] ?? ''
    const identityError = validateIdentity(spotlightElement, key, spec, ctx.doc)
    if (identityError) {
      return {
        ...resolution,
        status: 'invalid',
        element: null,
        rect: null,
        debug: { ...resolution.debug, validation: 'FAIL', failureReason: identityError },
        scrollElement,
        spotlightElement: null,
      }
    }
  }

  return { ...resolution, scrollElement, spotlightElement }
}

function scrollTargetIfNeeded(
  ctx: TargetEngineContext,
  scrollEl: HTMLElement,
  focus: BeatFocus,
  autoScroll: boolean,
): void {
  if (!autoScroll || focus === 'current') return
  if (isTargetCenterInViewport(scrollEl)) return
  bringTargetIntoView(ctx.doc, scrollEl)
}

async function resolveWhenStable(
  ctx: TargetEngineContext,
  spec: TargetSpec,
): Promise<TargetResolution & { scrollElement: HTMLElement | null; spotlightElement: HTMLElement | null }> {
  let lastRect: MeasuredTarget | null = null
  let stable = 0
  let latest = resolveForOverlay(ctx, spec)

  for (let i = 0; i < 6; i++) {
    await waitForLayoutSettle(100)
    latest = resolveForOverlay(ctx, spec)
    if (latest.status === 'validated' && latest.rect) {
      const rect = latest.rect
      if (
        lastRect &&
        Math.abs(lastRect.x - rect.x) < 1.5 &&
        Math.abs(lastRect.y - rect.y) < 1.5 &&
        Math.abs(lastRect.width - rect.width) < 1.5 &&
        Math.abs(lastRect.height - rect.height) < 1.5
      ) {
        stable += 1
        if (stable >= 2) return latest
      } else {
        stable = 0
      }
      lastRect = rect
    }
  }

  return latest
}

export async function focusTargetForBeat(
  ctx: TargetEngineContext,
  spec: TargetSpec,
  focus: BeatFocus,
  prep: { prepare?: TrainingBeatPrepare; demo?: TrainingDemo; target: string },
  onPhase?: (phase: 'preparing' | 'moving-to-target' | 'resolving-target') => void,
  priorBeats: TrainingBeat[] = [],
): Promise<TargetPipelineResult> {
  onPhase?.('preparing')
  ensureTrainingScroll(ctx.doc)
  if (priorBeats.length > 0) {
    await prepareBeatChain(ctx.doc, priorBeats, priorBeats.length - 1)
    await waitForLayoutSettle(200)
  }
  await prepareBeatUI(ctx.doc, prep)
  await waitForLayoutSettle(320)

  const started = Date.now()

  const autoScroll = shouldAutoScroll(focus)
  let lastResolution: TargetResolution = {
    status: 'missing',
    key: null,
    element: null,
    rect: null,
    debug: failDebug(spec.id, 'Target not resolved yet'),
  }

  for (let pass = 0; pass < TARGET_PIPELINE_MAX_PASSES; pass++) {
    if (Date.now() - started > TARGET_PIPELINE_BUDGET_MS) break

    onPhase?.('resolving-target')

    const scrollEl =
      lookupBySpec(ctx.doc, spec.scrollId ?? spec.id) ?? lookupBySpec(ctx.doc, spec.spotlightId ?? spec.id)

    const scrollVisible = scrollEl
      ? isTargetUsablyVisible(scrollEl) || isTargetCenterInViewport(scrollEl)
      : false

    if (scrollEl && autoScroll && focus !== 'current' && !scrollVisible) {
      onPhase?.('moving-to-target')
      bringTargetIntoView(ctx.doc, scrollEl)
      await waitForLayoutSettle(pass < 2 ? 240 : 160)
    }

    if (focus === 'current' && scrollEl && !isTargetUsablyVisible(scrollEl)) {
      const fail = failDebug(spec.id, 'Target is outside viewport (focus: current)')
      return {
        resolved: null,
        timedOut: false,
        resolution: { status: 'offscreen', key: null, element: null, rect: null, debug: fail },
      }
    }

    const result = await resolveWhenStable(ctx, spec)
    lastResolution = result

    if (result.status === 'validated' && result.rect && result.key) {
      const resolved: ResolvedTarget = {
        key: result.key,
        scrollKey: spec.scrollId ?? spec.id,
        spotlightKey: spec.spotlightId ?? spec.id,
        tooltipKey: spec.tooltipId ?? spec.spotlightId ?? spec.id,
        rect: result.rect,
        debug: result.debug,
      }
      return { resolved, resolution: result, timedOut: false }
    }

    const needsScroll =
      autoScroll &&
      scrollEl &&
      (result.status === 'offscreen' ||
        result.status === 'obscured' ||
        !isTargetUsablyVisible(scrollEl))

    if (needsScroll) {
      onPhase?.('moving-to-target')
      scrollTargetIfNeeded(ctx, scrollEl, focus, autoScroll)
      await waitForLayoutSettle(200)
      continue
    }

    if (result.status === 'missing' || result.status === 'ambiguous') {
      await waitForLayoutSettle(220)
      continue
    }

    await waitForLayoutSettle(180)
  }

  const timedOut = Date.now() - started >= TARGET_PIPELINE_BUDGET_MS
  const reason =
    lastResolution.debug.failureReason ??
    (timedOut ? 'Target resolution timed out' : 'Target could not be validated')

  return {
    resolved: null,
    timedOut,
    resolution: {
      ...lastResolution,
      status: lastResolution.status === 'validated' ? 'missing' : lastResolution.status,
      debug: {
        ...lastResolution.debug,
        validation: 'FAIL',
        failureReason: reason,
      },
    },
  }
}

export function remeasureResolved(ctx: TargetEngineContext, spec: TargetSpec): MeasuredTarget | null {
  const result = resolveForOverlay(ctx, spec)
  return result.status === 'validated' ? result.rect : null
}

export function formatTargetError(resolution: TargetResolution, timedOut: boolean): string {
  const reason = resolution.debug.failureReason
  if (timedOut) return "We couldn't bring this step into view. Try again."
  return userFacingError(resolution.status, reason)
}
