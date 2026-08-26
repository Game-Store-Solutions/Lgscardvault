import type { TargetDebugInfo } from './resolveTrainingTarget'
import type { TargetMeasureState } from './useLiveTarget'

interface Props {
  beatKey: string
  callout: string
  state: TargetMeasureState
  debug: TargetDebugInfo | null
  enginePhase?: string
}

/** Development overlay — toggle with localStorage `training-debug=1` in dev builds. */
export default function TargetDebugPanel({ beatKey, callout, state, debug, enginePhase }: Props) {
  const enabled =
    import.meta.env.DEV &&
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('training-debug') === '1'

  if (!enabled || !debug) return null

  const pass = debug.validation === 'PASS' && state === 'validated'

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-30 max-w-xs rounded-btn border border-border bg-surface/95 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-fg shadow-card backdrop-blur-sm">
      <p className="font-bold text-brand-600">Target debug · {beatKey}</p>
      <dl className="mt-1 space-y-0.5">
        <Row label="Callout" value={callout} />
        <Row label="Lesson target" value={debug.requestedTarget} />
        <Row label="Resolved key" value={debug.resolvedKey ?? '—'} />
        <Row label="Matches" value={String(debug.matchCount)} />
        <Row label="Element" value={debug.tagName ? `<${debug.tagName}>` : '—'} />
        <Row label="data-guide" value={debug.dataGuide ?? '—'} />
        <Row label="Accessible name" value={debug.accessibleName ?? '—'} />
        <Row label="Role" value={debug.role ?? '—'} />
        <Row
          label="DOM rect"
          value={
            debug.domRect
              ? `${Math.round(debug.domRect.x)},${Math.round(debug.domRect.y)} ${Math.round(debug.domRect.width)}×${Math.round(debug.domRect.height)}`
              : '—'
          }
        />
        <Row
          label="Overlay rect"
          value={
            debug.overlayRect
              ? `${Math.round(debug.overlayRect.x)},${Math.round(debug.overlayRect.y)} ${Math.round(debug.overlayRect.width)}×${Math.round(debug.overlayRect.height)}`
              : '—'
          }
        />
        <Row label="Visible" value={debug.visible ? 'yes' : 'no'} />
        <Row label="In viewport" value={debug.inViewport ? 'yes' : 'no'} />
        <Row label="Obscured" value={debug.obscured ? 'yes' : 'no'} />
        <Row label="State" value={state} />
        {enginePhase ? <Row label="Engine" value={enginePhase} /> : null}
        <Row label="Validation" value={pass ? 'PASS' : 'FAIL'} tone={pass ? 'pass' : 'fail'} />
        {!pass && debug.failureReason ? (
          <Row label="Reason" value={debug.failureReason} tone="fail" />
        ) : null}
      </dl>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pass' | 'fail' }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-1">
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={
          tone === 'pass' ? 'font-bold text-success-700' : tone === 'fail' ? 'font-bold text-danger-700' : 'text-fg'
        }
      >
        {value}
      </dd>
    </div>
  )
}
