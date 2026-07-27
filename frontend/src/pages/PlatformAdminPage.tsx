import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router'
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  PageHeader,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '../components/ui'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Plug,
  RefreshCw,
  Star,
  Store as StoreIcon,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react'
import api, { extractErrorMessage, unwrapCollection } from '../api/client'
import type { AdminIntegrations, AdminUser, IntegrationStatus, ScryfallSyncResult, Store } from '../api/types'
import { StoreApplicationModal } from './platform-admin/StoreApplicationModal'

export default function PlatformAdminPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [ownerId, setOwnerId] = useState<number | ''>('')
  const [auditStoreSlug, setAuditStoreSlug] = useState('')
  const [reviewing, setReviewing] = useState<Store | null>(null)

  const integrationsQuery = useQuery({
    queryKey: ['admin-integrations'],
    queryFn: async () => {
      const { data } = await api.get<AdminIntegrations>('/admin/integrations')
      return data
    },
  })

  const storesQuery = useQuery({
    queryKey: ['admin-stores'],
    queryFn: async () => {
      const { data } = await api.get('/admin/stores')
      return unwrapCollection<Store>(data)
    },
  })
  const stores = storesQuery.data ?? []

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return unwrapCollection<AdminUser>(data)
    },
  })
  const users = usersQuery.data ?? []

  const createStore = useMutation({
    mutationFn: async () => {
      await api.post('/admin/stores', {
        name: storeName,
        slug: storeSlug,
        owner: `/api/admin/users/${ownerId}`,
        isActive: true,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-stores'] })
      await queryClient.invalidateQueries({ queryKey: ['stores'] })
      setStoreName('')
      setStoreSlug('')
      setOwnerId('')
    },
  })

  // Featured is a single hero spotlight on the marketplace home: mark one store,
  // which clears any other. Empty → the home hides the featured section.
  const setFeatured = useMutation({
    mutationFn: async ({ id, featured }: { id: number; featured: boolean }) => {
      if (featured) {
        await Promise.all(
          stores
            .filter((s) => s.featured && s.id !== id)
            .map((s) => api.patch(`/admin/stores/${s.id}`, { featured: false })),
        )
      }
      await api.patch(`/admin/stores/${id}`, { featured })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-stores'] })
      await queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })

  // Approve/reject a self-serve store application. Approving flips it live.
  const reviewApplication = useMutation({
    mutationFn: async ({ id, action, reason }: { id: number; action: 'approve' | 'reject'; reason?: string }) => {
      await api.post(`/admin/stores/${id}/${action}`, action === 'reject' ? { reason } : {})
    },
    onSuccess: async () => {
      setReviewing(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-stores'] })
      await queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })
  const reviewBusyAction =
    reviewApplication.isPending && reviewApplication.variables ? reviewApplication.variables.action : null
  const reviewError = reviewApplication.isError
    ? extractErrorMessage(reviewApplication.error, 'The review action failed. Please try again.')
    : null
  const openReview = (store: Store) => {
    reviewApplication.reset()
    setReviewing(store)
  }

  const syncScryfall = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ScryfallSyncResult>('/admin/scryfall/sync')
      return data
    },
  })

  const pending = stores.filter((store) => store.status === 'pending')
  const activeStores = stores.filter((store) => store.isActive !== false && store.status !== 'pending').length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Platform admin"
        subtitle="Manage tenants, catalog sync, and import audits across the platform."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<StoreIcon aria-hidden className="size-5" />}
          label="Total stores"
          value={stores.length}
        />
        <StatCard
          icon={<CheckCircle2 aria-hidden className="size-5" />}
          label="Active stores"
          value={activeStores}
        />
        <StatCard
          icon={<Clock aria-hidden className="size-5" />}
          label="Pending review"
          value={pending.length}
        />
        <StatCard
          icon={<UsersIcon aria-hidden className="size-5" />}
          label="Users"
          value={users.length}
        />
      </section>

      {pending.length > 0 && (
        <Card>
          <CardHeader
            title="Store applications"
            subtitle={`${pending.length} awaiting review — approve to take the storefront live.`}
          />
          <CardBody className="space-y-4">
            {pending.map((store) => (
              <div
                key={store.id}
                className="flex flex-col gap-4 rounded-card border border-border bg-bg p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-fg">{store.name}</h3>
                    <Badge tone="neutral">/{store.slug}</Badge>
                    {store.planKey && <Badge tone="brand">{store.planKey}</Badge>}
                  </div>
                  {store.owner && (
                    <p className="mt-1 text-sm text-fg-muted">
                      {store.owner.displayName} · {store.owner.email}
                    </p>
                  )}
                  {(store.addressLine1 || store.city) && (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                      <MapPin aria-hidden className="size-4" />
                      {[store.addressLine1, store.city, store.region, store.postalCode, store.country]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="primary" size="sm" onClick={() => openReview(store)}>
                    Review &amp; approve
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Integrations"
          subtitle="Open each provider console to create credentials, then add them in backend/.env.local and restart the API."
          actions={
            <Button variant="secondary" size="sm" onClick={() => void integrationsQuery.refetch()}>
              <RefreshCw aria-hidden className="size-4" />
              Refresh
            </Button>
          }
        />
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <IntegrationTile
            title="Single sign-on"
            detail={integrationsQuery.data?.sso.providerName ?? 'Google'}
            status={integrationsQuery.data?.sso}
            setupUrl="https://console.cloud.google.com/apis/credentials"
            setupLabel="Open Google Cloud"
          />
          <IntegrationTile
            title="Address autocomplete"
            detail={integrationsQuery.data?.addressAutocomplete.provider ?? 'Mapbox'}
            status={integrationsQuery.data?.addressAutocomplete}
            setupUrl="https://console.mapbox.com/account/access-tokens/"
            setupLabel="Open Mapbox"
          />
          <IntegrationTile
            title="Subscription payments"
            detail={integrationsQuery.data?.subscriptionPayments.provider ?? 'Braintree'}
            status={integrationsQuery.data?.subscriptionPayments}
            setupUrl="https://www.braintreepayments.com/sandbox"
            setupLabel="Open Braintree"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Scryfall catalog sync"
          subtitle="Queues a bulk catalog sync on the background worker. Run the CLI app:scryfall:sync for the full all-printings dataset."
          actions={
            <Button
              variant="primary"
              loading={syncScryfall.isPending}
              onClick={() => syncScryfall.mutate()}
            >
              <RefreshCw aria-hidden className="size-4" />
              {syncScryfall.isPending ? 'Queueing…' : 'Run sync'}
            </Button>
          }
        />
        {(syncScryfall.data || syncScryfall.isError) && (
          <CardBody>
            {syncScryfall.data?.status === 'queued' && (
              <p className="text-sm text-success-700">
                Sync queued ({syncScryfall.data.type ?? 'oracle_cards'}) — it runs on the messenger
                worker in the background; progress appears in the worker logs.
              </p>
            )}
            {syncScryfall.data && syncScryfall.data.status !== 'queued' && (
              <p className="text-sm text-success-700">
                Synced {syncScryfall.data.total ?? 0} cards ({syncScryfall.data.inserted ?? 0} inserted,{' '}
                {syncScryfall.data.updated ?? 0} updated).
              </p>
            )}
            {syncScryfall.isError && (
              <p className="text-sm text-danger-700">Scryfall sync failed.</p>
            )}
          </CardBody>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Create store"
            subtitle="Provision a new tenant and assign an owner."
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Store name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Acme Cards"
              />
              <Input
                label="Slug"
                value={storeSlug}
                onChange={(e) => setStoreSlug(e.target.value)}
                placeholder="acme-cards"
              />
            </div>
            <Select
              label="Owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Select owner</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.email})
                </option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={createStore.isPending}
                disabled={!storeName || !storeSlug || !ownerId}
                onClick={() => createStore.mutate()}
              >
                Create store
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Store import audit"
            subtitle="Review CSV import runs and processing status for a store."
          />
          <CardBody className="space-y-4">
            <Select
              label="Store"
              value={auditStoreSlug}
              onChange={(event) => setAuditStoreSlug(event.target.value)}
            >
              <option value="">Select store</option>
              {stores.map((store) => (
                <option key={store.id} value={store.slug}>
                  {store.name} /{store.slug}
                </option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                disabled={!auditStoreSlug}
                onClick={() => navigate(`/platform/admin/stores/${auditStoreSlug}/imports`)}
              >
                View imports
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Stores" subtitle={`${stores.length} total`} />
        {storesQuery.isLoading ? (
          <CardBody>
            <LoadingPanel label="Loading stores…" className="border-0 shadow-none" />
          </CardBody>
        ) : storesQuery.isError ? (
          <CardBody>
            <ErrorState
              description="Could not load stores."
              onRetry={() => storesQuery.refetch()}
            />
          </CardBody>
        ) : stores.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={StoreIcon}
              title="No stores yet"
              description="Create your first store to get started."
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Store</TH>
                <TH>Slug</TH>
                <TH>Status</TH>
                <TH>Featured</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {stores.map((store) => (
                <TR key={store.id}>
                  <TD className="font-medium">{store.name}</TD>
                  <TD className="text-fg-muted">/{store.slug}</TD>
                  <TD>
                    {store.status === 'pending' ? (
                      <Badge tone="brand">Pending</Badge>
                    ) : store.status === 'rejected' ? (
                      <Badge tone="danger">Rejected</Badge>
                    ) : store.isActive === false ? (
                      <Badge tone="neutral">Inactive</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </TD>
                  <TD>
                    <Button
                      variant={store.featured ? 'primary' : 'secondary'}
                      size="sm"
                      loading={setFeatured.isPending && setFeatured.variables?.id === store.id}
                      onClick={() => setFeatured.mutate({ id: store.id, featured: !store.featured })}
                      aria-pressed={Boolean(store.featured)}
                    >
                      <Star aria-hidden className={`size-4 ${store.featured ? 'fill-current' : ''}`} />
                      {store.featured ? 'Featured' : 'Feature'}
                    </Button>
                  </TD>
                  <TD className="text-right">
                    <Link
                      to={`/platform/admin/stores/${store.slug}/imports`}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    >
                      Imports
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Users" subtitle={`${users.length} total`} />
        {usersQuery.isLoading ? (
          <CardBody>
            <LoadingPanel label="Loading users…" className="border-0 shadow-none" />
          </CardBody>
        ) : usersQuery.isError ? (
          <CardBody>
            <ErrorState
              description="Could not load users."
              onRetry={() => usersQuery.refetch()}
            />
          </CardBody>
        ) : users.length === 0 ? (
          <CardBody>
            <EmptyState icon={UsersIcon} title="No users yet" />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Roles</TH>
              </TR>
            </THead>
            <TBody>
              {users.map((user) => (
                <TR key={user.id}>
                  <TD className="font-medium">{user.displayName}</TD>
                  <TD className="text-fg-muted">{user.email}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {user.roles.map((role) => (
                        <Badge key={role} tone="brand">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <StoreApplicationModal
        store={reviewing}
        busyAction={reviewBusyAction}
        error={reviewError}
        onApprove={(id) => reviewApplication.mutate({ id, action: 'approve' })}
        onReject={(id, reason) => reviewApplication.mutate({ id, action: 'reject', reason })}
        onClose={() => setReviewing(null)}
      />
    </div>
  )
}

function IntegrationTile({
  title,
  detail,
  status,
  setupUrl,
  setupLabel = 'Open setup',
}: {
  title: string
  detail: string
  status?: IntegrationStatus
  setupUrl: string
  setupLabel?: string
}) {
  const configured = status?.configured ?? false
  return (
    <div className="rounded-card border border-border bg-bg p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-fg">
          <Plug aria-hidden className="size-4 text-fg-muted" />
          {title}
        </span>
        {configured ? (
          <Badge tone="success">
            <CheckCircle2 aria-hidden className="size-3.5" />
            Connected
          </Badge>
        ) : (
          <Badge tone="neutral">
            <XCircle aria-hidden className="size-3.5" />
            Not set
          </Badge>
        )}
      </div>
      <p className="mt-2 text-xs text-fg-muted">{detail}</p>
      <a
        href={setupUrl}
        target="_blank"
        rel="noreferrer"
        className={`${buttonVariants({ variant: configured ? 'ghost' : 'secondary', size: 'sm' })} mt-4 w-full`}
      >
        <ExternalLink aria-hidden className="size-4" />
        {configured ? 'Manage provider' : setupLabel}
      </a>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-card bg-brand-50 text-brand-600">
          {icon}
        </span>
        <div>
          <p className="text-sm text-fg-muted">{label}</p>
          <p className="font-display text-2xl font-bold text-fg">{value}</p>
        </div>
      </CardBody>
    </Card>
  )
}
