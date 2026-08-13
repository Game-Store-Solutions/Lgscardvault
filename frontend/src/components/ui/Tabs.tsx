import type { ComponentType, ReactNode } from 'react'
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
 * blocks as children to show panel content.
 */
export function Tabs({ tabs, value, onChange, children, className, ...rest }: TabsProps) {
  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={rest['aria-label'] ?? 'Tabs'}
        className="flex flex-wrap items-center gap-1 border-b border-border/70"
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
                'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold -mb-px',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-inset',
                selected
                  ? 'border-accent-500 text-fg'
                  : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {Icon && <Icon aria-hidden className="size-4" />}
              {tab.label}
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
    <div
      role="tabpanel"
      id={`tabpanel-${when}`}
      aria-labelledby={`tab-${when}`}
      className={className}
    >
      {children}
    </div>
  )
}
