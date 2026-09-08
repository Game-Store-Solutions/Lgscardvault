import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import api, { extractErrorMessage } from '../../api/client'
import { PROFILE_COVER_PRESETS, normalizeCoverColor } from '../../lib/profileCover'
import { Button } from '../ui'
import { cx } from '../../lib/cx'

export function ProfileCoverEditor({
  imageUrl,
  color,
  onSave,
  saving,
  compact = false,
}: {
  imageUrl?: string | null
  color?: string | null
  onSave: (next: { coverImageUrl: string | null; coverColor: string | null }) => void
  saving?: boolean
  compact?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customColor, setCustomColor] = useState(color ?? '#0a1627')

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<{ url: string }>('/uploads', form)
      return data.url
    },
    onSuccess: (url) => onSave({ coverImageUrl: url, coverColor: color ?? null }),
  })

  return (
    <div className={cx('space-y-4', compact && 'space-y-3')}>
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-fg-muted">Color</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {PROFILE_COVER_PRESETS.map((preset) => {
            const selected = (color ?? null) === preset.color
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={selected}
                disabled={saving}
                onClick={() => onSave({ coverImageUrl: imageUrl ?? null, coverColor: preset.color })}
                className={cx(
                  'size-8 overflow-hidden rounded-full border-2 transition-transform hover:scale-105',
                  selected ? 'border-fg' : 'border-transparent ring-1 ring-border',
                )}
                style={
                  preset.color
                    ? { backgroundColor: preset.color }
                    : undefined
                }
              >
                {preset.color ? null : (
                  <span className="block size-full bg-gradient-to-br from-brand-200 via-brand-100 to-accent-500/50 dark:from-brand-800 dark:via-brand-900 dark:to-brand-950" />
                )}
              </button>
            )
          })}
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="color"
              aria-label="Custom cover color"
              value={normalizeCoverColor(customColor) ?? '#0a1627'}
              disabled={saving}
              onChange={(event) => {
                const next = event.target.value
                setCustomColor(next)
                onSave({ coverImageUrl: imageUrl ?? null, coverColor: next.toLowerCase() })
              }}
              className="size-8 cursor-pointer rounded-full border border-border bg-surface p-0.5"
            />
            Custom
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          aria-label="Upload cover image"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload.mutate(file)
            event.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={upload.isPending}
          disabled={saving}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus aria-hidden className="size-4" />
          {imageUrl ? 'Replace photo' : 'Add photo'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving || (!imageUrl && !color)}
          onClick={() => onSave({ coverImageUrl: null, coverColor: null })}
        >
          Use default
        </Button>
      </div>

      {upload.isError ? (
        <p role="alert" className="text-sm text-danger-700">
          {extractErrorMessage(upload.error, 'Could not upload that image.')}
        </p>
      ) : null}
    </div>
  )
}
