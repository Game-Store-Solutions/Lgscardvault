import { Link } from 'react-router'
import { BrandLogo } from '../BrandLogo'

const FOOTER_LINKS = [
  { label: 'Shop', to: '/stores' },
  { label: 'TCGs', to: '/#tcgs' },
  { label: 'Collections', to: '/#collections' },
  { label: 'Sell', to: '/#sell' },
  { label: 'About', to: '/#about' },
]

export function PlatformFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#09090b]">
      <div className="mx-auto grid max-w-[96rem] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <div className="space-y-4">
          <BrandLogo size="lg" withWordmark to="/" />
          <p className="max-w-md text-sm leading-6 text-fg-muted">
            A premium destination for trading card collectors, buyers, and sellers. Shop real inventory from trusted local game stores.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-fg-muted">Marketplace</h2>
            <div className="mt-4 grid gap-3">
              {FOOTER_LINKS.map((link) => (
                <Link key={link.label} to={link.to} className="text-sm text-fg transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-fg-muted">Legal</h2>
            <div className="mt-4 grid gap-3">
              <Link to="/" className="text-sm text-fg transition hover:text-white">
                Contact
              </Link>
              <Link to="/" className="text-sm text-fg transition hover:text-white">
                Privacy
              </Link>
              <Link to="/" className="text-sm text-fg transition hover:text-white">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default PlatformFooter
