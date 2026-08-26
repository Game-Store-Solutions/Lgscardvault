/** Beat index to open when resuming a module from saved progress. */
export function resumeBeatIndex(doneBeats: number, total: number): number {
  if (total <= 0) return 0
  if (doneBeats >= total) return 0
  return Math.min(Math.max(0, doneBeats), total - 1)
}
