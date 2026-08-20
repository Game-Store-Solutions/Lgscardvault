import { Search, X } from 'lucide-react'
import { Input } from '../ui'

/** Search box for artist / set browse — icon, clear, and a live result count. */
export function BrowseSearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  resultCount,
  totalCount,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  resultCount: number
  totalCount: number
}) {
  const filtering = value.trim().length > 0

  return (
    <Input
      id={id}
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      wrapperClassName="min-w-0 flex-1"
      leading={<Search aria-hidden className="size-4" />}
      trailing={
        filtering ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="grid size-7 place-items-center rounded-btn text-fg-muted hover:text-fg"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null
      }
      hint={
        filtering
          ? `${resultCount} of ${totalCount} printing${totalCount === 1 ? '' : 's'}`
          : undefined
      }
    />
  )
}
