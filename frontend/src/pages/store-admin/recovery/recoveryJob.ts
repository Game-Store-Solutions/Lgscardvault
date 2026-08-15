import type { CsvImportRow } from '../../../api/types'
import { shortRowReason } from './shortReason'

export type RecoveryJob = 'quantity' | 'price' | 'match' | 'online' | 'other'

/** What the right pane should ask — not the raw server sentence. */
export function recoveryJob(row: CsvImportRow): RecoveryJob {
  const reason = shortRowReason(row.error)
  if (reason === 'Invalid quantity') return 'quantity'
  if (reason === 'No market price') return 'price'
  if (reason === 'No catalog match' || reason === 'Needs a match') return 'match'
  if (reason === 'Online-only') return 'online'
  return 'other'
}

export function recoveryJobCopy(job: RecoveryJob): { title: string; hint: string } {
  switch (job) {
    case 'quantity':
      return { title: 'Fix the quantity', hint: 'Set how many copies to add. We match the printing from the sheet.' }
    case 'price':
      return { title: 'Set a sell price', hint: 'This printing has no market price. We fill one in from another printing when we have it — edit it, or pick that printing.' }
    case 'match':
      return { title: 'Find the card', hint: 'Pick a printing from the catalog. Browse all printings of the name — no extra tab.' }
    case 'online':
      return { title: 'Online-only printing', hint: 'Skip this Alchemy/Arena row, or switch to the paper printing.' }
    default:
      return { title: 'Fix this row', hint: 'Match a stockable printing, then add it.' }
  }
}

/** Same name + set + # + job + finish → one confirm can clear the cluster. */
export function recoveryClusterKey(row: CsvImportRow): string {
  return [
    row.name.trim().toLowerCase(),
    row.set.trim().toLowerCase(),
    row.collectorNumber.trim().toLowerCase(),
    recoveryJob(row),
    row.isFoil ? 'foil' : 'nonfoil',
  ].join('\t')
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
