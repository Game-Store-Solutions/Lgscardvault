import { useMemo } from 'react'
import type { Theme } from '../hooks/useTheme'

export interface ReportChartPalette {
  brand: string
  brandMuted: string
  accent: string
  grid: string
  tick: string
  tooltipBg: string
  tooltipBorder: string
  tooltipFg: string
}

const LIGHT: ReportChartPalette = {
  brand: '#0a1627',
  brandMuted: '#5c7494',
  accent: '#c6a035',
  grid: '#e5e7eb',
  tick: '#6b7280',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e5e7eb',
  tooltipFg: '#0a0a0b',
}

const DARK: ReportChartPalette = {
  brand: '#dc2626',
  brandMuted: '#ef4444',
  accent: '#a3a3a3',
  grid: '#262626',
  tick: '#a3a3a3',
  tooltipBg: '#171717',
  tooltipBorder: '#262626',
  tooltipFg: '#f5f5f5',
}

export function chartPalette(theme: Theme): ReportChartPalette {
  return theme === 'dark' ? DARK : LIGHT
}

/** Channel + status series colors (stable order). */
export function chartSeriesColors(theme: Theme): string[] {
  const p = chartPalette(theme)
  return [p.brand, p.accent, p.brandMuted, '#f59e0b', '#ec4899', '#64748b']
}

export function useChartPalette(theme: Theme): ReportChartPalette {
  return useMemo(() => chartPalette(theme), [theme])
}
