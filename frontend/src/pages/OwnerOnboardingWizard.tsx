import { Link, useNavigate } from 'react-router'
import { ArrowLeft, ArrowRight, Send, Sparkles } from 'lucide-react'
import { Button, Card, CardBody, CardHeader } from '../components/ui'
import { STEP_SUBTITLE, STEPS } from './onboarding/config'
import { Stepper } from './onboarding/Stepper'
import { SubmittedScreen } from './onboarding/SubmittedScreen'
import { useOnboarding } from './onboarding/useOnboarding'
import {
  AccountStep,
  AddressStep,
  BrandingStep,
  ColorsStep,
  PaymentStep,
  PlanStep,
  ReviewStep,
} from './onboarding/steps'

export default function OwnerOnboardingWizard() {
  const navigate = useNavigate()
  const o = useOnboarding()

  if (o.submitted) {
    return <SubmittedScreen name={o.submitted.name} onHome={() => navigate('/')} />
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <header className="mb-8 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-600">
          <Sparkles aria-hidden className="size-4" />
          Launch your storefront
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">Set up your store</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </header>

      <Stepper current={o.step} />

      <Card className="mt-8">
        <CardHeader title={STEPS[o.step].title} subtitle={STEP_SUBTITLE[o.currentKey]} />
        <CardBody>
          {o.currentKey === 'account' && <AccountStep data={o.data} patch={o.patch} locked={o.accountCreated} />}
          {o.currentKey === 'address' && (
            <AddressStep data={o.data} patch={o.patch} patchAddress={o.patchAddress} applyAddress={o.applyAddress} />
          )}
          {o.currentKey === 'branding' && (
            <BrandingStep data={o.data} setStoreName={o.setStoreName} setSlug={o.setSlug} patchBranding={o.patchBranding} />
          )}
          {o.currentKey === 'colors' && <ColorsStep data={o.data} patchBranding={o.patchBranding} />}
          {o.currentKey === 'plan' && (
            <PlanStep plans={o.plans} loading={o.plansLoading} selected={o.data.planKey} onSelect={(key) => o.patch({ planKey: key })} />
          )}
          {o.currentKey === 'payment' && (
            <PaymentStep
              required={o.paymentRequired}
              plan={o.selectedPlan}
              payment={o.data.payment}
              billingEmail={o.data.email}
              patchPayment={o.patchPayment}
            />
          )}
          {o.currentKey === 'review' && (
            <ReviewStep data={o.data} plan={o.selectedPlan} paymentRequired={o.paymentRequired} onJump={o.jumpTo} />
          )}

          {o.error && (
            <p role="alert" className="mt-6 rounded-btn bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700">
              {o.error}
            </p>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={o.goBack} disabled={o.step === 0 || o.busy}>
          <ArrowLeft aria-hidden className="size-4" />
          Back
        </Button>
        {o.isLast ? (
          <Button size="lg" onClick={o.submit} loading={o.busy} disabled={!o.canProceed}>
            <Send aria-hidden className="size-4" />
            Submit for review
          </Button>
        ) : (
          <Button size="lg" onClick={o.goNext} loading={o.busy} disabled={!o.canProceed}>
            Continue
            <ArrowRight aria-hidden className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
