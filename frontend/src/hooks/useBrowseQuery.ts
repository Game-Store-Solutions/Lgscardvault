import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDebouncedValue } from './useDebouncedValue'

/** Draft + URL `q=` for artist/set browse search. */
export function useBrowseQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [draft, setDraft] = useState(query)
  const debounced = useDebouncedValue(draft, 200)

  useEffect(() => {
    setDraft(query)
  }, [query])

  useEffect(() => {
    const nextVal = debounced.trim()
    if (nextVal === query.trim()) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (nextVal) {
          next.set('q', nextVal)
        } else {
          next.delete('q')
        }
        return next
      },
      { replace: true },
    )
  }, [debounced, query, setSearchParams])

  return { draft, setDraft, query: query.trim() }
}
