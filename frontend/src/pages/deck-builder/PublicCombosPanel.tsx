import { Wand2 } from 'lucide-react'
import type { SpellbookCombo } from '../../hooks'
import { EmptyState, LoadingPanel } from '../../components/ui'
import { ComboPieceGrid } from './ComboPieceGrid'
import { colorPips } from './utils'
export function PublicCombosPanel({
  loading,
  combos,
  identityCode,
  colorIdentity,
  filteredOutCount,
}: {
  loading: boolean
  combos: SpellbookCombo[]
  identityCode?: string
  colorIdentity?: string[]
  filteredOutCount?: number
}) {
  if (loading) {
    return <LoadingPanel label="Checking Commander Spellbook combos…" />
  }

  if (combos.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No combos found yet"
        description="Commander Spellbook did not return combos legal in this commander’s color identity."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-card border border-border bg-surface px-4 py-3 text-sm">
        <p className="font-semibold text-fg">
          Legal in {identityCode || 'this identity'}
          <span className="ml-2 inline-flex align-middle">{colorPips(colorIdentity)}</span>
        </p>
        <p className="mt-1 text-xs text-fg-muted">
          Combos come from Commander Spellbook and are filtered to this commander’s color identity.
          {filteredOutCount ? ` Hidden ${filteredOutCount} off-identity combo${filteredOutCount === 1 ? '' : 's'}.` : ''}
        </p>
      </div>
      <ul className="space-y-3">
        {combos.map((combo) => (
          <li key={combo.id || combo.description} className="rounded-card border border-border bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-fg">
                  {combo.cards.length} piece{combo.cards.length === 1 ? '' : 's'}
                </p>
                {combo.produces.length > 0 && (
                  <p className="mt-1 text-xs text-fg-muted">{combo.produces.slice(0, 3).join(' · ')}</p>
                )}
              </div>
            </div>
            {combo.description && (
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{combo.description}</p>
            )}
            <ComboPieceGrid pieces={combo.cards} />
            {combo.missing.length > 0 && (
              <p className="mt-2 text-xs text-fg-muted">
                Missing: {combo.missing.slice(0, 6).join(', ')}
                {combo.missing.length > 6 ? '…' : ''}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
