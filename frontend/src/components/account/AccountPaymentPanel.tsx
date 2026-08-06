import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CreditCard } from 'lucide-react'
import api, { extractErrorMessage, httpStatus } from '../../api/client'
import type { PaymentClientConfig, UserProfile } from '../../api/types'
import { SquarePaymentPanel, type TokenizedPayment } from '../payments/SquarePaymentPanel'
import { Button, Card, CardBody, CardHeader } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { isDevBuild } from '../../lib/runtimeEnv'
import { METHOD_LABELS } from '../../pages/onboarding/config'

/**
 * Marketplace wallet — saved once on /account and synced to every store profile.
 */
export function AccountPaymentPanel() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()

  const configQuery = useQuery({
    queryKey: ['me-payment-config'],
    queryFn: async () => {
      const { data } = await api.get<PaymentClientConfig>('/me/payment-config')
      return data
    },
  })

  const saveMutation = useMutation({
    mutationFn: async (payment: TokenizedPayment) => {
      const { data } = await api.post<UserProfile>('/me/payment-method', {
        methodType: payment.methodType,
        token: payment.token,
        verificationToken: payment.verificationToken,
      })
      return data
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['me'], data)
      await refreshUser()
    },
  })

  const config = configQuery.data
  const squareReady = config?.mode === 'square'

  return (
    <Card>
      <CardHeader
        title="Payment method"
        subtitle="Save card, Google Pay, or Apple Pay once — the same method appears at every store you shop."
      />
      <CardBody className="space-y-4">
        {user?.paymentConfigured && user.paymentLast4 ? (
          <p className="rounded-btn border border-border bg-bg px-3 py-2 text-sm text-fg">
            <span className="font-semibold">
              {user.paymentMethodType ? METHOD_LABELS[user.paymentMethodType] : user.paymentBrand ?? 'Card'}
            </span>
            {' · '}
            <span className="font-mono">•••• {user.paymentLast4}</span>
            {user.paymentExpires ? ` · exp ${user.paymentExpires}` : ''}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">No payment method saved yet.</p>
        )}

        {configQuery.isLoading ? (
          <p className="text-sm text-fg-muted">Loading payment options…</p>
        ) : squareReady && config ? (
          <SquarePaymentPanel
            applicationId={config.applicationId}
            locationId={config.locationId}
            environment={config.environment}
            priceCents={0}
            currency={config.currency}
            countryCode={config.countryCode}
            billingEmail={user?.email ?? ''}
            confirmLabel="Save payment method"
            paymentRequestLabel="Save payment method"
            layout="checkout"
            saveOnly
            onTokenized={(p) => saveMutation.mutate(p)}
          />
        ) : isDevBuild ? (
          <Button
            variant="secondary"
            loading={saveMutation.isPending}
            onClick={() =>
              saveMutation.mutate({
                methodType: 'google_pay',
                token: `mock-wallet-${Date.now().toString(36)}`,
                last4: '4242',
                verificationToken: '',
              })
            }
          >
            <CreditCard aria-hidden className="size-4" />
            Simulate save (dev — configure platform Square for live SDK)
          </Button>
        ) : (
          <p className="text-sm text-fg-muted">Online payment setup is not available right now. Try again later.</p>
        )}

        {saveMutation.isSuccess && (
          <p className="flex items-center gap-2 text-sm font-medium text-success-700">
            <CheckCircle2 aria-hidden className="size-4" />
            Payment method saved — it will show up at each store you visit.
          </p>
        )}
        {saveMutation.isError && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {httpStatus(saveMutation.error) === 402
              ? extractErrorMessage(saveMutation.error, 'Your payment could not be verified.')
              : extractErrorMessage(saveMutation.error, 'Could not save your payment method.')}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

export default AccountPaymentPanel
