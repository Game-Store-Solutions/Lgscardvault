import type { ComponentType, ReactNode, SVGProps } from 'react'
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  CreditCard,
  Heart,
  LayoutDashboard,
  List,
  Package,
  Settings,
  Store,
  Wallet,
} from 'lucide-react'
import { cx } from '../../lib/cx'

export type ProfileIconProps = SVGProps<SVGSVGElement>

function Svg({ className, children, ...props }: ProfileIconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  )
}

/** Profile — shield badge */
export function IconShieldBadge({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
      <circle cx="12" cy="11" r="2.5" fill="currentColor" stroke="none" opacity="0.35" />
      <path d="M12 9v4M10.5 11h3" />
    </Svg>
  )
}

/** Orders — stacked packages */
export function IconPackageStack({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M12 3 4 7l8 4 8-4-8-4z" />
      <path d="M4 7v6l8 4 8-4V7" />
      <path d="M8 10.5 12 12.5l4-2" opacity="0.55" />
    </Svg>
  )
}

/** Favorites — heart with crystal facet */
export function IconHeartCrystal({ className, ...props }: ProfileIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...props}>
      <path
        d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"
        fill="currentColor"
        fillOpacity="0.22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 8 9.5 12h5L12 8z" fill="currentColor" stroke="none" opacity="0.45" />
      <path d="M12 8v9M9 12h6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
    </svg>
  )
}

/** Want list — scroll */
export function IconScroll({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M8 4h9a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2z" />
      <path d="M8 4a2 2 0 0 0-2 2v12" />
      <path d="M10 9h6M10 12h5M10 15h4" />
    </Svg>
  )
}

/** Sell / trade — crossing cards */
export function IconCrossingCards({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <rect x="3" y="6" width="11" height="14" rx="1.5" transform="rotate(-12 8.5 13)" />
      <rect x="10" y="4" width="11" height="14" rx="1.5" transform="rotate(10 15.5 11)" />
      <path d="M7 10h3M7 13h2" transform="rotate(-12 8.5 13)" />
      <path d="M14 9h3M14 12h2" transform="rotate(10 15.5 11)" />
    </Svg>
  )
}

/** Store credit — treasure chest */
export function IconTreasureChest({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M4 10h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9z" />
      <path d="M4 10c0-2 2.5-4 8-4s8 2 8 4" />
      <path d="M12 6v4" />
      <rect x="9" y="13" width="6" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.25" />
    </Svg>
  )
}

/** Notifications — bell with sparkle */
export function IconMagicBell({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M18 16H6l1.2-1.5A4 4 0 0 0 8 11V8a4 4 0 1 1 8 0v3a4 4 0 0 0 .8 3.5L18 16z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
      <path d="M18 5l1 1M20 8h1.5M17 3v1.5" strokeWidth="1.5" />
    </Svg>
  )
}

/** Cart — deck box */
export function IconDeckBox({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8z" />
      <path d="M5 8 12 4l7 4" />
      <path d="M12 4v5" />
      <rect x="8" y="12" width="8" height="4" rx="0.5" fill="currentColor" stroke="none" opacity="0.2" />
    </Svg>
  )
}

/** Browse — binder */
export function IconBinder({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <path d="M5 4h12a2 2 0 0 1 2 2v14H5V4z" />
      <path d="M5 4v16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h1z" fill="currentColor" opacity="0.15" stroke="none" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="8" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="0.75" fill="currentColor" stroke="none" />
      <path d="M11 8h6M11 12h5M11 16h6" />
    </Svg>
  )
}

/** Payments — coin stack */
export function IconCoinStack({ className, ...props }: ProfileIconProps) {
  return (
    <Svg className={className} {...props}>
      <ellipse cx="12" cy="7" rx="6" ry="2.5" />
      <path d="M6 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7" />
      <path d="M6 11v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4" opacity="0.75" />
      <path d="M8 16.5h8" strokeWidth="1.5" opacity="0.5" />
    </Svg>
  )
}

/** Account hub — same shield badge, softer default */
export function IconAccountHub(props: ProfileIconProps) {
  return <IconShieldBadge {...props} />
}

type IconComponent = ComponentType<ProfileIconProps>

/** Apply nav tint classes without losing stroke/fill styling. */
export function tintIcon(Icon: IconComponent, tintClasses: string): IconComponent {
  return function TintedIcon({ className, ...props }) {
    return <Icon className={cx(tintClasses, className)} {...props} />
  }
}

/** Store customer profile — sidebar + stats */
export const storeActivityIcons = {
  profile: LayoutDashboard,
  orders: Package,
  favorites: Heart,
  wantlist: List,
  selltrade: ArrowLeftRight,
  credit: Wallet,
  notifications: Bell,
} as const

export const storeAsideIcons = {
  browse: BookOpen,
  sellTrade: ArrowLeftRight,
  cart: Package,
  account: LayoutDashboard,
  payments: CreditCard,
} as const

/** Global /account sidebar */
export const accountNavIcons = {
  overview: LayoutDashboard,
  stores: Store,
  decks: BookOpen,
  payment: CreditCard,
  orders: Package,
  settings: Settings,
} as const
