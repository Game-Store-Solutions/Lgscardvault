import { Link } from 'react-router'
import { Wand2 } from 'lucide-react'
import { formatPrice } from '../../api/client'
import type { InventoryItem } from '../../api/types'
import type { SpellbookCombo } from '../../hooks'
import { Badge, Button, EmptyState, LoadingPanel } from '../../components/ui'
import { Reveal, Stagger, StaggerItem } from '../../components/motion'
import type { DeckBuilderNavState } from '../../lib/deckBuilder'
import { ComboPieceGrid } from './ComboPieceGrid'
import { colorPips } from './utils'

export function StoreCombosPanel({
  slug,
  loading,
  combos,
  identityCode,
  colorIdentity,
  filteredOutCount,
  signedIn,
  cartQtyByInventoryId,
  onAdd,
  cartPending,
  linkState,
}: {
  slug: string
  loading: boolean
  combos: SpellbookCombo[]
  identityCode?: string
  colorIdentity?: string[]
  filteredOutCount?: number
  signedIn: boolean
  cartQtyByInventoryId: Map<number, number>
  onAdd: (item: InventoryItem) => void
  cartPending: boolean
  linkState?: DeckBuilderNavState
}) {
  if (loading) {
    return <LoadingPanel label="Checking Commander Spellbook against store stock…" />
  }

  if (combos.length === 0) {
    return (
      <EmptyState
        icon={Wand2}
        title="No combos found yet"
        description="Commander Spellbook did not return combos legal in this commander’s color identity, or the store has none of the pieces in stock."
      />
    )
  }

  return (
    <div className="space-y-3">
      <Reveal immediate>
        <div className="rounded-card border border-border bg-surface px-4 py-3 text-sm">
          <p className="font-semibold text-fg">
            Legal in {identityCode || 'this identity'}
            <span className="ml-2 inline-flex align-middle">{colorPips(colorIdentity)}</span>
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Only pieces this store actually has on the shelf count as in stock (any printing of the same card). Colorless cards are always allowed. Combos are ranked complete-in-store first, then by coverage.
            {filteredOutCount ? ` Hidden ${filteredOutCount} off-identity combo${filteredOutCount === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
      </Reveal>
      <Stagger immediate gap={0.08} className="space-y-3">
        {combos.map((combo) => (
          <StaggerItem key={combo.id || combo.description}>
            <article className="rounded-card border border-border bg-surface p-3 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-fg">
                  {combo.inStockCount} of {combo.cards.length} pieces in stock here
                  {combo.completeInStore ? ' · all available here' : ''}
                </p>
                {combo.produces.length > 0 && (
                  <p className="mt-1 text-xs text-fg-muted">{combo.produces.slice(0, 3).join(' · ')}</p>
                )}
              </div>
              {combo.completeInStore && <Badge tone="success">Buyable here</Badge>}
            </div>
            {combo.description && (
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{combo.description}</p>
            )}
            <ComboPieceGrid pieces={combo.cards} storeSlug={slug} />
            {combo.cards.some((piece) => piece.inventoryItem) && (
              <ul className="mt-3 space-y-1.5">
                {combo.cards
                  .filter((piece) => piece.inventoryItem)
                  .map((piece) => (
                    <li
                      key={`${combo.id}-${piece.name}-buy`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-fg">
                        {piece.name}
                        {piece.isCommander ? ' · commander' : ''}
                        {piece.stockQuantity != null && piece.stockQuantity > piece.quantity
                          ? ` · ${piece.stockQuantity} available`
                          : ''}
                      </span>
                      {piece.inventoryItem && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-fg">
                            {formatPrice(piece.inventoryItem.priceCents)}
                          </span>
                          {signedIn && !cartQtyByInventoryId.has(piece.inventoryItem.id) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={cartPending}
                              onClick={() => onAdd(piece.inventoryItem!)}
                            >
                              Add
                            </Button>
                          ) : (
                            <Link
                              to={`/s/${slug}/cards/${piece.inventoryItem.id}`}
                              state={linkState}
                              className="text-xs font-semibold text-brand-600"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {combo.missing.length > 0 && (
              <p className="mt-2 text-xs text-fg-muted">
                Missing: {combo.missing.slice(0, 6).join(', ')}
                {combo.missing.length > 6 ? '…' : ''}
              </p>
            )}
            </article>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  )
}
