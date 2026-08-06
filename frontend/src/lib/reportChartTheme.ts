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
  brand: '#6d5efc',
  brandMuted: '#8d7bff',
  accent: '#14b8a6',
  grid: '#e4e4e7',
  tick: '#71717a',
  tooltipBg: '#ffffff',
  tooltipBorder: '#e4e4e7',
  tooltipFg: '#18181b',
}

const DARK: ReportChartPalette = {
  brand: '#8b7dff',
  brandMuted: '#a99cff',
  accent: '#2dd4bf',
  grid: '#3f3f46',
  tick: '#a1a1aa',
  tooltipBg: '#18181b',
  tooltipBorder: '#3f3f46',
  tooltipFg: '#fafafa',
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
