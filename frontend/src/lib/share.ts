export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'absolute'
    el.style.left = '-9999px'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lgscardvault.com'
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

export async function shareUrl(opts: {
  url: string
  title?: string
  text?: string
}): Promise<'shared' | 'copied' | 'failed'> {
  const url = absoluteUrl(opts.url)
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title: opts.title, text: opts.text })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'failed'
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}
