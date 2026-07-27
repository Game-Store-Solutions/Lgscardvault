import { Link, Outlet } from 'react-router'
import { ArrowLeft, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks'

/**
 * AuthLayout — a full-screen shell for the sign-in / register flow (no app
 * navbar). Pages render an immersive split: a branded image panel beside a
 * focused form. Floating controls (back to marketplace + theme) sit top-right.
 */
export default function AuthLayout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="pointer-events-none fixed right-4 top-4 z-30 flex items-center gap-2">
        <Link
          to="/"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/85 px-3.5 py-2 text-sm font-medium text-fg-muted shadow-sm backdrop-blur transition-colors hover:text-brand-600"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Marketplace
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="pointer-events-auto grid size-9 place-items-center rounded-full border border-border bg-surface/85 text-fg-muted shadow-sm backdrop-blur transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {theme === 'dark' ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
        </button>
      </div>
      <Outlet />
    </div>
  )
}
