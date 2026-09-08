import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { Button, Input } from '../ui'
import { ImageUploadField } from '../ImageUploadField'
import { ProfileCoverEditor } from '../profile/ProfileCoverEditor'

/**
 * Platform-wide identity settings: display name, profile image, password,
 * and account deletion. Lives on the global /account page — this is the
 * one account the customer carries into every store.
 */
export function AccountSettingsPanel() {
  const { user, refreshUser, logout } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(user?.coverImageUrl ?? '')
  const [coverColor, setCoverColor] = useState(user?.coverColor ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)

  useEffect(() => {
    setCoverImageUrl(user?.coverImageUrl ?? '')
    setCoverColor(user?.coverColor ?? '')
  }, [user?.coverImageUrl, user?.coverColor])

  const saveProfile = useMutation({
    mutationFn: async (payload: {
      displayName?: string
      avatarUrl?: string
      coverImageUrl?: string | null
      coverColor?: string | null
    } = {}) => {
      await api.patch('/me', {
        displayName: (payload.displayName ?? displayName).trim(),
        avatarUrl: (payload.avatarUrl ?? avatarUrl).trim(),
        coverImageUrl: payload.coverImageUrl !== undefined ? payload.coverImageUrl : coverImageUrl.trim() || null,
        coverColor: payload.coverColor !== undefined ? payload.coverColor : coverColor.trim() || null,
      })
    },
    onSuccess: () => void refreshUser(),
  })

  const changePassword = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error('New passwords do not match.')
      await api.post('/me/password', { currentPassword, newPassword })
    },
    onSuccess: () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    },
  })

  const deleteAccount = useMutation({
    mutationFn: async () => {
      await api.delete('/me', { data: { password: deletePassword } })
    },
    onSuccess: () => logout(),
  })

  return (
    <div className="max-w-3xl divide-y divide-border">
      <section className="pb-8">
        <h3 className="text-lg font-extrabold tracking-tight text-fg">Account</h3>
        <p className="mt-1 text-sm text-fg-muted">Your name, photo, and profile cover — shown across every store.</p>
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-bg text-lg font-bold text-fg-muted">
              {avatarUrl.trim() ? (
                <img src={avatarUrl.trim()} alt="" className="size-full object-cover" />
              ) : (
                (user?.displayName ?? '?').slice(0, 2).toUpperCase()
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={255} />
              <ImageUploadField
                label="Profile image"
                value={avatarUrl}
                onChange={setAvatarUrl}
                onUploadComplete={(url) => {
                  setAvatarUrl(url)
                  saveProfile.mutate({ displayName: displayName.trim() || user?.displayName || '', avatarUrl: url })
                }}
                placeholder="https://…/me.jpg (blank = initials)"
                hint="Upload a picture or paste an image URL, then save if you only paste a URL."
              />
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-extrabold text-fg">Cover</p>
            <ProfileCoverEditor
              imageUrl={coverImageUrl || null}
              color={coverColor || null}
              saving={saveProfile.isPending}
              onSave={(next) => {
                setCoverImageUrl(next.coverImageUrl ?? '')
                setCoverColor(next.coverColor ?? '')
                saveProfile.mutate({
                  displayName: displayName.trim() || user?.displayName || '',
                  coverImageUrl: next.coverImageUrl,
                  coverColor: next.coverColor,
                })
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => saveProfile.mutate({})} loading={saveProfile.isPending} disabled={!displayName.trim()}>
              <Save aria-hidden className="size-4" />
              Save account
            </Button>
            {saveProfile.isSuccess && (
              <span role="status" className="text-sm font-medium text-success-700">Saved.</span>
            )}
            {saveProfile.isError && (
              <span role="alert" className="text-sm font-medium text-danger-700">Could not save your account.</span>
            )}
          </div>
        </div>
      </section>

      <section className="py-8">
        <h3 className="text-lg font-extrabold tracking-tight text-fg">Change password</h3>
        <p className="mt-1 text-sm text-fg-muted">Use at least 8 characters.</p>
        <div className="mt-5 space-y-4">
          <Input label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            <Input label="Confirm new" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => changePassword.mutate()}
              loading={changePassword.isPending}
              disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword}
            >
              Update password
            </Button>
            {changePassword.isSuccess && (
              <span role="status" className="text-sm font-medium text-success-700">Password updated.</span>
            )}
            {changePassword.isError && (
              <span role="alert" className="text-sm font-medium text-danger-700">
                {(changePassword.error as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ??
                  (changePassword.error as Error)?.message ??
                  'Could not update your password.'}
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="py-8">
        <h3 className="text-lg font-extrabold tracking-tight text-danger-700">Delete account</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Removes your account, carts, favorites, want lists, and notifications everywhere. This cannot be undone.
        </p>
        <div className="mt-5 space-y-3">
          {!deleteArmed ? (
            <Button variant="ghost" className="text-danger-700" onClick={() => setDeleteArmed(true)}>
              <Trash2 aria-hidden className="size-4" />
              Delete my account…
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-64">
                <Input
                  label="Confirm with your password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <Button
                variant="ghost"
                className="text-danger-700"
                loading={deleteAccount.isPending}
                disabled={!deletePassword}
                onClick={() => deleteAccount.mutate()}
              >
                <Trash2 aria-hidden className="size-4" />
                Permanently delete
              </Button>
              <Button variant="secondary" onClick={() => setDeleteArmed(false)}>
                Cancel
              </Button>
            </div>
          )}
          {deleteAccount.isError && (
            <p role="alert" className="text-sm font-medium text-danger-700">
              {(deleteAccount.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
                'Could not delete your account.'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

export default AccountSettingsPanel
