import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import api, { extractErrorMessage, formatPrice } from '../../api/client'
import type { StoreCreditLedger } from '../../api/types'
import { formatDate } from '../../lib/format'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'

export default function StoreCreditTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const [adjustingId, setAdjustingId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const query = useQuery({
    queryKey: ['store-admin-credit', slug],
    queryFn: async () => {
      const { data } = await api.get<StoreCreditLedger>(`/stores/${slug}/admin/credit`)
      return data
    },
  })

  const adjust = useMutation({
    mutationFn: async ({ userId, amountCents, note }: { userId: number; amountCents: number; note: string }) => {
      await api.post(`/stores/${slug}/customers/${userId}/credit`, { amountCents, note })
    },
    onSuccess: async () => {
      setAdjustingId(null)
      setAmount('')
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['store-admin-credit', slug] })
    },
  })

  if (query.isLoading) return <LoadingPanel label="Loading store credit balances…" />
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load store credit"
        description={extractErrorMessage(query.error, 'The credit ledger could not be loaded.')}
      />
    )
  }

  const ledger = query.data
  const customers = ledger?.customers ?? []

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardBody>
            <p className="text-sm text-fg-muted">Outstanding credit</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-fg">
              {formatPrice(ledger?.outstandingCents ?? 0)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-fg-muted">Customers with a balance</p>
            <p className="mt-1 font-display text-3xl font-extrabold text-fg">{ledger?.customerCount ?? 0}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Customer balances"
          subtitle="Credit stays at this store. Adjustments are for counter corrections and goodwill."
        />
        {customers.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={Wallet}
              title="No outstanding credit"
              description="When a customer sells cards for store credit, their balance will show up here."
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH>Email</TH>
                <TH>Balance</TH>
                <TH>Last movement</TH>
                <TH>Adjust</TH>
              </TR>
            </THead>
            <TBody>
              {customers.map((row) => (
                <TR key={row.userId}>
                  <TD className="font-semibold text-fg">{row.displayName || 'Customer'}</TD>
                  <TD className="text-fg-muted">{row.email}</TD>
                  <TD className="font-display font-extrabold text-fg">{formatPrice(row.balanceCents)}</TD>
                  <TD className="text-fg-muted">{formatDate(row.lastActivityAt)}</TD>
                  <TD>
                    {adjustingId === row.userId ? (
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const cents = Math.round(Number.parseFloat(amount) * 100)
                          if (!Number.isFinite(cents) || 0 === cents) return
                          adjust.mutate({ userId: row.userId, amountCents: cents, note: note.trim() })
                        }}
                      >
                        <Input
                          label="Amount"
                          type="number"
                          step="0.01"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="10.00 or -5.00"
                          className="w-28"
                        />
                        <Input
                          label="Note"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional"
                          className="w-40"
                        />
                        <Button type="submit" size="sm" loading={adjust.isPending}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setAdjustingId(null)}>
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setAdjustingId(row.userId)}>
                        Adjust
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {adjust.isError && (
          <CardBody>
            <p className="text-sm text-danger-700">
              {extractErrorMessage(adjust.error, 'Could not adjust that balance.')}
            </p>
          </CardBody>
        )}
      </Card>
    </div>
  )
}
