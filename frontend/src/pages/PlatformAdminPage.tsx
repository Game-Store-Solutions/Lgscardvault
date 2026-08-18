import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
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
  Select,
  TabPanel,
  Tabs,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from '../components/ui'
import {
  Ban,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  Plug,
  Power,
  RefreshCw,
  Star,
  Store as StoreIcon,
  Trash2,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react'
import api, { extractErrorMessage, unwrapCollection } from '../api/client'
import type { AdminIntegrations, AdminUser, IntegrationStatus, Store } from '../api/types'
import { StoreApplicationModal } from './platform-admin/StoreApplicationModal'
import { BillingPanel } from './platform-admin/BillingPanel'
import { isDevBuild } from '../lib/runtimeEnv'

type PlatformAdminTab = 'overview' | 'billing' | 'stores' | 'platform'

const PLATFORM_TABS: { id: PlatformAdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'stores', label: 'Stores', icon: StoreIcon },
  { id: 'platform', label: 'Integrations', icon: Plug },
]

function parsePlatformTab(value: string | null): PlatformAdminTab {
  if (value && PLATFORM_TABS.some((t) => t.id === value)) {
    return value as PlatformAdminTab
  }
  return 'overview'
}

export default function PlatformAdminPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parsePlatformTab(searchParams.get('tab'))

  function setActiveTab(tab: PlatformAdminTab) {
    setSearchParams(tab === 'overview' ? {} : { tab }, { replace: true })
  }
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

  const setStoreActive = useMutation({
    mutationFn: async ({ id, enable }: { id: number; enable: boolean }) => {
      await api.post(`/admin/stores/${id}/${enable ? 'enable' : 'disable'}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-stores'] })
      await queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })

  const deleteStore = useMutation({
    mutationFn: async ({ id, confirmSlug }: { id: number; confirmSlug: string }) => {
      await api.post(`/admin/stores/${id}/delete`, { confirmSlug })
    },
    onSuccess: async () => {
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

  const confirmDeleteStore = (store: Store) => {
    const typed = window.prompt(
      `Permanently delete "${store.name}" and all of its inventory, orders, and customer data?\n\nType the slug "${store.slug}" to confirm.`,
    )
    if (typed == null) return
    if (typed.trim() !== store.slug) {
      window.alert('Slug did not match. Store was not deleted.')
      return
    }
    deleteStore.mutate({ id: store.id, confirmSlug: store.slug })
  }

  const pending = stores.filter((store) => store.status === 'pending')
  const activeStores = stores.filter((store) => store.isActive !== false && store.status !== 'pending').length

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(220,38,38,0.12),rgba(17,17,19,0.98))]">
        <div className="grid gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:px-8">
          <div className="space-y-4">
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-fg-muted">Platform admin</p>
            <div className="space-y-3">
              <h1 className="font-display text-4xl font-bold tracking-[-0.05em] text-fg sm:text-5xl">
                Command center for stores, billing, and platform operations.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-fg-muted sm:text-base">
                Manage tenants, review store applications, audit imports, and keep the marketplace healthy from one place.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <QuickAdminCallout title="Pending review" value={pending.length} text="Store applications waiting on approval." />
            <QuickAdminCallout title="Live stores" value={activeStores} text="Active storefronts currently visible to shoppers." />
            <QuickAdminCallout title="Users" value={users.length} text="Accounts across the marketplace." />
          </div>
        </div>
      </section>

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

      {pending.length > 0 && activeTab !== 'stores' && (
        <div className="flex flex-col gap-3 rounded-[1.15rem] border border-brand-500/25 bg-brand-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg">
            <span className="font-bold">{pending.length}</span> store application{pending.length === 1 ? '' : 's'}{' '}
            awaiting review.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('stores')}>
            Open Stores tab
          </Button>
        </div>
      )}

      <Tabs
        aria-label="Platform admin sections"
        tabs={PLATFORM_TABS.map(({ id, label, icon }) => ({
          id,
          label:
            id === 'stores' && pending.length > 0 ? (
              <span className="inline-flex items-center gap-2">
                {label}
                <Badge tone="brand">{pending.length}</Badge>
              </span>
            ) : (
              label
            ),
          icon,
        }))}
        value={activeTab}
        onChange={(id) => setActiveTab(parsePlatformTab(id))}
      >
        <TabPanel when="overview" value={activeTab} className="space-y-6 pt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Create store" subtitle="Provision a new tenant and assign an owner." />
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
          <div className="grid gap-6 lg:grid-cols-3">
            <CommandTile
              icon={<StoreIcon aria-hidden className="size-5" />}
              title="Store reviews"
              text="Approve or reject incoming store applications and control visibility."
              action={
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('stores')}>
                  Open stores
                </Button>
              }
            />
            <CommandTile
              icon={<CreditCard aria-hidden className="size-5" />}
              title="Billing"
              text="Jump into subscription health, owner billing state, and charge history."
              action={
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('billing')}>
                  Open billing
                </Button>
              }
            />
            <CommandTile
              icon={<Plug aria-hidden className="size-5" />}
              title="Integrations"
              text="Check provider readiness and verify external platform connections."
              action={
                <Button variant="secondary" size="sm" onClick={() => setActiveTab('platform')}>
                  Open integrations
                </Button>
              }
            />
          </div>
        </TabPanel>

        <TabPanel when="billing" value={activeTab} className="space-y-4 pt-6">
          <div>
            <h2 className="font-display text-xl font-bold text-fg">Subscription billing</h2>
            <p className="text-sm text-fg-muted">
              What store owners pay the marketplace each month, and who is behind.
            </p>
          </div>
          <BillingPanel />
        </TabPanel>

        <TabPanel when="stores" value={activeTab} className="space-y-6 pt-6">
          {pending.length > 0 && (
            <Card>
              <CardHeader
                title="Store applications"
                subtitle={`${pending.length} awaiting review. Approve to take the storefront live.`}
              />
              <CardBody className="space-y-4">
                {pending.map((store) => (
                  <div
                    key={store.id}
                    className="flex flex-col gap-4 rounded-card bg-bg/80 p-4 ring-1 ring-black/[0.04] lg:flex-row lg:items-center lg:justify-between dark:ring-white/10"
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
            <CardHeader title="Stores" subtitle={`${stores.length} total`} />
            {storesQuery.isLoading ? (
              <CardBody>
                <LoadingPanel label="Loading stores…" className="border-0 shadow-none" />
              </CardBody>
            ) : storesQuery.isError ? (
              <CardBody>
                <ErrorState description="Could not load stores." onRetry={() => storesQuery.refetch()} />
              </CardBody>
            ) : stores.length === 0 ? (
              <CardBody>
                <EmptyState
                  icon={StoreIcon}
                  title="No stores yet"
                  description="Create your first store on the Overview tab."
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
                    <TR
                      key={store.id}
                      onClick={() => navigate(`/s/${store.slug}/admin`)}
                      title={`Open ${store.name}'s admin`}
                      className="cursor-pointer"
                    >
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
                      <TD onClick={(e) => e.stopPropagation()}>
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
                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Link
                            to={`/s/${store.slug}/admin`}
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            Manage
                          </Link>
                          <Link
                            to={`/platform/admin/stores/${store.slug}/imports`}
                            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                          >
                            Imports
                          </Link>
                          {store.status !== 'pending' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={
                                setStoreActive.isPending && setStoreActive.variables?.id === store.id
                              }
                              onClick={() =>
                                setStoreActive.mutate({
                                  id: store.id,
                                  enable: store.isActive === false || store.status === 'rejected',
                                })
                              }
                            >
                              {store.isActive === false || store.status === 'rejected' ? (
                                <>
                                  <Power aria-hidden className="size-4" />
                                  Enable
                                </>
                              ) : (
                                <>
                                  <Ban aria-hidden className="size-4" />
                                  Disable
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deleteStore.isPending && deleteStore.variables?.id === store.id}
                            onClick={() => confirmDeleteStore(store)}
                          >
                            <Trash2 aria-hidden className="size-4" />
                            Delete
                          </Button>
                        </div>
                        {(setStoreActive.isError && setStoreActive.variables?.id === store.id) ||
                        (deleteStore.isError && deleteStore.variables?.id === store.id) ? (
                          <p className="mt-1 text-xs text-danger-700">
                            {extractErrorMessage(
                              (setStoreActive.error ?? deleteStore.error) as Error,
                              'Store action failed.',
                            )}
                          </p>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabPanel>

        <TabPanel when="platform" value={activeTab} className="space-y-6 pt-6">
          <Card>
            <CardHeader
              title="Integrations"
              subtitle={
                isDevBuild
                  ? 'Open each provider console to create credentials, then add them in backend/.env.local and restart the API.'
                  : 'Provider connection status for this environment. Configure secrets in your deployment env file.'
              }
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
                detail={integrationsQuery.data?.subscriptionPayments.provider ?? 'Square'}
                status={integrationsQuery.data?.subscriptionPayments}
                setupUrl="https://developer.squareup.com/apps"
                setupLabel="Open Square"
              />
            </CardBody>
          </Card>
        </TabPanel>
      </Tabs>

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
    <div className="rounded-card bg-bg/80 p-4 ring-1 ring-black/[0.04] dark:ring-white/10">
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

function QuickAdminCallout({ title, value, text }: { title: string; value: number; text: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.04] p-4">
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-fg-muted">{title}</p>
      <p className="mt-2 font-display text-3xl font-bold tracking-[-0.04em] text-fg">{value}</p>
      <p className="mt-2 text-sm text-fg-muted">{text}</p>
    </div>
  )
}

function CommandTile({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text: string
  action: ReactNode
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/8 bg-[#111113] p-5 shadow-[0_20px_60px_-34px_rgba(0,0,0,0.82)]">
      <span className="inline-flex size-11 items-center justify-center rounded-[0.95rem] border border-brand-500/20 bg-brand-500/10 text-brand-300">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em] text-fg">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-fg-muted">{text}</p>
      <div className="mt-5">{action}</div>
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
    <Card className="border-white/8 bg-[#111113] shadow-[0_18px_54px_-30px_rgba(0,0,0,0.76)]">
      <CardBody className="flex items-center gap-4">
        <span className="flex size-11 items-center justify-center rounded-[0.95rem] border border-white/8 bg-white/[0.04] text-brand-300">
          {icon}
        </span>
        <div>
          <p className="text-sm text-fg-muted">{label}</p>
          <p className="font-display text-3xl font-bold tracking-[-0.04em] text-fg">{value}</p>
        </div>
      </CardBody>
    </Card>
  )
}
