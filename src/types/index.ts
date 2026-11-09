import type { ExtractedColorPalette } from '../services/imageAnalysisService'

export type CanvasPreset = {
  id: string
  name: string
  width: number
  height: number
  category: 'social' | 'print' | 'banner' | 'custom'
  icon?: string
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'insta-portrait', name: 'Carrossel / Retrato (1080×1350)', width: 1080, height: 1350, category: 'social' },
  { id: 'insta-square', name: 'Post Quadrado (1080×1080)', width: 1080, height: 1080, category: 'social' },
  { id: 'insta-story', name: 'Story / Reels / TikTok (1080×1920)', width: 1080, height: 1920, category: 'social' },
  { id: 'yt-thumbnail', name: 'Thumbnail YouTube (1280×720)', width: 1280, height: 720, category: 'banner' },
  { id: 'yt-banner', name: 'Capa / Banner YouTube (2560×1440)', width: 2560, height: 1440, category: 'banner' },
  { id: 'fb-cover', name: 'Capa Facebook / LinkedIn', width: 820, height: 312, category: 'social' },
  { id: 'full-hd', name: 'Apresentação Full HD (1920×1080)', width: 1920, height: 1080, category: 'banner' },
]

export interface LayerItem {
  id: string
  name: string
  type: 'image' | 'text' | 'rect' | 'circle' | 'triangle' | 'polygon' | 'path' | 'group'
  visible: boolean
  locked: boolean
  opacity: number
  zIndex: number
}

export interface LMStudioStatus {
  connected: boolean
  models: string[]
  activeModel?: string
  lastChecked?: Date
}

export type SidebarTab = 'templates' | 'uploads' | 'text' | 'elements' | 'draw' | 'lmstudio' | 'layers'

export type DesignLayoutStyle = 'hero' | 'split' | 'editorial' | 'minimal' | 'promo'

export type EditorialSlideType = 'cover' | 'challenge' | 'opportunity' | 'solution' | 'detail'

export interface EditorialSlideSpec {
  slideType: EditorialSlideType
  kicker: string // e.g., "ARQUITETURA A FAVOR DA SAÚDE"
  sideTag: string // e.g., "LEVANTAMENTO DO ESPAÇO EXISTENTE"
  titleLine1: string // e.g., "Planta irregular é"
  titleLine2: string // e.g., "problema ou oportunidade?"
  subtitle: string // e.g., "3 ângulos difíceis, circulação truncada..."
  footerMain: string // e.g., "ESPAÇOS BEM PENSADOS"
  footerSub: string // e.g., "PARA CUIDAR DE PESSOAS"
  callouts?: string[] // 3 annotations for Slide 2 (challenge)
  legendTitle1?: string // For Slide 5 (detail) e.g. "Fluxo limpo"
  legendDesc1?: string // e.g. "Pacientes e atendimento"
  legendTitle2?: string // e.g. "Fluxo sujo"
  legendDesc2?: string // e.g. "Materiais e resíduos"
  detailHeading?: string // e.g. "Arquitetura para saúde exige rigor:"
  detailBody?: string // e.g. "fluxo limpo x fluxo sujo e conforto tanto para o paciente quanto para a equipe."
  layoutStyle?: DesignLayoutStyle
}

export interface GeneratedDesignSpec {
  theme: string
  mood: string
  brandName?: string
  brandTagline?: string
  headline: string
  subtitle: string
  badgeText: string
  ctaText: string
  palette: ExtractedColorPalette
  layoutStyle: DesignLayoutStyle
  fontFamily: string
  suggestedImagePrompt?: string
  slides?: EditorialSlideSpec[]
}

export interface SavedProject {
  id: string
  title: string
  updatedAt: string
  preset: CanvasPreset
  pages: Array<{
    id: string
    title: string
    json: string
    backgroundColor: string
  }>
  activePageIndex: number
  thumbnail?: string
}

export interface ImageFilterSettings {
  brightness: number // -100 to 100
  contrast: number // -100 to 100
  saturation: number // -100 to 100
  blur: number // 0 to 100
  preset: 'none' | 'grayscale' | 'sepia' | 'vintage' | 'warm' | 'cool' | 'dramatic' | 'cyberpunk'
  cornerRadius: number // 0 to 100
  shadow: boolean
  borderWidth: number
  borderColor: string
}

export interface DesignPaletteOption {
  id: string
  name: string
  category: string
  palette: ExtractedColorPalette
}

export const DESIGN_PALETTES: DesignPaletteOption[] = [
  {
    id: 'pipa-olive',
    name: 'Oliva & Papel',
    category: 'Pipa Arquitetura',
    palette: {
      primary: '#636953',
      secondary: '#7d836d',
      accent: '#b49a7b',
      background: '#ebe6de',
      textColor: '#2c302e',
      allColors: ['#636953', '#7d836d', '#b49a7b', '#ebe6de', '#2c302e'],
    },
  },
  {
    id: 'terracotta-sand',
    name: 'Terracota & Areia',
    category: 'Mediterrâneo',
    palette: {
      primary: '#9c523b',
      secondary: '#b86b52',
      accent: '#c89d7c',
      background: '#f2ece4',
      textColor: '#2d2420',
      allColors: ['#9c523b', '#b86b52', '#c89d7c', '#f2ece4', '#2d2420'],
    },
  },
  {
    id: 'petrol-ice',
    name: 'Petróleo & Gelo',
    category: 'Clínica & Saúde',
    palette: {
      primary: '#2b5868',
      secondary: '#457688',
      accent: '#84a9b8',
      background: '#edf2f4',
      textColor: '#1a2a30',
      allColors: ['#2b5868', '#457688', '#84a9b8', '#edf2f4', '#1a2a30'],
    },
  },
  {
    id: 'noir-gold',
    name: 'Carvão & Ouro',
    category: 'Studio Luxo',
    palette: {
      primary: '#27272a',
      secondary: '#3f3f46',
      accent: '#ca8a04',
      background: '#f4f3ef',
      textColor: '#18181b',
      allColors: ['#27272a', '#3f3f46', '#ca8a04', '#f4f3ef', '#18181b'],
    },
  },
  {
    id: 'sage-rose',
    name: 'Sálvia & Quartzo',
    category: 'Bem-Estar',
    palette: {
      primary: '#52685b',
      secondary: '#738c7d',
      accent: '#c28d7b',
      background: '#f5efeb',
      textColor: '#28332c',
      allColors: ['#52685b', '#738c7d', '#c28d7b', '#f5efeb', '#28332c'],
    },
  },
  {
    id: 'espresso-linen',
    name: 'Café & Linho',
    category: 'Interiores',
    palette: {
      primary: '#5c4433',
      secondary: '#7d5f49',
      accent: '#b8926a',
      background: '#efeae2',
      textColor: '#291f18',
      allColors: ['#5c4433', '#7d5f49', '#b8926a', '#efeae2', '#291f18'],
    },
  },
  {
    id: 'navy-bronze',
    name: 'Marinho & Bronze',
    category: 'Executivo',
    palette: {
      primary: '#1e3a5f',
      secondary: '#31527d',
      accent: '#b48352',
      background: '#eef1f6',
      textColor: '#112238',
      allColors: ['#1e3a5f', '#31527d', '#b48352', '#eef1f6', '#112238'],
    },
  },
  {
    id: 'burgundy-cream',
    name: 'Vinho & Creme',
    category: 'Editorial Clássico',
    palette: {
      primary: '#6b2737',
      secondary: '#8c3b4f',
      accent: '#c49a6c',
      background: '#f4eee8',
      textColor: '#2b1218',
      allColors: ['#6b2737', '#8c3b4f', '#c49a6c', '#f4eee8', '#2b1218'],
    },
  },
]
