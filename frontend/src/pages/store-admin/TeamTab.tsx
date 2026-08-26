import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Users } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { ownsStore } from '../../lib/manageableStores'
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
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '../../components/ui'

interface StoreTeamMember {
  id: number | null
  role: 'owner' | 'admin' | 'member'
  isOwner: boolean
  user: {
    id: number
    email: string
    displayName: string
  }
}

const teamKey = (slug: string) => ['store-staff', slug] as const

export default function TeamTab({ slug }: { slug: string }) {
  const { user, isSuperAdmin } = useAuth()
  const canEdit = ownsStore(user, slug) || isSuperAdmin
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('admin')

  const query = useQuery({
    queryKey: teamKey(slug),
    queryFn: async () => {
      const { data } = await api.get<StoreTeamMember[]>(`/stores/${slug}/staff`)
      return data
    },
  })

  const add = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<StoreTeamMember[]>(`/stores/${slug}/staff`, {
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        password: password || undefined,
        role,
      })
      return data
    },
    onSuccess: async () => {
      setEmail('')
      setDisplayName('')
      setPassword('')
      setRole('admin')
      await queryClient.invalidateQueries({ queryKey: teamKey(slug) })
    },
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: 'admin' | 'member' }) => {
      await api.patch(`/stores/${slug}/staff/${id}`, { role })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamKey(slug) })
    },
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/stores/${slug}/staff/${id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamKey(slug) })
    },
  })

  if (query.isLoading) return <LoadingPanel label="Loading store users…" />
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load store users"
        description={extractErrorMessage(query.error, 'The team list could not be loaded.')}
      />
    )
  }

  const members = query.data ?? []

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader
            data-guide="Add an employee"
            title="Add an employee"
            subtitle="Set a password for new accounts. Admin access opens the store dashboard."
          />
          <CardBody>
            <form
              className="grid gap-3 sm:grid-cols-2 sm:items-end"
              data-training-mutation
              onSubmit={(event) => {
                event.preventDefault()
                if (email.trim()) add.mutate()
              }}
            >
              <Input
                data-guide="Employee email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="employee@store.com"
                required
              />
              <Input
                label="Name (optional)"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Casey"
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                hint="Required for a new email. Existing accounts keep their current password."
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Select
                  data-guide="Access"
                  label="Access"
                  value={role}
                  onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
                  wrapperClassName="w-full"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </Select>
                <Button type="submit" data-guide="Add" data-training-mutation loading={add.isPending} disabled={!email.trim()}>
                  <UserPlus aria-hidden className="size-4" />
                  Add
                </Button>
              </div>
            </form>
            {add.isError && (
              <p role="alert" className="mt-3 text-sm text-danger-700">
                {extractErrorMessage(add.error, 'Could not add that person.')}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      {members.length === 0 ? (
        <EmptyState icon={Users} title="No users yet" description="Add an employee by email to give them store access." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Access</TH>
                {canEdit ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.isOwner ? 'owner' : member.id}>
                  <TD className="font-medium text-fg">{member.user.displayName}</TD>
                  <TD className="text-fg-muted">{member.user.email}</TD>
                  <TD>
                    {member.isOwner ? (
                      <Badge tone="brand" data-guide="Owner">Owner</Badge>
                    ) : canEdit ? (
                      <Select
                        aria-label={`Access for ${member.user.displayName}`}
                        data-guide="Access"
                        data-training-mutation
                        value={member.role}
                        onChange={(event) => {
                          if (member.id) {
                            updateRole.mutate({ id: member.id, role: event.target.value as 'admin' | 'member' })
                          }
                        }}
                        wrapperClassName="w-36"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </Select>
                    ) : (
                      <Badge>{member.role === 'admin' ? 'Admin' : 'Member'}</Badge>
                    )}
                  </TD>
                  {canEdit ? (
                    <TD className="text-right">
                      {member.isOwner || !member.id ? (
                        <span className="text-xs text-fg-muted">—</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={remove.isPending}
                          onClick={() => remove.mutate(member.id as number)}
                        >
                          Remove
                        </Button>
                      )}
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  )
}
