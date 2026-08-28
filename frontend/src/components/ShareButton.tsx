import { useState } from 'react'
import { Check, Link2, Share2 } from 'lucide-react'
import { shareUrl } from '../lib/share'
import { trackEvent } from '../lib/analytics'
import { Button } from './ui'
import { cx } from '../lib/cx'

export function ShareButton({
  url,
  title,
  text,
  className,
  size = 'sm',
  label = 'Share',
}: {
  url: string
  title?: string
  text?: string
  className?: string
  size?: 'sm' | 'md'
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'shared'>('idle')

  async function handleShare() {
    const result = await shareUrl({ url, title, text })
    if (result === 'shared') {
      setState('shared')
      trackEvent('share', { method: 'native', url })
    } else if (result === 'copied') {
      setState('copied')
      trackEvent('share', { method: 'copy', url })
    }
    window.setTimeout(() => setState('idle'), 2000)
  }

  const icon =
    state === 'copied' ? (
      <Check aria-hidden className="size-4" />
    ) : state === 'shared' ? (
      <Share2 aria-hidden className="size-4" />
    ) : (
      <Link2 aria-hidden className="size-4" />
    )

  const buttonLabel =
    state === 'copied' ? 'Link copied' : state === 'shared' ? 'Shared' : label

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={cx(className)}
      onClick={() => void handleShare()}
    >
      {icon}
      {buttonLabel}
    </Button>
  )
}
