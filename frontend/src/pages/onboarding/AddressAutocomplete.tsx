import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPin, Search } from 'lucide-react'
import api from '../../api/client'
import type { GeocodeSuggestion } from '../../api/types'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { Field, dropdownItemClass, dropdownPanelClass } from '../../components/ui'
import { cx } from '../../lib/cx'

/**
 * Address search-as-you-type. Queries the server-side geocode proxy (Mapbox,
 * with a mock fallback in dev) and, on selection, hands the full parsed address
 * back so the caller can autofill its fields.
 */
export function AddressAutocomplete({
  onSelect,
  country,
}: {
  onSelect: (suggestion: GeocodeSuggestion) => void
  country?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(query, 300)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['geocode', debounced, country ?? ''],
    queryFn: async () => {
      const { data } = await api.post<{ suggestions: GeocodeSuggestion[] }>('/geocode/search', {
        query: debounced,
        country: country || undefined,
      })
      return data.suggestions
    },
    enabled: debounced.trim().length >= 3,
    staleTime: 60_000,
  })

  const suggestions = data ?? []

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function choose(suggestion: GeocodeSuggestion) {
    onSelect(suggestion)
    setQuery(suggestion.label)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <Field label="Search for your address" hint="Start typing, then pick a result to autofill.">
        {({ id }) => (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted">
              {isFetching ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Search aria-hidden className="size-4" />}
            </span>
            <input
              id={id}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              autoComplete="off"
              placeholder="e.g. 123 Main St"
              className="h-10 w-full rounded-btn border border-border bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
        )}
      </Field>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className={cx(dropdownPanelClass, 'absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto py-1')}
        >
          {suggestions.map((s, i) => (
            <li key={`${s.label}-${i}`}>
              <button
                type="button"
                onClick={() => choose(s)}
                className={dropdownItemClass({})}
              >
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressAutocomplete
