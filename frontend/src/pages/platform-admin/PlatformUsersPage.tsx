import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Pencil, Shield, Trash2, UserRound, XCircle } from 'lucide-react'
import api, { extractErrorMessage, unwrapCollection } from '../../api/client'
import type { AdminUser } from '../../api/types'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Modal,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'
import { useAuth } from '../../context/AuthContext'

type EditableUser = Pick<AdminUser, 'displayName' | 'email' | 'roles' | 'emailVerified'> & {
  plainPassword: string
}

const emptyForm: EditableUser = {
  displayName: '',
  email: '',
  roles: ['ROLE_USER'],
  emailVerified: true,
  plainPassword: '',
}

export default function PlatformUsersPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [deleting, setDeleting] = useState<AdminUser | null>(null)
  const [form, setForm] = useState<EditableUser>(emptyForm)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      return unwrapCollection<AdminUser>(data)
    },
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return users
    return users.filter((user) =>
      [user.displayName, user.email, ...user.roles].some((value) => value.toLocaleLowerCase().includes(needle)),
    )
  }, [search, users])

  useEffect(() => {
    if (!editing) return
    setForm({
      displayName: editing.displayName,
      email: editing.email,
      roles: editing.roles,
      emailVerified: editing.emailVerified,
      plainPassword: '',
    })
  }, [editing])

  useEffect(() => setDeleteConfirmation(''), [deleting?.id])

  const updateUser = useMutation({
    mutationFn: async () => {
      if (!editing) return
      const payload: Record<string, unknown> = {
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        roles: form.roles,
        emailVerified: form.emailVerified,
      }
      if (form.plainPassword) payload.plainPassword = form.plainPassword
      await api.patch(`/admin/users/${editing.id}`, payload)
    },
    onSuccess: async () => {
      setEditing(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const deleteUser = useMutation({
    mutationFn: async () => {
      if (!deleting) return
      await api.post(`/admin/users/${deleting.id}/delete`, { confirmEmail: deleteConfirmation.trim() })
    },
    onSuccess: async () => {
      setDeleting(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const setRole = (role: 'ROLE_STORE_OWNER' | 'ROLE_SUPER_ADMIN', enabled: boolean) => {
    setForm((current) => ({
      ...current,
      roles: enabled
        ? Array.from(new Set([...current.roles, role]))
        : current.roles.filter((candidate) => candidate !== role),
    }))
  }

  const isEditingSelf = editing?.id === currentUser?.id

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage identities, access, verification, and account removal across the platform."
      />

      <Card>
        <CardHeader
          title="Platform users"
          subtitle={`${users.length} total`}
          actions={
            <div className="w-full sm:w-72">
              <Input
                aria-label="Search users"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or role"
              />
            </div>
          }
        />
        {usersQuery.isLoading ? (
          <CardBody>
            <LoadingPanel label="Loading users…" className="border-0 shadow-none" />
          </CardBody>
        ) : usersQuery.isError ? (
          <CardBody>
            <ErrorState description="Could not load users." onRetry={() => usersQuery.refetch()} />
          </CardBody>
        ) : filteredUsers.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={UserRound}
              title={search ? 'No matching users' : 'No users yet'}
              description={search ? 'Try a different name, email, or role.' : undefined}
            />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Status</TH>
                <TH>Access</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredUsers.map((platformUser) => (
                <TR key={platformUser.id}>
                  <TD>
                    <p className="font-medium text-fg">{platformUser.displayName}</p>
                    <p className="text-sm text-fg-muted">{platformUser.email}</p>
                  </TD>
                  <TD>
                    {platformUser.emailVerified ? (
                      <Badge tone="success">
                        <CheckCircle2 aria-hidden className="size-3.5" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge tone="neutral">
                        <XCircle aria-hidden className="size-3.5" />
                        Unverified
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1.5">
                      {platformUser.roles.includes('ROLE_SUPER_ADMIN') && <Badge tone="brand">Platform admin</Badge>}
                      {platformUser.roles.includes('ROLE_STORE_OWNER') && <Badge tone="neutral">Store owner</Badge>}
                      {!platformUser.roles.some((role) => role !== 'ROLE_USER') && <Badge tone="neutral">Customer</Badge>}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(platformUser)}>
                        <Pencil aria-hidden className="size-4" />
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={platformUser.id === currentUser?.id}
                        title={platformUser.id === currentUser?.id ? 'You cannot delete your own account.' : undefined}
                        onClick={() => setDeleting(platformUser)}
                      >
                        <Trash2 aria-hidden className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          updateUser.reset()
          setEditing(null)
        }}
        title={editing ? `Edit ${editing.displayName}` : 'Edit user'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={updateUser.isPending}
              disabled={
                !form.displayName.trim()
                || !form.email.trim()
                || (form.plainPassword.length > 0 && form.plainPassword.length < 8)
              }
              onClick={() => updateUser.mutate()}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Display name"
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
            />
            <Input
              label="Email address"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            />
          </div>
          <Input
            label="New password"
            type="password"
            value={form.plainPassword}
            onChange={(event) => setForm((current) => ({ ...current, plainPassword: event.target.value }))}
            hint="Leave blank to keep the current password. New passwords require at least 8 characters."
          />

          <fieldset className="space-y-3">
            <legend className="text-sm font-bold text-fg">Account access</legend>
            <label className="flex items-start gap-3 rounded-card border border-border p-3">
              <input
                type="checkbox"
                checked={form.emailVerified}
                onChange={(event) => setForm((current) => ({ ...current, emailVerified: event.target.checked }))}
                className="mt-1 size-4 accent-brand-500"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">Email verified</span>
                <span className="block text-xs text-fg-muted">Unverified users cannot sign in with email and password.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-card border border-border p-3">
              <input
                type="checkbox"
                checked={form.roles.includes('ROLE_STORE_OWNER')}
                onChange={(event) => setRole('ROLE_STORE_OWNER', event.target.checked)}
                className="mt-1 size-4 accent-brand-500"
              />
              <span>
                <span className="block text-sm font-semibold text-fg">Store owner</span>
                <span className="block text-xs text-fg-muted">Can own and administer assigned stores.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-card border border-border p-3">
              <input
                type="checkbox"
                checked={form.roles.includes('ROLE_SUPER_ADMIN')}
                disabled={isEditingSelf}
                onChange={(event) => setRole('ROLE_SUPER_ADMIN', event.target.checked)}
                className="mt-1 size-4 accent-brand-500"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  <Shield aria-hidden className="size-4" />
                  Platform admin
                </span>
                <span className="block text-xs text-fg-muted">
                  Full platform access. You cannot remove this role from your own account.
                </span>
              </span>
            </label>
          </fieldset>

          {updateUser.isError && (
            <p role="alert" className="text-sm text-danger-700">
              {extractErrorMessage(updateUser.error, 'Could not update this user.')}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          deleteUser.reset()
          setDeleting(null)
        }}
        title="Permanently delete user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteUser.isPending}
              disabled={!deleting || deleteConfirmation.trim().toLocaleLowerCase() !== deleting.email.toLocaleLowerCase()}
              onClick={() => deleteUser.mutate()}
            >
              <Trash2 aria-hidden className="size-4" />
              Delete permanently
            </Button>
          </>
        }
      >
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              This permanently removes <strong className="text-fg">{deleting.displayName}</strong> and their related
              customer data. A user who owns stores cannot be deleted until those stores are transferred or removed.
            </p>
            <Input
              label={`Type ${deleting.email} to confirm`}
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
            />
            {deleteUser.isError && (
              <p role="alert" className="text-sm text-danger-700">
                {extractErrorMessage(deleteUser.error, 'Could not delete this user.')}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
