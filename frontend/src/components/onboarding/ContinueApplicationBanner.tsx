import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Store, X } from 'lucide-react'
import { useOnboardingDraft } from '../../hooks/useOnboardingDraft'
import { STEPS } from '../../pages/onboarding/config'
import { isOnboardingDraftInProgress } from '../../pages/onboarding/draftStorage'
import { buttonVariants } from '../ui'
import { cx } from '../../lib/cx'

const DISMISS_KEY = 'lgs-onboarding-banner-dismissed'

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Reminder on the store directory when someone left the owner wizard unfinished. */
export function ContinueApplicationBanner() {
  const draft = useOnboardingDraft()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed || !isOnboardingDraftInProgress(draft) || !draft) return null

  const step = STEPS[Math.min(Math.max(draft.step, 0), STEPS.length - 1)]
  const storeName = draft.data.storeName.trim()

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-card border border-brand-500/25 bg-brand-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-btn bg-surface text-brand-700 shadow-sm ring-1 ring-border dark:text-brand-400">
          <Store aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-fg">Finish your store application</p>
          <p className="mt-0.5 text-sm text-fg-muted">
            {storeName ? <span className="font-medium text-fg">{storeName}</span> : 'Your store'}
            {step ? ` · left off on ${step.title}` : null}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        <Link to="/register/owner" className={cx(buttonVariants({ variant: 'primary', size: 'sm' }))}>
          Continue
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <button
          type="button"
          onClick={() => {
            try {
              sessionStorage.setItem(DISMISS_KEY, '1')
            } catch {
              // ignore
            }
            setDismissed(true)
          }}
          className="grid size-9 place-items-center rounded-btn text-fg-muted hover:bg-bg hover:text-fg"
          aria-label="Dismiss application reminder"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}
