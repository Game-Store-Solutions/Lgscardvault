import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import api, { extractErrorMessage } from '../api/client'
import { Button, Input } from './ui'

/**
 * URL input with an attached image-upload button: picking a file POSTs it
 * to /api/uploads and drops the returned path into the field, while the
 * input still accepts a pasted URL. Used for avatars and store branding.
 */
export function ImageUploadField({
  label,
  value,
  onChange,
  onUploadComplete,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  /** Fires after a successful file upload (in addition to onChange). */
  onUploadComplete?: (value: string) => void
  placeholder?: string
  hint?: string
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      // The api client defaults Content-Type to application/json; multipart
      // needs the real form type (axios fills in the boundary).
      const { data } = await api.post<{ url: string }>('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChange(data.url)
      onUploadComplete?.(data.url)
    } catch (uploadError) {
      setError(extractErrorMessage(uploadError, 'Could not upload the image.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Input
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          hint={hint}
          error={error ?? undefined}
        />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        aria-label={`Upload image for ${label}`}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void uploadFile(file)
          e.target.value = ''
        }}
      />
      {/* Aligns with the input, which sits under its label. */}
      <Button type="button" variant="secondary" className="mt-6" loading={uploading} onClick={() => fileInputRef.current?.click()}>
        <Upload aria-hidden className="size-4" />
        Upload
      </Button>
    </div>
  )
}

export default ImageUploadField
