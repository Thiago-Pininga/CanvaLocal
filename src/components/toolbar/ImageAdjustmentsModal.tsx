import React, { useState } from 'react'
import {
  Sliders,
  X,
  Sun,
  Contrast as ContrastIcon,
  Palette,
  Eye,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import * as fabric from 'fabric'

interface ImageAdjustmentsModalProps {
  isOpen: boolean
  onClose: () => void
  selectedImage: fabric.FabricImage | null
}

export const ImageAdjustmentsModal: React.FC<ImageAdjustmentsModalProps> = ({
  isOpen,
  onClose,
  selectedImage,
}) => {
  const [brightness, setBrightness] = useState<number>(0)
  const [contrast, setContrast] = useState<number>(0)
  const [saturation, setSaturation] = useState<number>(0)
  const [blur, setBlur] = useState<number>(0)
  const [activeFilterPreset, setActiveFilterPreset] = useState<string>('normal')

  if (!isOpen || !selectedImage) return null

  const applyFilters = (
    b = brightness,
    c = contrast,
    s = saturation,
    bl = blur,
    preset = activeFilterPreset
  ) => {
    if (!selectedImage) return

    const filters: any[] = []

    // 1. Brightness (-1 to 1)
    if (b !== 0) {
      filters.push(new (fabric as any).filters.Brightness({ brightness: b / 100 }))
    }

    // 2. Contrast (-1 to 1)
    if (c !== 0) {
      filters.push(new (fabric as any).filters.Contrast({ contrast: c / 100 }))
    }

    // 3. Saturation (-1 to 1)
    if (s !== 0) {
      filters.push(new (fabric as any).filters.Saturation({ saturation: s / 100 }))
    }

    // 4. Blur (0 to 1)
    if (bl > 0) {
      filters.push(new (fabric as any).filters.Blur({ blur: bl / 100 }))
    }

    // 5. Stylistic presets
    if (preset === 'grayscale') {
      filters.push(new (fabric as any).filters.Grayscale())
    } else if (preset === 'sepia') {
      filters.push(new (fabric as any).filters.Sepia())
    } else if (preset === 'vintage') {
      filters.push(new (fabric as any).filters.Vintage())
    } else if (preset === 'vibrance') {
      filters.push(new (fabric as any).filters.Vibrance({ vibrance: 1 }))
    }

    selectedImage.filters = filters
    selectedImage.applyFilters()
    selectedImage.canvas?.renderAll()
  }

  const handleReset = () => {
    setBrightness(0)
    setContrast(0)
    setSaturation(0)
    setBlur(0)
    setActiveFilterPreset('normal')
    if (selectedImage) {
      selectedImage.filters = []
      selectedImage.applyFilters()
      selectedImage.canvas?.renderAll()
    }
  }

  const FILTER_PRESETS = [
    { id: 'normal', label: 'Original', icon: '🎨' },
    { id: 'vibrance', label: 'Vibrante', icon: '✨' },
    { id: 'grayscale', label: 'P&B Clássico', icon: '🖤' },
    { id: 'sepia', label: 'Sépia Quente', icon: '🍂' },
    { id: 'vintage', label: 'Retrô Vintage', icon: '📷' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Filtros & Ajustes de Foto</h3>
              <p className="text-[11px] text-slate-400">Ajuste cor, luz e efeitos em tempo real</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* 1-Click Filter Presets */}
          <div>
            <label className="block text-slate-300 font-semibold mb-2">Filtros Rápidos</label>
            <div className="grid grid-cols-3 gap-2">
              {FILTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveFilterPreset(p.id)
                    applyFilters(brightness, contrast, saturation, blur, p.id)
                  }}
                  className={`p-2.5 rounded-xl border text-center transition ${
                    activeFilterPreset === p.id
                      ? 'bg-purple-600/25 border-purple-500 text-purple-200 font-bold shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="text-base block mb-0.5">{p.icon}</span>
                  <span className="text-[11px] block">{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-slate-800 my-1" />

          {/* Sliders */}
          <div className="space-y-3.5">
            {/* Brightness */}
            <div>
              <div className="flex justify-between items-center text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Brilho</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">{brightness}%</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={brightness}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setBrightness(val)
                  applyFilters(val, contrast, saturation, blur)
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Contrast */}
            <div>
              <div className="flex justify-between items-center text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <ContrastIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Contraste</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">{contrast}%</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={contrast}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setContrast(val)
                  applyFilters(brightness, val, saturation, blur)
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Saturation */}
            <div>
              <div className="flex justify-between items-center text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-pink-400" />
                  <span>Saturação</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">{saturation}%</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={saturation}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setSaturation(val)
                  applyFilters(brightness, contrast, val, blur)
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Blur */}
            <div>
              <div className="flex justify-between items-center text-slate-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Desfoque (Blur)</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">{blur}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={blur}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setBlur(val)
                  applyFilters(brightness, contrast, saturation, val)
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>

          {/* Reset & Apply */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Redefinir</span>
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white font-bold shadow-lg shadow-purple-500/20 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Concluir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

