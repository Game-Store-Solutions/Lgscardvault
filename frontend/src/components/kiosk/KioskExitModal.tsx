import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import api, { extractErrorMessage } from '../../api/client'
import { Button, Input, Modal } from '../ui'

export function KioskExitModal({
  open,
  slug,
  onClose,
  onUnlocked,
}: {
  open: boolean
  slug: string
  onClose: () => void
  onUnlocked: () => void
}) {
  const [code, setCode] = useState('')

  const verify = useMutation({
    mutationFn: async () => {
      await api.post(`/stores/${slug}/kiosk/verify-exit`, { code: code.trim() })
    },
    onSuccess: () => {
      setCode('')
      onUnlocked()
    },
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        setCode('')
        verify.reset()
        onClose()
      }}
      title="Exit kiosk mode"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setCode('')
              verify.reset()
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={verify.isPending}
            disabled={code.trim().length < 4}
            onClick={() => verify.mutate()}
          >
            Unlock
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length >= 4) verify.mutate()
        }}
      >
        <p className="text-sm text-fg-muted">
          Enter the kiosk exit code from Admin settings to leave customer shopping mode.
        </p>
        <Input
          label="Exit code"
          type="password"
          autoComplete="off"
          inputMode="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        {verify.isError && (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {extractErrorMessage(verify.error, 'Incorrect exit code.')}
          </p>
        )}
      </form>
    </Modal>
  )
}
