import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Pencil, Plus, Trash2, X } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/format'
import { Button, Card, CardBody, CardHeader, EmptyState, Input, LoadingPanel, Textarea } from '../../components/ui'

interface PatchNote {
  id: number
  title: string
  body: string
  createdAt: string
  updatedAt: string | null
}

const patchNotesKey = ['patch-notes'] as const

/**
 * Private platform changelog. Store admins read it; platform admins write it
 * (the editor only renders for super admins — the API enforces the same).
 */
export default function PatchNotesTab() {
  const { isSuperAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: notes = [], isLoading } = useQuery({
    queryKey: patchNotesKey,
    queryFn: async () => {
      const { data } = await api.get<PatchNote[]>('/patch-notes')
      return data
    },
  })

  const [editing, setEditing] = useState<PatchNote | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: patchNotesKey })

  const save = useMutation({
    mutationFn: async () => {
      if (editing) {
        await api.patch(`/admin/patch-notes/${editing.id}`, { title: title.trim(), body: body.trim() })
      } else {
        await api.post('/admin/patch-notes', { title: title.trim(), body: body.trim() })
      }
    },
    onSuccess: async () => {
      setTitle('')
      setBody('')
      setEditing(null)
      await invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/patch-notes/${id}`)
    },
    onSuccess: invalidate,
  })

  function startEdit(note: PatchNote) {
    setEditing(note)
    setTitle(note.title)
    setBody(note.body)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-fg">Patch notes</h2>
        <p className="mt-1 text-sm text-fg-muted">
          What changed on the platform — visible to store admins only.
        </p>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader
            title={editing ? `Editing “${editing.title}”` : 'Write a patch note'}
            actions={
              editing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(null)
                    setTitle('')
                    setBody('')
                  }}
                >
                  <X className="size-4" aria-hidden />
                  Cancel edit
                </Button>
              )
            }
          />
          <CardBody className="space-y-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="July update: kiosk orders, profit reports…" />
            <Textarea label="Notes" value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="What shipped, what changed, what to watch for…" />
            <div className="flex items-center gap-3">
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || !body.trim()}>
                <Plus className="size-4" aria-hidden />
                {editing ? 'Save changes' : 'Publish note'}
              </Button>
              {save.isError && (
                <span role="alert" className="text-sm font-medium text-danger-700">
                  {extractErrorMessage(save.error, 'Could not save the patch note.')}
                </span>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <LoadingPanel />
      ) : notes.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon={Megaphone} title="No patch notes yet" description="Platform updates will be posted here." />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardHeader
                title={note.title}
                subtitle={`${formatDate(note.createdAt)}${note.updatedAt ? ` · edited ${formatDate(note.updatedAt)}` : ''}`}
                actions={
                  isSuperAdmin && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(note)} aria-label={`Edit ${note.title}`}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={remove.isPending && remove.variables === note.id}
                        onClick={() => {
                          if (window.confirm(`Delete patch note "${note.title}"?`)) remove.mutate(note.id)
                        }}
                        aria-label={`Delete ${note.title}`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )
                }
              />
              <CardBody>
                <p className="whitespace-pre-wrap text-sm leading-6 text-fg">{note.body}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
