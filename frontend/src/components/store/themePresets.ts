import type { Palette, ThemePreset } from './brandingTypes'

type DarkPalette = Partial<Palette>

function preset(
  id: string,
  name: string,
  palette: Palette,
  opts?: { description?: string; darkPalette?: DarkPalette },
): ThemePreset {
  return { id, name, palette, ...opts }
}

const neutralLight = (
  primary: string,
  accent: string,
  bg: string,
  surface: string,
  text: string,
  muted = '#64748b',
  border = '#e2e8f0',
): Palette => ({
  primaryColor: primary,
  accentColor: accent,
  backgroundColor: bg,
  surfaceColor: surface,
  textColor: text,
  mutedColor: muted,
  borderColor: border,
})

const MANA_PRESETS: ThemePreset[] = [
  preset('mana-white', 'White', neutralLight('#B45309', '#CA8A04', '#FFFDF7', '#FFFFFF', '#1C1917', '#78716C', '#E7E5E4'), {
    description: 'Warm ivory shop — amber gold primary, soft borders.',
  }),
  preset('mana-blue', 'Blue', neutralLight('#1D4ED8', '#94A3B8', '#F0F9FF', '#FFFFFF', '#0F172A', '#64748B', '#BAE6FD'), {
    description: 'Crisp sky background with royal blue buttons.',
  }),
  preset('mana-black', 'Black', neutralLight('#374151', '#9CA3AF', '#F4F4F5', '#FFFFFF', '#18181B', '#71717A', '#D4D4D8'), {
    description: 'Sleek zinc gray — power without muddy contrast.',
  }),
  preset('mana-red', 'Red', neutralLight('#DC2626', '#F59E0B', '#FEF2F2', '#FFFFFF', '#450A0A', '#B91C1C', '#FECACA'), {
    description: 'Bold red primary on a light rose page.',
  }),
  preset('mana-green', 'Green', neutralLight('#15803D', '#CA8A04', '#F0FDF4', '#FFFFFF', '#14532D', '#166534', '#BBF7D0'), {
    description: 'Fresh forest green with golden accent.',
  }),
  preset('mana-colorless', 'Colorless', neutralLight('#475569', '#CBD5E1', '#F8FAFC', '#FFFFFF', '#0F172A', '#64748B', '#E2E8F0'), {
    description: 'Artifact steel — neutral, professional, readable.',
  }),
]

const guild = (
  id: string,
  name: string,
  primary: string,
  _accent: string,
  bg: string,
  surface: string,
  text: string,
  muted: string,
  border: string,
  metallic: string,
): ThemePreset =>
  preset(id, name, {
    primaryColor: primary,
    accentColor: metallic,
    backgroundColor: bg,
    surfaceColor: surface,
    textColor: text,
    mutedColor: muted,
    borderColor: border,
  }, {
    description: 'Official-inspired two-color guild identity.',
    darkPalette: {
      primaryColor: primary,
      accentColor: metallic,
      backgroundColor: '#0f1220',
      surfaceColor: '#171b2e',
      textColor: '#f4f5fb',
      mutedColor: '#a6abc8',
      borderColor: '#2c3146',
    },
  })

const GUILD_PRESETS: ThemePreset[] = [
  guild('guild-azorius', 'Azorius', '#1D4ED8', '#E0F2FE', '#F8FAFC', '#FFFFFF', '#0F172A', '#64748B', '#CBD5E1', '#C0C0C0'),
  guild('guild-dimir', 'Dimir', '#4338CA', '#1E293B', '#F1F5F9', '#FFFFFF', '#0F172A', '#475569', '#CBD5E1', '#94A3B8'),
  guild('guild-rakdos', 'Rakdos', '#B91C1C', '#4C0519', '#FFF1F2', '#FFFFFF', '#450A0A', '#9F1239', '#FECDD3', '#D4AF37'),
  guild('guild-gruul', 'Gruul', '#EA580C', '#166534', '#FFF7ED', '#FFFFFF', '#431407', '#78716C', '#FED7AA', '#B8860B'),
  guild('guild-selesnya', 'Selesnya', '#16A34A', '#FEF9C3', '#F0FDF4', '#FFFFFF', '#14532D', '#4D7C0F', '#BBF7D0', '#D4AF37'),
  guild('guild-orzhov', 'Orzhov', '#57534E', '#FAFAF9', '#FAFAF9', '#FFFFFF', '#1C1917', '#78716C', '#E7E5E4', '#C0C0C0'),
  guild('guild-izzet', 'Izzet', '#0284C7', '#DC2626', '#F0F9FF', '#FFFFFF', '#0C4A6E', '#64748B', '#BAE6FD', '#EAB308'),
  guild('guild-golgari', 'Golgari', '#15803D', '#374151', '#F0FDF4', '#FFFFFF', '#14532D', '#4B5563', '#A7F3D0', '#A8A29E'),
  guild('guild-boros', 'Boros', '#DC2626', '#EA580C', '#FFF7ED', '#FFFFFF', '#7F1D1D', '#C2410C', '#FED7AA', '#FFD700'),
  guild('guild-simic', 'Simic', '#0D9488', '#0891B2', '#ECFEFF', '#FFFFFF', '#134E4A', '#0E7490', '#99F6E4', '#67E8F9'),
]

const SIGNATURE_PRESETS: ThemePreset[] = [
  preset(
    'holographic-foil',
    'Holographic Foil',
    neutralLight('#6366F1', '#EC4899', '#F8FAFC', '#FFFFFF', '#0F172A', '#64748B', '#E2E8F0'),
    {
      description: 'Cool silver page with indigo + pink foil accent.',
      darkPalette: {
        primaryColor: '#818CF8',
        accentColor: '#F472B6',
        backgroundColor: '#0F1117',
        surfaceColor: '#1A1D29',
        textColor: '#F8FAFC',
        mutedColor: '#94A3B8',
        borderColor: '#334155',
      },
    },
  ),
  preset(
    'artifact',
    'Artifact',
    neutralLight('#475569', '#2563EB', '#F1F5F9', '#FFFFFF', '#0F172A', '#64748B', '#CBD5E1'),
    { description: 'Gunmetal primary, electric blue accent.' },
  ),
  preset(
    'vintage-lgs',
    'Vintage LGS',
    neutralLight('#78350F', '#B45309', '#FAF5EB', '#FFFCF5', '#292524', '#78716C', '#E7E5E4'),
    { description: 'Parchment walls and walnut brown — cozy LGS.' },
  ),
  preset(
    'modern-minimal',
    'Modern Minimal',
    neutralLight('#334155', '#2563EB', '#FFFFFF', '#F8FAFC', '#0F172A', '#64748B', '#E2E8F0'),
    { description: 'White storefront, slate type, royal blue CTA.' },
  ),
  preset(
    'dragon',
    'Dragon',
    neutralLight('#B91C1C', '#EAB308', '#1C1414', '#2A2222', '#FEF2F2', '#A8A29E', '#44403C'),
    {
      description: 'Dark crimson hoard — use with dark mode toggle.',
      darkPalette: {
        primaryColor: '#EF4444',
        accentColor: '#FACC15',
        backgroundColor: '#0C0A0A',
        surfaceColor: '#1C1414',
        textColor: '#FEF2F2',
        mutedColor: '#A8A29E',
        borderColor: '#44403C',
      },
    },
  ),
  preset(
    'arcane',
    'Arcane',
    neutralLight('#6D28D9', '#06B6D4', '#0F0A1A', '#1A1430', '#F5F3FF', '#A78BFA', '#3730A3'),
    {
      description: 'Spellcaster purple with cyan sparks.',
      darkPalette: {
        primaryColor: '#A78BFA',
        accentColor: '#22D3EE',
        backgroundColor: '#0A0612',
        surfaceColor: '#141024',
        textColor: '#F5F3FF',
        mutedColor: '#C4B5FD',
        borderColor: '#3730A3',
      },
    },
  ),
  preset(
    'neon-cyber',
    'Neon Cyber',
    neutralLight('#7C3AED', '#22D3EE', '#111827', '#1F2937', '#F9FAFB', '#9CA3AF', '#374151'),
    {
      description: 'Graphite shop floor, neon purple + cyan.',
      darkPalette: {
        primaryColor: '#A78BFA',
        accentColor: '#67E8F9',
        backgroundColor: '#0A0A0F',
        surfaceColor: '#121218',
        textColor: '#F8FAFC',
        mutedColor: '#94A3B8',
        borderColor: '#475569',
      },
    },
  ),
  preset(
    'eldrazi',
    'Eldrazi',
    neutralLight('#5B21B6', '#C4B5FD', '#0F0A14', '#1A1225', '#EDE9FE', '#8B5CF6', '#4C1D95'),
    {
      description: 'Cosmic void violet — eerie but readable.',
      darkPalette: {
        primaryColor: '#8B5CF6',
        accentColor: '#DDD6FE',
        backgroundColor: '#050508',
        surfaceColor: '#0F0A14',
        textColor: '#EDE9FE',
        mutedColor: '#A78BFA',
        borderColor: '#5B21B6',
      },
    },
  ),
]

const CLASSIC_PRESETS: ThemePreset[] = [
  preset('classic-clean-light', 'Clean Light', {
    primaryColor: '#6d5efc',
    accentColor: '#ff7a59',
    backgroundColor: '#f7f8fa',
    surfaceColor: '#ffffff',
    textColor: '#0f172a',
    mutedColor: '#64748b',
    borderColor: '#e7e9ee',
  }),
  preset('classic-midnight', 'Midnight', {
    primaryColor: '#8b8cf7',
    accentColor: '#f472b6',
    backgroundColor: '#0f1220',
    surfaceColor: '#191d2e',
    textColor: '#f4f5fb',
    mutedColor: '#a6abc8',
    borderColor: '#2c3146',
  }, {
    darkPalette: {
      primaryColor: '#8b8cf7',
      accentColor: '#f472b6',
      backgroundColor: '#0f1220',
      surfaceColor: '#191d2e',
      textColor: '#f4f5fb',
      mutedColor: '#a6abc8',
      borderColor: '#2c3146',
    },
  }),
  preset('classic-spring', 'Spring Bloom', {
    primaryColor: '#2fb574',
    accentColor: '#ff7eb6',
    backgroundColor: '#f2fbf6',
    surfaceColor: '#ffffff',
    textColor: '#14342a',
    mutedColor: '#5f7d70',
    borderColor: '#d6ece0',
  }),
  preset('classic-summer', 'Summer Sun', {
    primaryColor: '#f5a524',
    accentColor: '#ff5d8f',
    backgroundColor: '#fff8ec',
    surfaceColor: '#ffffff',
    textColor: '#3a2a12',
    mutedColor: '#8a7355',
    borderColor: '#f3e3c9',
  }),
  preset('classic-pastel', 'Pastel Dream', {
    primaryColor: '#a78bfa',
    accentColor: '#f9a8d4',
    backgroundColor: '#faf7ff',
    surfaceColor: '#ffffff',
    textColor: '#4a3f5c',
    mutedColor: '#8b80a3',
    borderColor: '#ece6f9',
  }),
  preset('classic-ocean', 'Ocean Breeze', {
    primaryColor: '#2b8ad6',
    accentColor: '#18c2b3',
    backgroundColor: '#f0f8fc',
    surfaceColor: '#ffffff',
    textColor: '#0e2a3a',
    mutedColor: '#5b7689',
    borderColor: '#d4e8f2',
  }),
  preset('classic-forest', 'Forest Night', {
    primaryColor: '#4caf7d',
    accentColor: '#e6b85c',
    backgroundColor: '#0e2018',
    surfaceColor: '#163026',
    textColor: '#eaf5ee',
    mutedColor: '#9bbfaa',
    borderColor: '#274536',
  }, {
    darkPalette: {
      primaryColor: '#4caf7d',
      accentColor: '#e6b85c',
      backgroundColor: '#0e2018',
      surfaceColor: '#163026',
      textColor: '#eaf5ee',
      mutedColor: '#9bbfaa',
      borderColor: '#274536',
    },
  }),
  preset('classic-sunset', 'Sunset Coral', {
    primaryColor: '#ef5777',
    accentColor: '#ffa801',
    backgroundColor: '#fff4f1',
    surfaceColor: '#ffffff',
    textColor: '#3d1f24',
    mutedColor: '#9a6b71',
    borderColor: '#f6d9d3',
  }),
]

export interface ThemePresetCategory {
  id: string
  title: string
  subtitle: string
  /** Top-tier MTG-native categories show a star in the picker. */
  featured?: boolean
  defaultOpen?: boolean
  presets: ThemePreset[]
}

export const THEME_PRESET_CATEGORIES: ThemePresetCategory[] = [
  {
    id: 'mana',
    title: 'Mana colors',
    subtitle: 'MTG-native identity — pick White, Blue, Black, Red, Green, or Colorless as your store primary.',
    featured: true,
    defaultOpen: true,
    presets: MANA_PRESETS,
  },
  {
    id: 'guild',
    title: 'Guild themes',
    subtitle: 'Two-color guild palettes with metallic accents — Azorius through Simic.',
    featured: true,
    defaultOpen: false,
    presets: GUILD_PRESETS,
  },
  {
    id: 'signature',
    title: 'Signature themes',
    subtitle: 'Curated full-store moods from foil premium to cosmic Eldrazi.',
    featured: true,
    defaultOpen: false,
    presets: SIGNATURE_PRESETS,
  },
  {
    id: 'classic',
    title: 'Seasonal & classic',
    subtitle: 'Original platform presets — light, dark, and seasonal palettes.',
    defaultOpen: false,
    presets: CLASSIC_PRESETS,
  },
]

/** Flat list for backwards compatibility. */
export const THEME_PRESETS: ThemePreset[] = THEME_PRESET_CATEGORIES.flatMap((c) => c.presets)

export function findThemePresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id)
}
