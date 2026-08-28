import type { IntelligenceProvenance } from '../../hooks'
import { ManaSymbol } from '../../components/mtg/ManaSymbol'
import { parseDeckBuilderBracket } from '../../lib/deckBuilder'

export type DeckBracket = ReturnType<typeof parseDeckBuilderBracket>

export function colorPips(identity: string[] | undefined) {
  const colors = identity && identity.length > 0 ? identity : ['C']
  return (
    <span className="inline-flex items-center gap-0.5">
      {colors.map((c) => (
        <ManaSymbol key={c} symbol={c} className="size-4" />
      ))}
    </span>
  )
}

export function intelligenceSummary(intel: IntelligenceProvenance | undefined): string | null {
  if (!intel) return null
  const conf = Math.round(intel.confidence * 100)
  const sample = intel.sampleSize
  const scope = intel.exactMatch
    ? 'exact strategy match'
    : `fallback · ${intel.level.replaceAll('_', ' ')}`
  return `${conf}% confidence · ${sample} reference deck${sample === 1 ? '' : 's'} · ${scope}`
}

export function publicRecommendationReasons(reasons: string[]): string[] {
  return reasons.filter(
    (reason) => !reason.startsWith('Appears in') && !reason.includes('reference deck'),
  )
}
