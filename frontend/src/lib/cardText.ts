/**
 * Card text from TCGCSV arrives as HTML — rules text uses <br> between
 * lines. It is flattened at sync time, but cards synced before that fix (or
 * any other stray markup) would otherwise render the tags as literal text,
 * since React escapes them. This is the display-side safety net.
 */
export function plainCardText(text: string): string {
  if (!text.includes('<') && !text.includes('&')) return text

  const withBreaks = text
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')

  // Decode the entities an HTML source brings with it (&#39;, &amp;, …).
  const decoded =
    typeof document === 'undefined'
      ? withBreaks
      : (() => {
          const el = document.createElement('textarea')
          el.innerHTML = withBreaks
          return el.value
        })()

  return decoded.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
