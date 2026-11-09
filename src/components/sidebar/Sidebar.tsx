import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  LayoutTemplate,
  Upload,
  Type,
  Shapes,
  Sparkles,
  Bot,
  Layers,
  Square,
  Circle,
  Loader2,
  Send,
  Paperclip,
  X,
  Paintbrush,
  Wand2,
  Triangle,
  Star,
  Heart,
  Hexagon,
  Diamond,
  ArrowRight,
  Minus,
  Award,
  Check,
  Images,
} from 'lucide-react'
import type { SidebarTab, CanvasPreset, LMStudioStatus, LayerItem, GeneratedDesignSpec } from '../../types'
import { CANVAS_PRESETS, DESIGN_PALETTES } from '../../types'
import { lmStudioService, type SketchUnderstandingResult, type SketchVectorType } from '../../services/lmStudioService'
import { comfyOnDemandService } from '../../services/comfyOnDemandService'
import { extractColorPalette } from '../../services/imageAnalysisService'

interface SidebarProps {
  activeTab: SidebarTab
  setActiveTab: (tab: SidebarTab) => void
  currentPreset: CanvasPreset
  onSelectPreset: (preset: CanvasPreset) => void
  onAddText: (text: string, opts?: any) => void
  onAddRectangle: (opts?: any) => void
  onAddCircle: (opts?: any) => void
  onAddShape: (
    shapeType: 'triangle' | 'star' | 'heart' | 'hexagon' | 'diamond' | 'arrow' | 'line' | 'dashed-line' | 'badge',
    color?: string
  ) => void
  onAddImage: (source: string | File | Blob) => void
  onSetBackgroundColor: (color: string) => void
  onSetBackgroundGradient: (start: string, end: string, dir?: 'diagonal' | 'vertical' | 'horizontal') => void
  canvasBackgroundColor: string
  lmStudioStatus: LMStudioStatus
  layers: LayerItem[]
  onDeleteLayer: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onOpenMagicWrite: () => void
  onApplyGeneratedDesign: (imageUrls: string | string[], spec: GeneratedDesignSpec, clearExisting: boolean) => void
  onRequestComfyGenerateImage: (initialPrompt?: string) => void
  isDrawingMode: boolean
  drawBrushColor: string
  drawBrushWidth: number
  onToggleDrawingMode: (enable: boolean, color?: string, width?: number) => void
  onCaptureFreehandSketch: () => {
    sketchDataUrl: string
    cx: number
    cy: number
    width: number
    height: number
    color: string
    geometry: {
      inferredShape: SketchVectorType
      isClosed: boolean
      aspectRatio: number
      strokeCount: number
      pointCount: number
    }
  } | null
  onReplaceSketchWithVector: (vectorType: SketchVectorType, customSvgPath?: string) => void
  onReplaceSketchWithImage: (imageUrl: string) => Promise<void>
  onClearFreehandSketch: () => void
  activePageIndex?: number
}

const SAMPLE_STICKERS = [
  { name: 'Foguete 3D', url: 'https://images.unsplash.com/photo-1517976487502-5f7147728795?w=500&auto=format&fit=crop&q=80' },
  { name: 'Café & Grãos', url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500&auto=format&fit=crop&q=80' },
  { name: 'Retrato Estúdio', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80' },
  { name: 'Hambúrguer Gourmet', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80' },
]

const GRADIENT_PRESETS = [
  { name: 'Roxo Cyber', start: '#4f46e5', end: '#ec4899' },
  { name: 'Pôr do Sol', start: '#f97316', end: '#db2777' },
  { name: 'Oceano Profundo', start: '#0284c7', end: '#1e1b4b' },
  { name: 'Esmeralda Luxo', start: '#059669', end: '#0f172a' },
  { name: 'Ouro & Noite', start: '#ca8a04', end: '#18181b' },
  { name: ' Rosa Pastel', start: '#fbcfe8', end: '#ddd6fe' },
  { name: 'Noite Estrelada', start: '#0f172a', end: '#312e81' },
  { name: 'Chama Viva', start: '#dc2626', end: '#f59e0b' },
]

const READY_TEMPLATES: Array<{ name: string; desc: string; spec: GeneratedDesignSpec }> = [
  {
    name: 'Oferta Relâmpago (Promo)',
    desc: 'Ideal para varejo, descontos e chamadas urgentes',
    spec: {
      theme: 'Varejo',
      mood: 'Impactante',
      headline: 'SUPER OFERTA 50% OFF',
      subtitle: 'Somente hoje em toda a loja com entrega imediata.',
      badgeText: 'ÚLTIMAS HORAS 🔥',
      ctaText: 'COMPRAR AGORA',
      layoutStyle: 'promo',
      fontFamily: 'Montserrat',
      palette: {
        primary: '#dc2626',
        secondary: '#7f1d1d',
        accent: '#f59e0b',
        background: '#ffffff',
        textColor: '#0f172a',
        allColors: ['#dc2626', '#7f1d1d', '#f59e0b'],
      },
    },
  },
  {
    name: 'Lançamento Tech (Hero)',
    desc: 'Visual moderno escuro com brilho neon central',
    spec: {
      theme: 'Tecnologia',
      mood: 'Futurista',
      headline: 'O FUTURO CHEGOU',
      subtitle: 'Conheça a nova geração de soluções inteligentes.',
      badgeText: 'LANÇAMENTO 2026',
      ctaText: 'CONHEÇA JÁ',
      layoutStyle: 'hero',
      fontFamily: 'Oswald',
      palette: {
        primary: '#6366f1',
        secondary: '#1e1b4b',
        accent: '#ec4899',
        background: '#0f172a',
        textColor: '#ffffff',
        allColors: ['#6366f1', '#1e1b4b', '#ec4899'],
      },
    },
  },
  {
    name: 'Editorial de Moda / Luxo',
    desc: 'Moldura elegante clássica com tipografia refinada',
    spec: {
      theme: 'Moda & Estilo',
      mood: 'Sofisticado',
      headline: 'COLEÇÃO OUTONO',
      subtitle: 'Elegância atemporal em cada costura exclusiva.',
      badgeText: 'EDIÇÃO LIMITADA',
      ctaText: 'VER CATÁLOGO',
      layoutStyle: 'editorial',
      fontFamily: 'Playfair Display',
      palette: {
        primary: '#b45309',
        secondary: '#78350f',
        accent: '#d97706',
        background: '#1c1917',
        textColor: '#fafaf9',
        allColors: ['#b45309', '#78350f', '#d97706'],
      },
    },
  },
]

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentPreset,
  onSelectPreset,
  onAddText,
  onAddRectangle,
  onAddCircle,
  onAddShape,
  onAddImage,
  onSetBackgroundColor,
  onSetBackgroundGradient,
  canvasBackgroundColor,
  lmStudioStatus,
  layers,
  onOpenMagicWrite,
  onApplyGeneratedDesign,
  onRequestComfyGenerateImage,
  isDrawingMode,
  drawBrushColor,
  drawBrushWidth,
  onToggleDrawingMode,
  onCaptureFreehandSketch,
  onReplaceSketchWithVector,
  onReplaceSketchWithImage,
  onClearFreehandSketch,
  activePageIndex = 0,
}) => {
  // LM Studio Copilot Studio state (defaults to 'carousel' 5 pages)
  const [copilotInput, setCopilotInput] = useState('')
  const [copilotMode, setCopilotMode] = useState<'single' | 'carousel'>('carousel')
  const [selectedPaletteId, setSelectedPaletteId] = useState<string>('pipa-olive')
  const [copilotAttachments, setCopilotAttachments] = useState<string[]>([])
  const [copilotChat, setCopilotChat] = useState<
    Array<{
      role: 'user' | 'assistant'
      text: string
      images?: string[]
      spec?: GeneratedDesignSpec
    }>
  >([
    {
      role: 'assistant',
      text: 'Bem-vindo ao Estúdio IA Copilot! Escolha uma das 8 paletas editoriais abaixo, anexe suas plantas/logos e envie seu roteiro para gerar automaticamente todas as 5 páginas do carrossel.',
    },
  ])
  const [isCopilotThinking, setIsCopilotThinking] = useState(false)
  const [thinkingStatusText, setThinkingStatusText] = useState<string>('')
  const copilotFileInputRef = useRef<HTMLInputElement | null>(null)

  // Pending AI question asking whether to remove background from attached images with ComfyUI before placing them
  const [pendingCopilotBgChoice, setPendingCopilotBgChoice] = useState<{
    userMsg: string
    attachedImages: string[]
    selectedIndices: number[]
    activeMode: 'single' | 'carousel'
    error?: string
  } | null>(null)

  // Pending Upload tab question asking whether to remove background from uploaded image with ComfyUI
  const [pendingUploadImageDataUrl, setPendingUploadImageDataUrl] = useState<string | null>(null)
  const [isRemovingUploadBg, setIsRemovingUploadBg] = useState(false)
  const [uploadBgError, setUploadBgError] = useState<string | null>(null)

  // Magic Draw ("Entender Desenho com IA") State
  const [sketchHint, setSketchHint] = useState('')
  const [isAnalyzingSketch, setIsAnalyzingSketch] = useState(false)
  const [sketchPreviewUrl, setSketchPreviewUrl] = useState<string | null>(null)
  const [sketchResult, setSketchResult] = useState<SketchUnderstandingResult | null>(null)
  const [sketchImagePrompt, setSketchImagePrompt] = useState('')
  const [sketchRemoveBgOnGen, setSketchRemoveBgOnGen] = useState(true)
  const [isGeneratingSketchImg, setIsGeneratingSketchImg] = useState(false)
  const [sketchGenStatus, setSketchGenStatus] = useState('')
  const [sketchError, setSketchError] = useState<string | null>(null)

  const handleUnderstandSketchWithAI = async () => {
    setSketchError(null)
    const captured = onCaptureFreehandSketch()
    if (!captured) {
      setSketchError('Desenhe algo à mão livre na página primeiro usando o pincel acima!')
      return
    }

    setSketchPreviewUrl(captured.sketchDataUrl)
    setIsAnalyzingSketch(true)
    try {
      const result = await lmStudioService.understandSketch(
        captured.sketchDataUrl,
        captured.geometry,
        sketchHint
      )
      setSketchResult(result)
      setSketchImagePrompt(result.imagePrompt)
    } catch (err: any) {
      setSketchError(err.message || 'Erro ao analisar o desenho com a IA.')
    } finally {
      setIsAnalyzingSketch(false)
    }
  }

  const handleConvertSketchToImageWithComfy = async () => {
    if (!sketchResult || isGeneratingSketchImg) return
    setSketchError(null)
    setIsGeneratingSketchImg(true)
    setSketchGenStatus('Conectando ao ComfyUI (Z-Image-Turbo 1024×1024)...')

    try {
      const promptToUse = sketchImagePrompt.trim() || sketchResult.imagePrompt
      let finalUrl = await comfyOnDemandService.generateImage({
        prompt: promptToUse,
        width: 1024,
        height: 1024,
        steps: 8,
      })

      if (sketchRemoveBgOnGen) {
        setSketchGenStatus('Apagando fundo com BiRefNet no ComfyUI...')
        finalUrl = await comfyOnDemandService.removeBackgroundFromDataUrl(finalUrl)
      }

      await onReplaceSketchWithImage(finalUrl)
      setSketchResult(null)
      setSketchPreviewUrl(null)
    } catch (err: any) {
      setSketchError(
        err.message ||
          'Erro ao gerar imagem no ComfyUI. Verifique se o seu ComfyUI está aberto na porta 8188.'
      )
    } finally {
      setIsGeneratingSketchImg(false)
      setSketchGenStatus('')
    }
  }

  const handleSelectPalette = (paletteId: string) => {
    setSelectedPaletteId(paletteId)
    const found = DESIGN_PALETTES.find((p) => p.id === paletteId)
    if (!found) return

    // If user already generated a design/carousel in the chat, immediately update its palette across all 5 pages!
    for (let i = copilotChat.length - 1; i >= 0; i--) {
      const msg = copilotChat[i]
      if (msg.role === 'assistant' && msg.spec) {
        const updatedSpec: GeneratedDesignSpec = {
          ...msg.spec,
          palette: found.palette,
        }
        onApplyGeneratedDesign(msg.images || [], updatedSpec, true)
        setCopilotChat((prev) =>
          prev.map((m, idx) => (idx === i ? { ...m, spec: updatedSpec } : m))
        )
        break
      }
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      const file = files[0]
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        if (dataUrl) {
          setUploadBgError(null)
          setPendingUploadImageDataUrl(dataUrl)
        }
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  const handleConfirmUploadWithBgOption = async (removeBg: boolean) => {
    if (!pendingUploadImageDataUrl) return
    if (!removeBg) {
      onAddImage(pendingUploadImageDataUrl)
      setPendingUploadImageDataUrl(null)
      setUploadBgError(null)
      return
    }

    setIsRemovingUploadBg(true)
    setUploadBgError(null)
    try {
      const cleanDataUrl = await comfyOnDemandService.removeBackgroundFromDataUrl(pendingUploadImageDataUrl)
      onAddImage(cleanDataUrl)
      setPendingUploadImageDataUrl(null)
    } catch (err: any) {
      setUploadBgError(err.message || 'Erro ao remover fundo no ComfyUI.')
    } finally {
      setIsRemovingUploadBg(false)
    }
  }

  const handleCopilotFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        if (result) {
          setCopilotAttachments((prev) => [...prev, result])
        }
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeCopilotAttachment = (index: number) => {
    setCopilotAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  // Extract image files from clipboard and attach them to the Copilot chat (or Uploads tab)
  const extractAndAttachClipboardImages = useCallback(
    (clipboardData: DataTransfer | null): boolean => {
      if (!clipboardData) return false
      const imageFiles: File[] = []

      if (clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) imageFiles.push(file)
          }
        }
      } else if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          const file = clipboardData.files[i]
          if (file.type.startsWith('image/')) {
            imageFiles.push(file)
          }
        }
      }

      if (imageFiles.length === 0) return false

      imageFiles.forEach((file) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          const result = event.target?.result as string
          if (!result) return
          if (activeTab === 'uploads') {
            setUploadBgError(null)
            setPendingUploadImageDataUrl(result)
          } else {
            setActiveTab('lmstudio')
            setCopilotAttachments((prev) => [...prev, result])
          }
        }
        reader.readAsDataURL(file)
      })

      return true
    },
    [activeTab, setActiveTab]
  )

  const handleCopilotPaste = (e: React.ClipboardEvent) => {
    const hadImages = extractAndAttachClipboardImages(e.clipboardData)
    if (hadImages && !e.clipboardData.getData('text/plain')) {
      e.preventDefault()
    }
  }

  // Global Ctrl+V listener so pasting an image anywhere while in the workspace attaches it to the chat
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      // Avoid duplicate handling if paste already happened inside an element handled by onPaste
      const target = e.target as HTMLElement | null
      if (target && target.dataset?.copilotPasteInput === 'true') return

      const hadImages = extractAndAttachClipboardImages(e.clipboardData)
      if (hadImages) {
        e.preventDefault()
      }
    }

    window.addEventListener('paste', onWindowPaste)
    return () => window.removeEventListener('paste', onWindowPaste)
  }, [extractAndAttachClipboardImages])

  // Core runner that executes LM Studio Copilot after the user chooses whether to remove backgrounds
  const executeCopilotGeneration = async (
    userMsg: string,
    finalImages: string[],
    activeMode: 'single' | 'carousel'
  ) => {
    // Check if there is an existing generated design in the chat history so follow-up messages re-edit it!
    let lastSpec: GeneratedDesignSpec | undefined
    let lastImages: string[] = []
    for (let i = copilotChat.length - 1; i >= 0; i--) {
      if (copilotChat[i].role === 'assistant' && copilotChat[i].spec) {
        lastSpec = copilotChat[i].spec
        lastImages = copilotChat[i].images || []
        break
      }
    }

    const imagesToUse = finalImages.length > 0 ? finalImages : lastImages
    const isReEditing = Boolean(lastSpec)

    setIsCopilotThinking(true)
    setThinkingStatusText(
      isReEditing
        ? `LM Studio aplicando alterações (Slide ${activePageIndex + 1})...`
        : activeMode === 'carousel'
        ? 'LM Studio projetando todas as páginas do carrossel...'
        : 'LM Studio desenhando layout, cores e textos...'
    )

    try {
      // Allow voice/text commands to switch palette automatically (e.g. "mude para escuro", "azul", "terracota", "esmeralda")
      let effectivePaletteId = selectedPaletteId
      const lowerCmd = userMsg.toLowerCase()
      if (/noite|escuro|dark|dourado/.test(lowerCmd)) effectivePaletteId = 'midnight-gold'
      else if (/terracota|argila|laranja/.test(lowerCmd)) effectivePaletteId = 'terracotta-warm'
      else if (/azul|marinho|navy|oceano/.test(lowerCmd)) effectivePaletteId = 'ocean-slate'
      else if (/esmeralda|verde escuro|floresta/.test(lowerCmd)) effectivePaletteId = 'emerald-forest'
      else if (/vinho|bord[oô]|burgundy/.test(lowerCmd)) effectivePaletteId = 'burgundy-editorial'
      else if (/areia|minimal|bege/.test(lowerCmd)) effectivePaletteId = 'sand-minimal'
      else if (/claro|branco|clean|gelo/.test(lowerCmd)) effectivePaletteId = 'arctic-clean'
      else if (/oliva|pipa/.test(lowerCmd) && isReEditing) effectivePaletteId = 'pipa-olive'

      if (effectivePaletteId !== selectedPaletteId) {
        setSelectedPaletteId(effectivePaletteId)
      }

      const presetPalette = DESIGN_PALETTES.find((p) => p.id === effectivePaletteId)?.palette
      const palette =
        presetPalette ||
        lastSpec?.palette ||
        (await extractColorPalette(imagesToUse[0] || ''))
      const colorsSummary = palette.allColors.join(', ')

      const result = await lmStudioService.designCopilot(
        userMsg,
        imagesToUse,
        colorsSummary,
        activeMode,
        lastSpec,
        activePageIndex
      )

      let fullSpec: GeneratedDesignSpec | undefined
      if (result.designSpec) {
        fullSpec = {
          ...result.designSpec,
          palette,
        }
        onApplyGeneratedDesign(imagesToUse, fullSpec, true)
      }

      setCopilotChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result.reply,
          images: imagesToUse,
          spec: fullSpec,
        },
      ])
    } catch (err: any) {
      setCopilotChat((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Erro ao conectar ao LM Studio: ${err.message || 'Servidor offline'}. Verifique se o Local Server está ativo na porta 1234.`,
        },
      ])
    } finally {
      setIsCopilotThinking(false)
      setThinkingStatusText('')
    }
  }

  // Handle user's answer to the AI question: "Should I remove background of the attached images with ComfyUI?"
  const handleResolveCopilotBgChoice = async (shouldRemoveBg: boolean) => {
    if (!pendingCopilotBgChoice) return
    const { userMsg, attachedImages, selectedIndices, activeMode } = pendingCopilotBgChoice

    if (!shouldRemoveBg || selectedIndices.length === 0) {
      setPendingCopilotBgChoice(null)
      await executeCopilotGeneration(userMsg, attachedImages, activeMode)
      return
    }

    // Remove backgrounds of selected images via ComfyUI BiRefNet first
    setIsCopilotThinking(true)
    setPendingCopilotBgChoice((prev) => (prev ? { ...prev, error: undefined } : null))

    try {
      const processedImages = [...attachedImages]
      for (let i = 0; i < selectedIndices.length; i++) {
        const idx = selectedIndices[i]
        setThinkingStatusText(
          `ComfyUI (BiRefNet): Apagando fundo da imagem ${i + 1} de ${selectedIndices.length}...`
        )
        processedImages[idx] = await comfyOnDemandService.removeBackgroundFromDataUrl(attachedImages[idx])
      }

      setPendingCopilotBgChoice(null)
      await executeCopilotGeneration(userMsg, processedImages, activeMode)
    } catch (err: any) {
      setIsCopilotThinking(false)
      setThinkingStatusText('')
      setPendingCopilotBgChoice((prev) =>
        prev
          ? {
              ...prev,
              error:
                err.message ||
                'Não foi possível apagar o fundo no ComfyUI. Verifique se ele está aberto na porta 8188 ou clique em "Usar imagens normais".',
            }
          : null
      )
    }
  }

  // Execute LM Studio Copilot design creation (asks first about background removal if images are attached)
  const handleSendCopilot = async (customPrompt?: string, overrideMode?: 'single' | 'carousel') => {
    const activePrompt = customPrompt !== undefined ? customPrompt : copilotInput
    const activeMode = overrideMode || copilotMode

    if ((!activePrompt.trim() && copilotAttachments.length === 0) || isCopilotThinking) return

    const userMsg =
      activePrompt.trim() ||
      (activeMode === 'carousel'
        ? 'Crie um carrossel editorial completo de 5 páginas (Capa, Desafio, Oportunidade, Solução e Detalhamento Técnico) usando estas imagens.'
        : 'Crie um design impactante e diferenciado com estas imagens.')
    const attachedImages = [...copilotAttachments]

    if (customPrompt === undefined) setCopilotInput('')
    setCopilotAttachments([])
    setCopilotChat((prev) => [...prev, { role: 'user', text: userMsg, images: attachedImages }])

    // If user attached normal images, the AI asks FIRST whether to remove their background with ComfyUI!
    if (attachedImages.length > 0) {
      setPendingCopilotBgChoice({
        userMsg,
        attachedImages,
        selectedIndices: attachedImages.map((_, idx) => idx),
        activeMode,
      })
      return
    }

    await executeCopilotGeneration(userMsg, attachedImages, activeMode)
  }

  const TABS = [
    { id: 'lmstudio', label: 'IA Copilot', icon: Bot, badge: 'Magic' },
    { id: 'templates', label: 'Canvas', icon: LayoutTemplate },
    { id: 'uploads', label: 'Uploads', icon: Upload },
    { id: 'text', label: 'Texto', icon: Type },
    { id: 'elements', label: 'Elementos', icon: Shapes },
    { id: 'draw', label: 'Desenho', icon: Paintbrush },
    { id: 'layers', label: 'Camadas', icon: Layers },
  ]

  return (
    <div className="flex h-full select-none">
      {/* Left Navigation Strip */}
      <div className="w-18 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-3 gap-1 z-10 shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id !== 'draw' && isDrawingMode) {
                  onToggleDrawingMode(false)
                }
                setActiveTab(tab.id as SidebarTab)
              }}
              className={`w-14 py-2.5 rounded-xl flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition relative ${
                isActive
                  ? 'bg-purple-600/20 text-purple-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold tracking-tighter bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-300">
                  {tab.badge}
                </span>
              )}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-purple-500 rounded-r-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* Content Drawer */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden text-xs">
        {/* ================= IA COPILOT (UNIFIED MAGIC DESIGN STUDIO) ================= */}
        {activeTab === 'lmstudio' && (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Studio Header */}
            <div className="p-3.5 border-b border-slate-800 bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Canva Magic Copilot</span>
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
                    lmStudioStatus.connected
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      lmStudioStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                    }`}
                  />
                  {lmStudioStatus.connected ? lmStudioStatus.activeModel?.split('/').pop() || 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-slate-400 text-[11px]">
                Crie posts únicos, carrosséis inteiros ou gere imagens inéditas com LM Studio + ComfyUI.
              </p>

              {/* Mode Switcher: Post Único vs Carrossel vs Gerar Imagem */}
              <div className="grid grid-cols-3 gap-1 mt-3 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setCopilotMode('single')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 ${
                    copilotMode === 'single'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Post Único</span>
                </button>
                <button
                  onClick={() => setCopilotMode('carousel')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 ${
                    copilotMode === 'carousel'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Images className="w-3 h-3" />
                  <span>Carrossel 5p</span>
                </button>
                <button
                  onClick={() => onRequestComfyGenerateImage(copilotInput)}
                  className="py-1.5 px-2 rounded-lg text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/15 transition flex items-center justify-center gap-1"
                  title="Gerar uma imagem do zero com ComfyUI (pede confirmação)"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>Gerar Foto</span>
                </button>
              </div>
            </div>

            {/* 8 Curated Editorial Color Palettes Selector */}
            <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/60 shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  🎨 Paleta de Cores ({DESIGN_PALETTES.find((p) => p.id === selectedPaletteId)?.name || 'Automática'})
                </span>
                <button
                  onClick={() => setSelectedPaletteId('auto')}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                    selectedPaletteId === 'auto'
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Auto (Foto)
                </button>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {DESIGN_PALETTES.map((pal) => {
                  const isSel = selectedPaletteId === pal.id
                  return (
                    <button
                      key={pal.id}
                      onClick={() => handleSelectPalette(pal.id)}
                      title={`${pal.name} (${pal.category}) — Clique para aplicar ao design`}
                      className={`px-2 py-1 rounded-lg border flex items-center gap-1.5 shrink-0 transition ${
                        isSel
                          ? 'bg-purple-600/25 border-purple-400 text-white font-semibold shadow-sm'
                          : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center -space-x-1">
                        <span
                          className="w-3 h-3 rounded-full border border-white/30"
                          style={{ backgroundColor: pal.palette.primary }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/30"
                          style={{ backgroundColor: pal.palette.accent }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-slate-600"
                          style={{ backgroundColor: pal.palette.background }}
                        />
                      </div>
                      <span className="text-[10px] whitespace-nowrap">{pal.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quick Action Starter Chips */}
            <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-900/50 flex items-center gap-1.5 overflow-x-auto shrink-0">
              {[
                { label: '🏛️ Carrossel Pipa Arquitetura (5p)', prompt: 'carrossel para instagram: Pipa Arquitetura - Planta irregular é problema ou oportunidade? O espaço original, A solução e Detalhamento técnico fluxo limpo x fluxo sujo', mode: 'carousel' as const },
                { label: '🎠 Carrossel 5 Páginas', prompt: 'Carrossel editorial completo de 5 páginas com estudo de caso', mode: 'carousel' as const },
                { label: '✨ Post Único Luxo', prompt: 'Anúncio elegante de lançamento de coleção exclusiva', mode: 'single' as const },
              ].map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setCopilotMode(chip.mode)
                    handleSendCopilot(chip.prompt, chip.mode)
                  }}
                  disabled={isCopilotThinking}
                  className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-purple-600/25 border border-slate-700 hover:border-purple-500/50 text-[10px] text-slate-300 hover:text-purple-200 whitespace-nowrap transition shrink-0"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Interactive Chat & Design Cards */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {copilotChat.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-2xl text-xs leading-relaxed space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100 ml-4'
                      : 'bg-slate-800/90 border border-slate-700/70 text-slate-200 mr-2 shadow-lg'
                  }`}
                >
                  {/* User Attached Thumbnails */}
                  {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {msg.images.map((img, imgIdx) => (
                        <img
                          key={imgIdx}
                          src={img}
                          alt="Anexo"
                          className="w-12 h-12 object-cover rounded-lg border border-purple-400/40 shadow-sm"
                        />
                      ))}
                    </div>
                  )}

                  <p className="whitespace-pre-wrap">{msg.text}</p>

                  {/* Interactive Design Card when Assistant generates a Design */}
                  {msg.role === 'assistant' && msg.spec && (
                    <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 space-y-2.5 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          {msg.spec.slides ? `Carrossel (${msg.spec.slides.length} Páginas)` : 'Design Aplicado'}
                        </span>

                        {/* Color Palette Dots */}
                        <div className="flex items-center gap-1">
                          {[msg.spec.palette.primary, msg.spec.palette.secondary, msg.spec.palette.accent].map(
                            (col, cIdx) => (
                              <span
                                key={cIdx}
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: col }}
                                title={col}
                              />
                            )
                          )}
                        </div>
                      </div>

                      {/* 1-Click Color Palette Switcher for this Carousel / Design */}
                      <div>
                        <span className="block text-[10px] text-slate-400 mb-1">
                          Trocar paleta de cores em todas as páginas:
                        </span>
                        <div className="grid grid-cols-2 gap-1">
                          {DESIGN_PALETTES.map((pal) => (
                            <button
                              key={pal.id}
                              onClick={() => {
                                setSelectedPaletteId(pal.id)
                                const updatedSpec: GeneratedDesignSpec = {
                                  ...msg.spec!,
                                  palette: pal.palette,
                                }
                                onApplyGeneratedDesign(msg.images || [], updatedSpec, true)
                              }}
                              className="px-2 py-1 rounded bg-slate-800 hover:bg-purple-600/30 border border-slate-700 hover:border-purple-400 flex items-center gap-1.5 text-left transition"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/30"
                                style={{ backgroundColor: pal.palette.primary }}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-600"
                                style={{ backgroundColor: pal.palette.background }}
                              />
                              <span className="text-[10px] text-slate-200 truncate">{pal.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Synergy Button: Generate AI Image in ComfyUI using LM Studio's crafted prompt */}
                      {msg.spec.suggestedImagePrompt && (
                        <button
                          onClick={() => onRequestComfyGenerateImage(msg.spec!.suggestedImagePrompt)}
                          className="w-full py-2 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600/25 to-teal-600/25 hover:from-emerald-600/40 hover:to-teal-600/40 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Gerar Foto deste Design no ComfyUI</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* AI Question Card: Ask first whether to remove background from attached images via ComfyUI */}
              {pendingCopilotBgChoice && !isCopilotThinking && (
                <div className="p-3.5 rounded-2xl bg-slate-800/95 border border-emerald-500/40 text-slate-200 mr-2 shadow-xl space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold text-white text-xs">
                        Deseja apagar o fundo das imagens enviadas com o ComfyUI antes de montar o design?
                      </p>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Clique nas miniaturas abaixo para marcar/desmarcar quais imagens devem ter o fundo apagado (BiRefNet na porta 8188):
                      </p>
                    </div>
                  </div>

                  {/* Selectable Thumbnails */}
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {pendingCopilotBgChoice.attachedImages.map((img, idx) => {
                      const isChecked = pendingCopilotBgChoice.selectedIndices.includes(idx)
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPendingCopilotBgChoice((prev) => {
                              if (!prev) return null
                              const exists = prev.selectedIndices.includes(idx)
                              return {
                                ...prev,
                                selectedIndices: exists
                                  ? prev.selectedIndices.filter((i) => i !== idx)
                                  : [...prev.selectedIndices, idx],
                              }
                            })
                          }}
                          className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 transition ${
                            isChecked
                              ? 'border-emerald-400 ring-2 ring-emerald-500/30'
                              : 'border-slate-700 opacity-55 hover:opacity-90'
                          }`}
                          title={isChecked ? 'Fundo será apagado no ComfyUI' : 'Manter fundo original'}
                        >
                          <img src={img} alt={`Imagem ${idx + 1}`} className="w-full h-full object-cover" />
                          <span
                            className={`absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              isChecked ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900/80 text-slate-400'
                            }`}
                          >
                            {isChecked ? '✓' : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  {pendingCopilotBgChoice.error && (
                    <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] leading-relaxed">
                      {pendingCopilotBgChoice.error}
                    </div>
                  )}

                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleResolveCopilotBgChoice(true)}
                      disabled={pendingCopilotBgChoice.selectedIndices.length === 0}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition disabled:opacity-40"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>
                        Sim, apagar fundo ({pendingCopilotBgChoice.selectedIndices.length}) no ComfyUI e criar
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResolveCopilotBgChoice(false)}
                      className="w-full py-2 px-3 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <span>Não, colocar imagens normais (sem apagar fundo)</span>
                    </button>
                  </div>
                </div>
              )}

              {isCopilotThinking && (
                <div className="p-3 rounded-2xl bg-slate-800/60 border border-purple-500/30 flex items-center gap-2.5 text-purple-200 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400 shrink-0" />
                  <span>
                    {thinkingStatusText ||
                      (copilotMode === 'carousel'
                        ? 'LM Studio projetando todas as páginas do carrossel...'
                        : 'LM Studio desenhando layout, cores e textos...')}
                  </span>
                </div>
              )}
            </div>

            {/* Bottom Attachment Dropzone & Prompt Bar */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/90 space-y-2">
              {copilotAttachments.length > 0 ? (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {copilotAttachments.map((img, idx) => (
                    <div key={idx} className="relative group shrink-0">
                      <img
                        src={img}
                        alt="Anexo"
                        className="w-12 h-12 object-cover rounded-lg border border-purple-500/60"
                      />
                      <button
                        onClick={() => removeCopilotAttachment(idx)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => copilotFileInputRef.current?.click()}
                    className="w-12 h-12 rounded-lg border border-dashed border-slate-700 hover:border-purple-500 flex flex-col items-center justify-center text-slate-400 hover:text-purple-300 shrink-0"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    <span className="text-[9px]">+foto</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => copilotFileInputRef.current?.click()}
                  className="w-full py-1.5 px-3 rounded-xl border border-dashed border-slate-700 hover:border-purple-500/60 bg-slate-900/60 hover:bg-purple-950/20 text-slate-400 hover:text-purple-300 flex items-center justify-center gap-1.5 text-[11px] transition"
                >
                  <Paperclip className="w-3.5 h-3.5 text-purple-400" />
                  <span>Anexar ou Colar (Ctrl+V) fotos no chat</span>
                </button>
              )}

              <input
                type="file"
                ref={copilotFileInputRef}
                onChange={handleCopilotFiles}
                multiple
                accept="image/*"
                className="hidden"
              />

              <div className="flex items-end gap-1.5">
                <textarea
                  rows={2}
                  data-copilot-paste-input="true"
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                  onPaste={handleCopilotPaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendCopilot()
                    }
                  }}
                  placeholder={
                    copilotMode === 'carousel'
                      ? 'Cole imagens (Ctrl+V) ou digite o roteiro do carrossel...'
                      : 'Cole imagens (Ctrl+V) ou descreva o post...'
                  }
                  className="flex-1 bg-slate-900 text-xs text-white placeholder-slate-500 px-3 py-2 rounded-xl border border-slate-700 focus:border-purple-500 outline-none resize-none leading-relaxed"
                />
                <button
                  onClick={() => handleSendCopilot()}
                  disabled={(!copilotInput.trim() && copilotAttachments.length === 0) || isCopilotThinking}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white disabled:opacity-40 transition shadow-md shadow-purple-600/20 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TEMPLATES, GRADIENTS & CANVAS ================= */}
        {activeTab === 'templates' && (
          <div className="p-4 space-y-5 overflow-y-auto">
            {/* Ready-to-use Differentiated Templates */}
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Templates Prontos</h3>
              <p className="text-slate-400 text-[11px] mb-2.5">Clique para aplicar um layout editável na página.</p>
              <div className="space-y-2">
                {READY_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => onApplyGeneratedDesign([], tpl.spec, true)}
                    className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-500/50 text-left transition flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-semibold text-white group-hover:text-purple-300 text-xs">{tpl.name}</div>
                      <div className="text-[10px] text-slate-400">{tpl.desc}</div>
                    </div>
                    <div className="flex gap-1">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tpl.spec.palette.primary }} />
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tpl.spec.palette.accent }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Gradient Backgrounds */}
            <div>
              <h4 className="text-slate-300 font-semibold text-xs mb-2">Fundos em Gradiente (Degradê)</h4>
              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((g, i) => (
                  <button
                    key={i}
                    onClick={() => onSetBackgroundGradient(g.start, g.end, 'diagonal')}
                    className="h-10 rounded-lg border border-slate-700 hover:scale-105 transition shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${g.start}, ${g.end})` }}
                    title={g.name}
                  />
                ))}
              </div>
            </div>

            {/* Solid Background Colors */}
            <div>
              <h4 className="text-slate-300 font-semibold text-xs mb-2">Cor Sólida do Fundo</h4>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={canvasBackgroundColor}
                  onChange={(e) => onSetBackgroundColor(e.target.value)}
                  className="w-9 h-9 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <span className="font-mono text-slate-300 uppercase">{canvasBackgroundColor}</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {[
                  '#ffffff',
                  '#f8fafc',
                  '#0f172a',
                  '#1e1b4b',
                  '#ef4444',
                  '#f97316',
                  '#eab308',
                  '#22c55e',
                  '#06b6d4',
                  '#3b82f6',
                  '#8b5cf6',
                  '#ec4899',
                ].map((c) => (
                  <button
                    key={c}
                    onClick={() => onSetBackgroundColor(c)}
                    className="w-8 h-8 rounded-lg border border-slate-700 hover:scale-110 transition"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Format Presets */}
            <div>
              <h4 className="text-slate-300 font-semibold text-xs mb-2">Formatos do Canvas</h4>
              <div className="space-y-1.5">
                {CANVAS_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelectPreset(p)}
                    className={`w-full p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                      currentPreset.id === p.id
                        ? 'bg-purple-600/15 border-purple-500 text-purple-200'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {p.width}×{p.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= UPLOADS & ON-DEMAND AI IMAGE GEN ================= */}
        {activeTab === 'uploads' && (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Uploads & Imagens</h3>
              <p className="text-slate-400 text-xs">Envie fotos do computador ou gere com IA.</p>
            </div>

            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-2xl p-5 cursor-pointer bg-slate-800/30 hover:bg-purple-500/5 transition group">
              <Upload className="w-7 h-7 text-purple-400 mb-2 group-hover:scale-110 transition" />
              <span className="font-semibold text-slate-200">Subir Imagem Local</span>
              <span className="text-[11px] text-slate-500 mt-0.5">PNG, JPG, WebP ou SVG</span>
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* AI Prompt when uploading a normal image: Ask first if it should remove background with ComfyUI */}
            {pendingUploadImageDataUrl && (
              <div className="p-3.5 rounded-2xl bg-slate-800/95 border border-emerald-500/40 space-y-2.5 shadow-xl">
                <div className="flex items-center gap-2.5">
                  <img
                    src={pendingUploadImageDataUrl}
                    alt="Preview"
                    className="w-12 h-12 rounded-lg object-cover border border-slate-600 shrink-0"
                  />
                  <div className="text-[11px] text-slate-200 font-medium leading-snug">
                    Deseja apagar o fundo desta imagem com o <strong>ComfyUI</strong> antes de colocá-la na página?
                  </div>
                </div>

                {uploadBgError && (
                  <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px]">
                    {uploadBgError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={isRemovingUploadBg}
                    onClick={() => handleConfirmUploadWithBgOption(true)}
                    className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                  >
                    {isRemovingUploadBg ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Apagando fundo no ComfyUI...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Sim, apagar fundo com ComfyUI</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isRemovingUploadBg}
                    onClick={() => handleConfirmUploadWithBgOption(false)}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-700/80 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold transition disabled:opacity-40"
                  >
                    Não, colocar imagem normal
                  </button>
                </div>
              </div>
            )}

            {/* On-Demand ComfyUI Image Generator Button */}
            <button
              onClick={() => onRequestComfyGenerateImage()}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/40 text-emerald-300 font-semibold flex items-center justify-center gap-2 transition"
            >
              <Wand2 className="w-4 h-4 text-emerald-400" />
              <span>Gerar Imagem com ComfyUI</span>
            </button>

            <div>
              <h4 className="text-slate-400 font-medium mb-2">Fotos de Demonstração Rápida</h4>
              <div className="grid grid-cols-2 gap-2">
                {SAMPLE_STICKERS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => onAddImage(s.url)}
                    className="group relative rounded-xl overflow-hidden border border-slate-700 aspect-square bg-slate-800 hover:border-purple-500 transition"
                  >
                    <img
                      src={s.url}
                      alt={s.name}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-[10px] text-white font-medium">
                      {s.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TEXT & TYPOGRAPHY ================= */}
        {activeTab === 'text' && (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Tipografia & Textos</h3>
              <p className="text-slate-400 text-xs">Adicione títulos, caixas de texto ou use o Magic Write.</p>
            </div>

            <button
              onClick={onOpenMagicWrite}
              className="w-full p-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              <span>Magic Write (Gerador de Copy IA)</span>
            </button>

            <div className="space-y-2">
              <button
                onClick={() => onAddText('TÍTULO DE IMPACTO', { fontSize: 64, fontWeight: 'bold' })}
                className="w-full p-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-left transition"
              >
                <span className="text-lg font-extrabold text-white block">Adicionar um Título</span>
              </button>

              <button
                onClick={() => onAddText('Subtítulo complementar para seu post', { fontSize: 36, fontWeight: '600' })}
                className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-left transition"
              >
                <span className="text-sm font-semibold text-slate-200 block">Adicionar um Subtítulo</span>
              </button>

              <button
                onClick={() =>
                  onAddText('Adicione um pouco de texto descritivo para explicar os detalhes.', {
                    fontSize: 24,
                    fontWeight: 'normal',
                  })
                }
                className="w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-left transition"
              >
                <span className="text-xs text-slate-300 block">Adicionar corpo de texto</span>
              </button>
            </div>

            {/* Pre-styled Text Badges */}
            <div>
              <h4 className="text-slate-400 font-semibold text-xs mb-2">Combinações Prontas</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    onAddText('🔥 50% OFF', {
                      fontSize: 44,
                      fontWeight: 'bold',
                      fill: '#f59e0b',
                      fontFamily: 'Impact',
                    })
                  }
                  className="p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-amber-500 text-center font-bold text-amber-400"
                >
                  🔥 50% OFF
                </button>
                <button
                  onClick={() =>
                    onAddText('ARRASTE 👉', {
                      fontSize: 32,
                      fontWeight: 'bold',
                      fill: '#a855f7',
                      fontFamily: 'Montserrat',
                    })
                  }
                  className="p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-purple-500 text-center font-bold text-purple-300"
                >
                  ARRASTE 👉
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= RICH ELEMENTS, SHAPES & STICKERS ================= */}
        {activeTab === 'elements' && (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Formas, Ícones & Selos</h3>
              <p className="text-slate-400 text-xs">Elementos vetoriais prontos estilo Canva.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onAddRectangle()}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Square className="w-6 h-6 text-indigo-400" />
                <span className="text-[10px]">Retângulo</span>
              </button>

              <button
                onClick={() => onAddCircle()}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Circle className="w-6 h-6 text-pink-400" />
                <span className="text-[10px]">Círculo</span>
              </button>

              <button
                onClick={() => onAddShape('triangle', '#10b981')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Triangle className="w-6 h-6 text-emerald-400" />
                <span className="text-[10px]">Triângulo</span>
              </button>

              <button
                onClick={() => onAddShape('star', '#f59e0b')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Star className="w-6 h-6 text-amber-400" />
                <span className="text-[10px]">Estrela</span>
              </button>

              <button
                onClick={() => onAddShape('heart', '#ef4444')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Heart className="w-6 h-6 text-rose-400" />
                <span className="text-[10px]">Coração</span>
              </button>

              <button
                onClick={() => onAddShape('hexagon', '#06b6d4')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Hexagon className="w-6 h-6 text-cyan-400" />
                <span className="text-[10px]">Hexágono</span>
              </button>

              <button
                onClick={() => onAddShape('diamond', '#a855f7')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Diamond className="w-6 h-6 text-purple-400" />
                <span className="text-[10px]">Losango</span>
              </button>

              <button
                onClick={() => onAddShape('badge', '#eab308')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <Award className="w-6 h-6 text-yellow-400" />
                <span className="text-[10px]">Selo Oferta</span>
              </button>

              <button
                onClick={() => onAddShape('arrow', '#ec4899')}
                className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex flex-col items-center gap-1.5 text-slate-300 hover:text-white transition"
              >
                <ArrowRight className="w-6 h-6 text-pink-400" />
                <span className="text-[10px]">Seta</span>
              </button>
            </div>

            {/* Lines & CTA Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="text-slate-400 font-semibold text-xs">Linhas & Botões</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onAddShape('line', '#94a3b8')}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center justify-center gap-1.5 text-slate-300"
                >
                  <Minus className="w-4 h-4" />
                  <span>Linha Sólida</span>
                </button>
                <button
                  onClick={() => onAddShape('dashed-line', '#94a3b8')}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 flex items-center justify-center gap-1.5 text-slate-300"
                >
                  <span className="font-mono font-bold">---</span>
                  <span>Tracejada</span>
                </button>
              </div>

              <button
                onClick={() => onAddRectangle({ rx: 35, ry: 35, width: 300, height: 70, fill: '#ec4899' })}
                className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 flex items-center justify-center gap-2 text-slate-200"
              >
                <div className="px-3 py-1 rounded-full bg-pink-500 text-[10px] text-white font-bold">BOTÃO CTA</div>
                <span>Inserir Pílula / Botão</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= FREEHAND DRAW TAB (CANVA DRAW) ================= */}
        {activeTab === 'draw' && (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Desenho Livre (Pincel)</h3>
              <p className="text-slate-400 text-xs">Desenhe traços, setas ou assinaturas à mão livre no canvas.</p>
            </div>

            <button
              onClick={() => onToggleDrawingMode(!isDrawingMode, drawBrushColor, drawBrushWidth)}
              className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                isDrawingMode
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
            >
              <Paintbrush className="w-4 h-4" />
              <span>{isDrawingMode ? 'Parar de Desenhar (Voltar ao Cursor)' : 'Ativar Pincel de Desenho'}</span>
            </button>

            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Espessura do Pincel</span>
                  <span className="font-mono">{drawBrushWidth}px</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={80}
                  value={drawBrushWidth}
                  onChange={(e) => onToggleDrawingMode(true, drawBrushColor, Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1.5">Cor da Tinta</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="color"
                    value={drawBrushColor}
                    onChange={(e) => onToggleDrawingMode(true, e.target.value, drawBrushWidth)}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                  <span className="font-mono text-slate-400 uppercase">{drawBrushColor}</span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    '#ffffff',
                    '#0f172a',
                    '#ef4444',
                    '#f59e0b',
                    '#10b981',
                    '#3b82f6',
                    '#8b5cf6',
                    '#ec4899',
                  ].map((c) => (
                    <button
                      key={c}
                      onClick={() => onToggleDrawingMode(true, c, drawBrushWidth)}
                      className="w-7 h-7 rounded-full border border-slate-700"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* ================= MAGIC DRAW: ENTENDER DESENHO COM IA ================= */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-950/50 via-slate-900 to-indigo-950/50 border border-purple-500/40 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>Entender Desenho com IA</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClearFreehandSketch()
                      setSketchResult(null)
                      setSketchPreviewUrl(null)
                      setSketchError(null)
                    }}
                    className="text-[10px] text-slate-400 hover:text-rose-400 transition"
                    title="Limpar rascunho da página"
                  >
                    Limpar Traços
                  </button>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Desenhe à mão livre no canvas e peça para a IA interpretar os seus traços e transformá-los em um <strong>Vetor Perfeito</strong> ou em uma <strong>Imagem Realista (ComfyUI)</strong> na mesma posição!
                </p>

                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">
                    Dica opcional sobre o que você desenhou:
                  </label>
                  <input
                    type="text"
                    value={sketchHint}
                    onChange={(e) => setSketchHint(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnderstandSketchWithAI()}
                    placeholder="Ex: estrela, casa, planta, coração, árvore..."
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleUnderstandSketchWithAI}
                  disabled={isAnalyzingSketch || isGeneratingSketchImg}
                  className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 transition disabled:opacity-40"
                >
                  {isAnalyzingSketch ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>IA interpretando seu desenho...</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4" />
                      <span>Entender com IA</span>
                    </>
                  )}
                </button>

                {sketchError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] leading-relaxed">
                    {sketchError}
                  </div>
                )}

                {/* AI Interpretation Result & 1-Click Vector / ComfyUI Image Conversion */}
                {sketchResult && (
                  <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-700/80 space-y-3">
                    <div className="flex items-center gap-2.5">
                      {sketchPreviewUrl && (
                        <img
                          src={sketchPreviewUrl}
                          alt="Rascunho capturado"
                          className="w-12 h-12 rounded-lg border border-slate-700 bg-white object-contain shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                          Desenho Identificado
                        </div>
                        <div className="text-xs font-bold text-white truncate">
                          {sketchResult.meaning}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-tight mt-0.5">
                          {sketchResult.explanation}
                        </div>
                      </div>
                    </div>

                    {/* Shape Selector Override */}
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Forma Vetorial Correspondente:
                      </label>
                      <select
                        value={sketchResult.vectorType}
                        onChange={(e) =>
                          setSketchResult({
                            ...sketchResult,
                            vectorType: e.target.value as SketchVectorType,
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-purple-500"
                      >
                        <option value="star">⭐ Estrela</option>
                        <option value="heart">❤️ Coração</option>
                        <option value="house">🏠 Casa / Arquitetura</option>
                        <option value="tree">🌳 Árvore / Planta</option>
                        <option value="arrow">➡️ Seta Direcional</option>
                        <option value="circle">⭕ Círculo</option>
                        <option value="rect">⬛ Retângulo / Moldura</option>
                        <option value="triangle">🔺 Triângulo</option>
                        <option value="diamond">💎 Losango / Diamante</option>
                        <option value="hexagon">⬢ Hexágono</option>
                        <option value="cloud">☁️ Nuvem</option>
                        <option value="sun">☀️ Sol</option>
                        <option value="check">✅ Check / Visto</option>
                        <option value="line">➖ Linha Reta</option>
                        {sketchResult.svgPath && <option value="custom-svg">✨ Vetor SVG da IA</option>}
                      </select>
                    </div>

                    {/* Option 1: Transform into crisp Vector */}
                    <button
                      type="button"
                      disabled={isGeneratingSketchImg}
                      onClick={() => {
                        onReplaceSketchWithVector(sketchResult.vectorType, sketchResult.svgPath)
                        setSketchResult(null)
                        setSketchPreviewUrl(null)
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition disabled:opacity-40"
                    >
                      <Shapes className="w-3.5 h-3.5" />
                      <span>Transformar em Vetor Perfeito</span>
                    </button>

                    {/* Option 2: Transform into High-Res Image via ComfyUI Z-Image-Turbo */}
                    <div className="pt-2 border-t border-slate-800 space-y-2">
                      <label className="block text-[10px] text-slate-400">
                        Ou gerar Imagem Realista no ComfyUI (Z-Image-Turbo):
                      </label>
                      <textarea
                        rows={2}
                        value={sketchImagePrompt}
                        onChange={(e) => setSketchImagePrompt(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-[11px] text-slate-200 outline-none focus:border-emerald-500 resize-none"
                      />

                      <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sketchRemoveBgOnGen}
                          onChange={(e) => setSketchRemoveBgOnGen(e.target.checked)}
                          className="rounded accent-emerald-500"
                        />
                        <span>Apagar fundo com ComfyUI (BiRefNet)</span>
                      </label>

                      <button
                        type="button"
                        disabled={isGeneratingSketchImg}
                        onClick={handleConvertSketchToImageWithComfy}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition disabled:opacity-40"
                      >
                        {isGeneratingSketchImg ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{sketchGenStatus || 'Gerando no ComfyUI...'}</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>Transformar em Imagem (ComfyUI)</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= LAYERS ================= */}
        {activeTab === 'layers' && (
          <div className="p-4 space-y-4 overflow-y-auto">
            <div>
              <h3 className="font-bold text-white text-sm mb-1">Camadas da Página</h3>
              <p className="text-slate-400 text-xs">Visualize todos os elementos do slide atual.</p>
            </div>

            {layers.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Nenhum elemento no canvas ainda. Use o IA Copilot ou adicione elementos!
              </div>
            ) : (
              <div className="space-y-1.5">
                {layers.map((layer) => (
                  <div
                    key={layer.id}
                    className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between hover:bg-slate-800 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                      <span className="font-medium text-slate-200 truncate">{layer.name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-400">
                      {layer.locked && <span className="text-[10px] text-amber-400">🔒</span>}
                      <span className="text-[10px] font-mono text-slate-500">{layer.opacity}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
