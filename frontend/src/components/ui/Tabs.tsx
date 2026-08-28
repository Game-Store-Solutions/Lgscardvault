import type { ComponentType, ReactNode } from 'react'
import { useId } from 'react'
import { motion } from 'framer-motion'
import { EASE_PREMIUM } from '../motion'
import { cx } from '../../lib/cx'

export interface TabItem {
  id: string
  label: ReactNode
  /** Any icon component taking a className — lucide icons or tinted wrappers. */
  icon?: ComponentType<{ className?: string }>
}

export interface TabsProps {
  tabs: TabItem[]
  value: string
  onChange: (id: string) => void
  children?: ReactNode
  className?: string
  'aria-label'?: string
}

/**
 * Tabs — controlled, accessible tablist. Render <TabPanel when=... value=...>
 * blocks as children to show panel content. The active underline slides between
 * tabs via a shared layout animation instead of snapping.
 */
export function Tabs({ tabs, value, onChange, children, className, ...rest }: TabsProps) {
  // Scoped so multiple Tabs on one page don't share (and fight over) the indicator.
  const indicatorId = useId()

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={rest['aria-label'] ?? 'Tabs'}
        className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-border/70 px-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              role="tab"
              type="button"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cx(
                'relative inline-flex min-h-11 shrink-0 touch-manipulation items-center gap-2 px-3.5 py-2.5 text-sm font-bold -mb-px sm:min-h-0 sm:px-4',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-inset',
                selected ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {Icon && <Icon aria-hidden className="size-4" />}
              {tab.label}
              {selected && (
                <motion.span
                  layoutId={`tab-indicator-${indicatorId}`}
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent-500"
                  transition={{ duration: 0.28, ease: EASE_PREMIUM }}
                />
              )}
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}

export interface TabPanelProps {
  /** Panel id this content belongs to. */
  when: string
  /** Currently active tab id. */
  value: string
  children: ReactNode
  className?: string
}

export function TabPanel({ when, value, children, className }: TabPanelProps) {
  if (when !== value) return null
  return (
    <motion.div
      role="tabpanel"
      id={`tabpanel-${when}`}
      aria-labelledby={`tab-${when}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_PREMIUM }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
