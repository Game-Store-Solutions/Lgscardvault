import { CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router'
import { Input } from '../../../components/ui'
import type { OnboardingData, Patch } from '../types'

export function AccountStep({ data, patch, locked }: { data: OnboardingData; patch: Patch; locked: boolean }) {
  return (
    <div className="max-w-md space-y-4">
      {locked && (
        <p className="flex items-center gap-2 rounded-btn bg-success-50 px-3 py-2 text-sm font-medium text-success-700">
          <CheckCircle2 aria-hidden className="size-4" />
          Signed in as {data.email}. Continue to set up your store.
        </p>
      )}
      <Input label="Your name" autoComplete="name" value={data.displayName} onChange={(e) => patch({ displayName: e.target.value })} disabled={locked} required />
      <Input label="Email" type="email" autoComplete="email" value={data.email} onChange={(e) => patch({ email: e.target.value })} disabled={locked} required />
      {!locked && (
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={data.password}
          onChange={(e) => patch({ password: e.target.value })}
          minLength={8}
          required
        />
      )}
      {!locked && (
        <>
          <Input
            label="Date of birth"
            type="date"
            autoComplete="bday"
            hint="Required. You must be 13 or older. We do not run ID verification."
            value={data.dateOfBirth}
            onChange={(e) => patch({ dateOfBirth: e.target.value })}
            required
          />
          <label className="flex items-start gap-2 text-sm leading-5 text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-current"
              checked={data.acceptedTerms}
              onChange={(e) => patch({ acceptedTerms: e.target.checked })}
              required
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="font-semibold text-brand-600 hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-semibold text-brand-600 hover:underline">
                Privacy Policy
              </Link>
              . I confirm the date of birth above and that I am at least 13.
            </span>
          </label>
        </>
      )}
    </div>
  )
}

export default AccountStep
