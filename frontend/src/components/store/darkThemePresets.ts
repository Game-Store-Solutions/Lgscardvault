import type { Palette, ThemePreset } from './brandingTypes'
import type { ThemePresetCategory } from './themePresets'

/** Dark-mode preset: `palette` is the full dark shopper palette. */
function darkPreset(id: string, name: string, palette: Palette, description?: string): ThemePreset {
  return { id, name, palette, description }
}

function darkFull(
  primary: string,
  accent: string,
  bg: string,
  surface: string,
  text: string,
  muted: string,
  border: string,
): Palette {
  return {
    primaryColor: primary,
    accentColor: accent,
    backgroundColor: bg,
    surfaceColor: surface,
    textColor: text,
    mutedColor: muted,
    borderColor: border,
  }
}

const DARK_MANA_PRESETS: ThemePreset[] = [
  darkPreset(
    'dark-mana-white',
    'White',
    darkFull('#FBBF24', '#FDE68A', '#141210', '#1F1C18', '#FAF8F5', '#A8A29E', '#3D3830'),
    'Warm charcoal with bright gold buttons.',
  ),
  darkPreset(
    'dark-mana-blue',
    'Blue',
    darkFull('#60A5FA', '#94A3B8', '#0A1628', '#111F2E', '#EFF6FF', '#93C5FD', '#1E3A8A'),
    'Deep navy with crisp blue CTAs.',
  ),
  darkPreset(
    'dark-mana-black',
    'Black',
    darkFull('#9CA3AF', '#D1D5DB', '#080808', '#121212', '#E5E5E5', '#737373', '#2A2A2A'),
    'Ambition on void black with steel accent.',
  ),
  darkPreset(
    'dark-mana-red',
    'Red',
    darkFull('#EF4444', '#F59E0B', '#140808', '#221010', '#FEE2E2', '#B8866B', '#451A1A'),
    'Ember and chaos. Gold spark on crimson shadow.',
  ),
  darkPreset(
    'dark-mana-green',
    'Green',
    darkFull('#22C55E', '#CA8A04', '#081410', '#0F2018', '#DCFCE7', '#6B9B7A', '#14532D'),
    'Deep forest with golden druid highlights.',
  ),
  darkPreset(
    'dark-mana-colorless',
    'Colorless',
    darkFull('#94A3B8', '#CBD5E1', '#0F1115', '#181B22', '#E2E8F0', '#64748B', '#334155'),
    'Artifact vault. Gunmetal and silver.',
  ),
]

const darkGuild = (
  id: string,
  name: string,
  primary: string,
  metallic: string,
  bg: string,
  surface: string,
  text: string,
  muted: string,
  border: string,
): ThemePreset =>
  darkPreset(id, name, darkFull(primary, metallic, bg, surface, text, muted, border), 'Guild identity tuned for dark mode.')

const DARK_GUILD_PRESETS: ThemePreset[] = [
  darkGuild('dark-guild-azorius', 'Azorius', '#60A5FA', '#C0C0C0', '#0A1020', '#121A30', '#EFF6FF', '#93C5FD', '#1E3A8A'),
  darkGuild('dark-guild-dimir', 'Dimir', '#818CF8', '#94A3B8', '#0A0A12', '#12121F', '#E0E7FF', '#6366F1', '#312E81'),
  darkGuild('dark-guild-rakdos', 'Rakdos', '#F87171', '#D4AF37', '#140A0C', '#1F1014', '#FEE2E2', '#FB7185', '#7F1D1D'),
  darkGuild('dark-guild-gruul', 'Gruul', '#FB923C', '#B8860B', '#120C08', '#1A1410', '#FFEDD5', '#C2410C', '#431407'),
  darkGuild('dark-guild-selesnya', 'Selesnya', '#4ADE80', '#D4AF37', '#081410', '#0F2018', '#DCFCE7', '#22C55E', '#14532D'),
  darkGuild('dark-guild-orzhov', 'Orzhov', '#D1D5DB', '#C0C0C0', '#0F0F0E', '#1A1918', '#F5F5F4', '#9CA3AF', '#374151'),
  darkGuild('dark-guild-izzet', 'Izzet', '#38BDF8', '#EAB308', '#0A1018', '#121820', '#E0F2FE', '#0EA5E9', '#1E3A5F'),
  darkGuild('dark-guild-golgari', 'Golgari', '#34D399', '#8B7355', '#0A100C', '#121A14', '#D1FAE5', '#059669', '#1F2937'),
  darkGuild('dark-guild-boros', 'Boros', '#F87171', '#FFD700', '#140808', '#221010', '#FEE2E2', '#EF4444', '#7F1D1D'),
  darkGuild('dark-guild-simic', 'Simic', '#2DD4BF', '#67E8F9', '#081418', '#0F2028', '#CCFBF1', '#14B8A6', '#134E4A'),
]

const DARK_SIGNATURE_PRESETS: ThemePreset[] = [
  darkPreset(
    'dark-holographic-foil',
    'Holographic Foil',
    darkFull('#C084FC', '#E879F9', '#121218', '#1A1A24', '#F8FAFC', '#94A3B8', '#334155'),
    'Midnight foil. Silver base with iridescent violet accent.',
  ),
  darkPreset(
    'dark-artifact',
    'Artifact',
    darkFull('#64748B', '#3B82F6', '#0F1419', '#171D26', '#F1F5F9', '#94A3B8', '#334155'),
    'Gunmetal chassis with electric blue energy.',
  ),
  darkPreset(
    'dark-vintage-lgs',
    'Vintage LGS',
    darkFull('#B8860B', '#D4AF37', '#1A1612', '#252019', '#F5EDD6', '#A89078', '#3D3428'),
    'After-hours LGS. Walnut shadow and antique gold.',
  ),
  darkPreset(
    'dark-modern-minimal',
    'Modern Minimal',
    darkFull('#94A3B8', '#3B82F6', '#0F172A', '#1E293B', '#F8FAFC', '#64748B', '#334155'),
    'Slate dark UI with royal blue accent.',
  ),
  darkPreset(
    'dark-dragon',
    'Dragon',
    darkFull('#EF4444', '#FACC15', '#0C0A0A', '#1C1414', '#FEF2F2', '#A8A29E', '#44403C'),
    'Crimson hoard. Charcoal depths and treasure gold.',
  ),
  darkPreset(
    'dark-arcane',
    'Arcane',
    darkFull('#A78BFA', '#22D3EE', '#0A0612', '#141024', '#F5F3FF', '#C4B5FD', '#3730A3'),
    'Spell night. Purple mana and cyan arc lightning.',
  ),
  darkPreset(
    'dark-neon-cyber',
    'Neon Cyber',
    darkFull('#C084FC', '#67E8F9', '#0A0A0F', '#121218', '#F8FAFC', '#94A3B8', '#475569'),
    'LAN-party neon. Purple and cyan on graphite.',
  ),
  darkPreset(
    'dark-eldrazi',
    'Eldrazi',
    darkFull('#A78BFA', '#DDD6FE', '#050508', '#0F0A14', '#EDE9FE', '#7C3AED', '#5B21B6'),
    'Cosmic horror. Void black and lavender warp.',
  ),
]

const DARK_CLASSIC_PRESETS: ThemePreset[] = [
  darkPreset(
    'dark-classic-midnight',
    'Midnight',
    darkFull('#8B8CF7', '#F472B6', '#0F1220', '#191D2E', '#F4F5FB', '#A6ABC8', '#2C3146'),
    'Platform classic dark. Soft violet and pink accent.',
  ),
  darkPreset(
    'dark-classic-forest',
    'Forest Night',
    darkFull('#4CAF7D', '#E6B85C', '#0E2018', '#163026', '#EAF5EE', '#9BBFAA', '#274536'),
    'Deep woods with torchlight gold.',
  ),
  darkPreset(
    'dark-classic-ocean',
    'Ocean Depths',
    darkFull('#38BDF8', '#2DD4BF', '#041018', '#0A1F2E', '#E0F2FE', '#5B9BB5', '#164E63'),
    'Abyssal blue-green dive.',
  ),
  darkPreset(
    'dark-classic-platform',
    'Platform default',
    darkFull('#8B8CF7', '#FF7A59', '#0F1220', '#171B2E', '#F5F6FB', '#AAB0CB', '#2A2F47'),
    'Matches auto-derived dark styling from the default brand ramp.',
  ),
]

export const DARK_THEME_PRESET_CATEGORIES: ThemePresetCategory[] = [
  {
    id: 'mana',
    title: 'Mana colors',
    subtitle: 'Dark-mode MTG identity. Same mana identities as light themes, built for night shopping.',
    featured: true,
    defaultOpen: true,
    presets: DARK_MANA_PRESETS,
  },
  {
    id: 'guild',
    title: 'Guild themes',
    subtitle: 'Two-color guild palettes on deep backgrounds with metallic accents.',
    featured: true,
    defaultOpen: false,
    presets: DARK_GUILD_PRESETS,
  },
  {
    id: 'signature',
    title: 'Signature themes',
    subtitle: 'Premium foil, LGS nostalgia, fantasy, and cosmic dark moods.',
    featured: true,
    defaultOpen: false,
    presets: DARK_SIGNATURE_PRESETS,
  },
  {
    id: 'classic',
    title: 'Seasonal & classic',
    subtitle: 'Proven dark palettes including platform midnight and forest night.',
    defaultOpen: false,
    presets: DARK_CLASSIC_PRESETS,
  },
]

export const DARK_THEME_PRESETS: ThemePreset[] = DARK_THEME_PRESET_CATEGORIES.flatMap((c) => c.presets)

export function findDarkThemePresetById(id: string): ThemePreset | undefined {
  return DARK_THEME_PRESETS.find((p) => p.id === id)
}
