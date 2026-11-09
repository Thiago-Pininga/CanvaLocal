import React, { useState } from 'react'
import {
  Layers,
  Trash2,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  SlidersHorizontal,
  Wand2,
  Lock,
  Unlock,
  Group,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  CaseUpper,
} from 'lucide-react'
import * as fabric from 'fabric'
import type { ImageFilterSettings } from '../../types'

interface TopToolbarProps {
  selectedObject: fabric.FabricObject | null
  onOpenMagicWrite: () => void
  onRequestComfyRemoveBg: () => void
  onRequestComfyGenerateImage: () => void
  onApplyImageFilters: (settings: Partial<ImageFilterSettings>) => void
  onApplyTextEffect: (effect: 'none' | 'shadow' | 'neon' | 'hollow' | 'outline' | 'lift') => void
  onAlignSelected: (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => void
  onToggleGroup: () => void
  onToggleLock: () => void
  onDuplicate: () => void
  onDelete: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onBringToFront: () => void
  onSendToBack: () => void
}

const FONTS = [
  'Inter',
  'Montserrat',
  'Playfair Display',
  'Oswald',
  'Cinzel',
  'Roboto',
  'Caveat',
  'Impact',
]

export const TopToolbar: React.FC<TopToolbarProps> = ({
  selectedObject,
  onOpenMagicWrite,
  onRequestComfyRemoveBg,
  onRequestComfyGenerateImage,
  onApplyImageFilters,
  onApplyTextEffect,
  onAlignSelected,
  onToggleGroup,
  onToggleLock,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
}) => {
  const [showPhotoStudio, setShowPhotoStudio] = useState(false)
  const [showTextEffects, setShowTextEffects] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)

  if (!selectedObject) {
    return (
      <div className="h-11 border-b border-slate-800 bg-slate-900/70 px-4 flex items-center justify-between text-xs text-slate-400 select-none z-20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          <span>Selecione um elemento no canvas para editar ou use o <strong>IA Copilot</strong> na barra lateral</span>
        </div>

        <button
          onClick={onRequestComfyGenerateImage}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 text-xs font-medium transition"
          title="Gerar uma imagem com ComfyUI (pede confirmação antes)"
        >
          <Wand2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Gerar Imagem IA (ComfyUI)</span>
        </button>
      </div>
    )
  }

  const isText = selectedObject instanceof fabric.IText || (selectedObject as any).type === 'i-text'
  const isImage = selectedObject instanceof fabric.FabricImage || (selectedObject as any).type === 'image'
  const isMultiOrGroup = selectedObject.type === 'activeselection' || selectedObject.type === 'group'
  const isLocked = Boolean(selectedObject.lockMovementX)

  const filterMeta: ImageFilterSettings = (selectedObject as any).customFilterMeta || {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    blur: 0,
    preset: 'none',
    cornerRadius: 0,
    shadow: false,
    borderWidth: 0,
    borderColor: '#ffffff',
  }

  const handleOpacityChange = (val: number) => {
    selectedObject.set('opacity', val / 100)
    selectedObject.canvas?.renderAll()
  }

  const handleFlipX = () => {
    selectedObject.set('flipX', !selectedObject.flipX)
    selectedObject.canvas?.renderAll()
  }

  const handleFlipY = () => {
    selectedObject.set('flipY', !selectedObject.flipY)
    selectedObject.canvas?.renderAll()
  }

  const handleColorChange = (color: string) => {
    selectedObject.set('fill', color)
    selectedObject.canvas?.renderAll()
  }

  return (
    <div className="h-11 border-b border-slate-800 bg-slate-900 px-4 flex items-center justify-between text-xs select-none z-20 relative">
      {/* Left: Context-Specific Tools */}
      <div className="flex items-center gap-2">
        {/* IMAGE TOOLS (CANVA PRO PHOTO STUDIO) */}
        {isImage && (
          <div className="flex items-center gap-2">
            {/* Photo Filters & Sliders Popover Button */}
            <div className="relative">
              <button
                onClick={() => setShowPhotoStudio(!showPhotoStudio)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold border transition ${
                  showPhotoStudio
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Editar Foto & Filtros</span>
              </button>

              {showPhotoStudio && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-white text-xs">Estúdio de Foto (Canva Pro)</span>
                    <button
                      onClick={() =>
                        onApplyImageFilters({
                          brightness: 0,
                          contrast: 0,
                          saturation: 0,
                          blur: 0,
                          preset: 'none',
                          cornerRadius: 0,
                          shadow: false,
                          borderWidth: 0,
                        })
                      }
                      className="text-[10px] text-purple-400 hover:underline"
                    >
                      Resetar Tudo
                    </button>
                  </div>

                  {/* Quick Filter Presets */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1.5">
                      Filtros Rápidos
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'none', label: 'Original' },
                        { id: 'vintage', label: 'Vintage' },
                        { id: 'grayscale', label: 'P&B' },
                        { id: 'sepia', label: 'Sépia' },
                        { id: 'warm', label: 'Quente' },
                        { id: 'cool', label: 'Frio' },
                        { id: 'dramatic', label: 'Drama' },
                        { id: 'cyberpunk', label: 'Vivid' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => onApplyImageFilters({ preset: f.id as any })}
                          className={`py-1.5 px-1 rounded-lg border text-[10px] font-medium transition ${
                            filterMeta.preset === f.id
                              ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
                        <span>Brilho</span>
                        <span className="font-mono text-slate-400">{filterMeta.brightness}</span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        value={filterMeta.brightness}
                        onChange={(e) => onApplyImageFilters({ brightness: Number(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
                        <span>Contraste</span>
                        <span className="font-mono text-slate-400">{filterMeta.contrast}</span>
                      </div>
                      <input
                        type="range"
                        min={-60}
                        max={60}
                        value={filterMeta.contrast}
                        onChange={(e) => onApplyImageFilters({ contrast: Number(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
                        <span>Saturação</span>
                        <span className="font-mono text-slate-400">{filterMeta.saturation}</span>
                      </div>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        value={filterMeta.saturation}
                        onChange={(e) => onApplyImageFilters({ saturation: Number(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
                        <span>Cantos Arredondados / Círculo</span>
                        <span className="font-mono text-slate-400">{filterMeta.cornerRadius}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={filterMeta.cornerRadius}
                        onChange={(e) => onApplyImageFilters({ cornerRadius: Number(e.target.value) })}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>

                  {/* Shadow & Border Toggles */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onApplyImageFilters({ shadow: !filterMeta.shadow })}
                      className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                        filterMeta.shadow
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Sombra 3D
                    </button>
                    <button
                      onClick={() =>
                        onApplyImageFilters({ borderWidth: filterMeta.borderWidth > 0 ? 0 : 8 })
                      }
                      className={`flex-1 py-1.5 rounded-lg border text-[11px] font-medium transition ${
                        filterMeta.borderWidth > 0
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Moldura Branca
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* On-Demand ComfyUI Background Removal (Asks Confirmation First) */}
            <button
              onClick={onRequestComfyRemoveBg}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 font-medium transition"
              title="Remover fundo da imagem usando ComfyUI (pede confirmação antes)"
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Remover Fundo (ComfyUI)</span>
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <button
              onClick={handleFlipX}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Espelhar Horizontalmente"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={handleFlipY}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Espelhar Verticalmente"
            >
              <FlipVertical className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TEXT TOOLS (CANVA PRO TYPOGRAPHY & EFFECTS) */}
        {isText && (
          <div className="flex items-center gap-1.5">
            <select
              value={(selectedObject as fabric.IText).fontFamily || 'Inter'}
              onChange={(e) => {
                ;(selectedObject as fabric.IText).set('fontFamily', e.target.value)
                selectedObject.canvas?.renderAll()
              }}
              className="bg-slate-800 text-white px-2.5 py-1 rounded border border-slate-700 outline-none text-xs"
            >
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={8}
              max={300}
              value={Math.round((selectedObject as fabric.IText).fontSize || 40)}
              onChange={(e) => {
                ;(selectedObject as fabric.IText).set('fontSize', Number(e.target.value))
                selectedObject.canvas?.renderAll()
              }}
              className="w-14 bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 text-center"
            />

            <input
              type="color"
              value={((selectedObject as fabric.IText).fill as string) || '#000000'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
              title="Cor do Texto"
            />

            <button
              onClick={() => {
                const t = selectedObject as fabric.IText
                t.set('fontWeight', t.fontWeight === 'bold' ? 'normal' : 'bold')
                t.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Negrito"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const t = selectedObject as fabric.IText
                t.set('fontStyle', t.fontStyle === 'italic' ? 'normal' : 'italic')
                t.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Itálico"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const t = selectedObject as fabric.IText
                t.set('underline', !t.underline)
                t.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="Sublinhado"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                const t = selectedObject as fabric.IText
                const current = t.text || ''
                t.set('text', current === current.toUpperCase() ? current.toLowerCase() : current.toUpperCase())
                t.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="MAIÚSCULAS / minúsculas"
            >
              <CaseUpper className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <button
              onClick={() => {
                ;(selectedObject as fabric.IText).set('textAlign', 'left')
                selectedObject.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                ;(selectedObject as fabric.IText).set('textAlign', 'center')
                selectedObject.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                ;(selectedObject as fabric.IText).set('textAlign', 'right')
                selectedObject.canvas?.renderAll()
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>

            {/* Text Effects Popover */}
            <div className="relative">
              <button
                onClick={() => setShowTextEffects(!showTextEffects)}
                className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-semibold transition"
              >
                Efeitos
              </button>

              {showTextEffects && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 z-50 space-y-3">
                  <div className="text-[11px] font-bold text-white">Efeitos de Texto (Canva Pro)</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'none', label: 'Sem Efeito' },
                      { id: 'shadow', label: 'Sombra Forte' },
                      { id: 'lift', label: 'Flutuante' },
                      { id: 'neon', label: 'Neon Glow' },
                      { id: 'outline', label: 'Contorno' },
                      { id: 'hollow', label: 'Vazado' },
                    ].map((ef) => (
                      <button
                        key={ef.id}
                        onClick={() => onApplyTextEffect(ef.id as any)}
                        className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-purple-600/30 border border-slate-700 hover:border-purple-500 text-slate-200 text-[11px] font-medium transition"
                      >
                        {ef.label}
                      </button>
                    ))}
                  </div>

                  {/* Letter Spacing & Line Height */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Espaçamento entre Letras</span>
                        <span>{(selectedObject as fabric.IText).charSpacing || 0}</span>
                      </div>
                      <input
                        type="range"
                        min={-50}
                        max={400}
                        value={(selectedObject as fabric.IText).charSpacing || 0}
                        onChange={(e) => {
                          ;(selectedObject as fabric.IText).set('charSpacing', Number(e.target.value))
                          selectedObject.canvas?.renderAll()
                        }}
                        className="w-full accent-purple-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Altura da Linha</span>
                        <span>{((selectedObject as fabric.IText).lineHeight || 1.16).toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min={0.8}
                        max={2.5}
                        step={0.05}
                        value={(selectedObject as fabric.IText).lineHeight || 1.16}
                        onChange={(e) => {
                          ;(selectedObject as fabric.IText).set('lineHeight', Number(e.target.value))
                          selectedObject.canvas?.renderAll()
                        }}
                        className="w-full accent-purple-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Magic Write */}
            <button
              onClick={onOpenMagicWrite}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium shadow"
            >
              <Sparkles className="w-3 h-3" />
              <span>Texto Mágico IA</span>
            </button>
          </div>
        )}

        {/* SHAPE / ELEMENT TOOLS */}
        {!isText && !isImage && (
          <div className="flex items-center gap-2">
            <label className="text-slate-400 text-[11px]">Cor:</label>
            <input
              type="color"
              value={typeof selectedObject.fill === 'string' ? selectedObject.fill : '#6366f1'}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0"
            />
          </div>
        )}
      </div>

      {/* Right: Alignment, Group, Opacity, Layer Order, Lock & Delete */}
      <div className="flex items-center gap-2">
        {isMultiOrGroup && (
          <button
            onClick={onToggleGroup}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-medium"
            title="Agrupar ou Desagrupar Elementos (Ctrl+G)"
          >
            <Group className="w-3.5 h-3.5" />
            <span>{selectedObject.type === 'group' ? 'Desagrupar' : 'Agrupar'}</span>
          </button>
        )}

        {/* Smart Page Alignment Menu */}
        <div className="relative">
          <button
            onClick={() => setShowAlignMenu(!showAlignMenu)}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-300 border border-slate-700/60"
            title="Alinhar elemento na página"
          >
            <AlignHorizontalJustifyCenter className="w-3.5 h-3.5 text-purple-400" />
            <span>Posição</span>
          </button>

          {showAlignMenu && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 grid grid-cols-2 gap-1">
              <button
                onClick={() => {
                  onAlignSelected('left')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300"
              >
                ⬅️ Esquerda
              </button>
              <button
                onClick={() => {
                  onAlignSelected('right')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300"
              >
                ➡️ Direita
              </button>
              <button
                onClick={() => {
                  onAlignSelected('center-h')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300 flex items-center gap-1"
              >
                <AlignHorizontalJustifyCenter className="w-3 h-3 text-purple-400" />
                Centro H
              </button>
              <button
                onClick={() => {
                  onAlignSelected('center-v')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300 flex items-center gap-1"
              >
                <AlignVerticalJustifyCenter className="w-3 h-3 text-purple-400" />
                Centro V
              </button>
              <button
                onClick={() => {
                  onAlignSelected('top')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300"
              >
                ⬆️ Topo
              </button>
              <button
                onClick={() => {
                  onAlignSelected('bottom')
                  setShowAlignMenu(false)
                }}
                className="px-2 py-1.5 rounded hover:bg-slate-800 text-left text-[11px] text-slate-300"
              >
                ⬇️ Base
              </button>
            </div>
          )}
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-1.5 bg-slate-800/70 px-2 py-1 rounded border border-slate-700/50">
          <span className="text-[10px] text-slate-400">Opacidade</span>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round((selectedObject.opacity ?? 1) * 100)}
            onChange={(e) => handleOpacityChange(Number(e.target.value))}
            className="w-16 accent-purple-500"
          />
        </div>

        {/* Layer Up / Down */}
        <button
          onClick={onBringForward}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Trazer para Frente"
        >
          <Layers className="w-4 h-4" />
        </button>
        <button
          onClick={onSendBackward}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Enviar para Trás"
        >
          <Layers className="w-4 h-4 rotate-180" />
        </button>

        {/* Lock / Unlock */}
        <button
          onClick={onToggleLock}
          className={`p-1.5 rounded transition ${
            isLocked ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
          }`}
          title={isLocked ? 'Destravar elemento' : 'Bloquear posição do elemento'}
        >
          {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </button>

        {/* Duplicate */}
        <button
          onClick={onDuplicate}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Duplicar (Ctrl+D)"
        >
          <Copy className="w-4 h-4" />
        </button>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
          title="Excluir (Delete)"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
