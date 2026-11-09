import React, { useState } from 'react'
import { Plus, Copy, Trash2, ChevronLeft, ChevronRight, Layers, GripVertical, ArrowLeft, ArrowRight } from 'lucide-react'
import type { PageData } from '../../hooks/useFabricCanvas'

interface PageManagerBarProps {
  pages: PageData[]
  activePageIndex: number
  onSwitchPage: (index: number) => void
  onAddPage: () => void
  onDuplicatePage: (index: number) => void
  onDeletePage: (index: number) => void
  onReorderPage: (fromIndex: number, toIndex: number) => void
}

export const PageManagerBar: React.FC<PageManagerBarProps> = ({
  pages,
  activePageIndex,
  onSwitchPage,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onReorderPage,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  return (
    <div className="h-14 bg-slate-950 border-t border-slate-800 px-4 flex items-center justify-between z-30 select-none">
      {/* Left: Carousel info & Page Counter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold">
          <Layers className="w-4 h-4 text-purple-400" />
          <span>Carrossel / Páginas:</span>
          <span className="font-mono text-slate-300 ml-1">
            {activePageIndex + 1} de {pages.length}
          </span>
        </div>

        {/* Quick Prev / Next Buttons */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onSwitchPage(activePageIndex - 1)}
            disabled={activePageIndex === 0}
            className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition"
            title="Página Anterior"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSwitchPage(activePageIndex + 1)}
            disabled={activePageIndex === pages.length - 1}
            className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800 transition"
            title="Próxima Página"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center: Interactive & Reorderable Page Thumbnails / Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto max-w-[64vw] py-1">
        {pages.map((p, idx) => {
          const isActive = idx === activePageIndex
          const isDragOver = dragOverIdx === idx && draggedIdx !== idx
          return (
            <div
              key={p.id}
              draggable={pages.length > 1}
              onDragStart={(e) => {
                setDraggedIdx(idx)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverIdx !== idx) setDragOverIdx(idx)
              }}
              onDragLeave={() => {
                if (dragOverIdx === idx) setDragOverIdx(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggedIdx !== null && draggedIdx !== idx) {
                  onReorderPage(draggedIdx, idx)
                }
                setDraggedIdx(null)
                setDragOverIdx(null)
              }}
              onDragEnd={() => {
                setDraggedIdx(null)
                setDragOverIdx(null)
              }}
              onClick={() => onSwitchPage(idx)}
              title="Clique para abrir ou arraste para reordenar a página"
              className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl cursor-pointer border text-xs transition ${
                isDragOver
                  ? 'border-emerald-400 bg-emerald-500/20 scale-105'
                  : isActive
                  ? 'bg-purple-600/20 border-purple-500 text-purple-200 font-bold shadow-md shadow-purple-500/10'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {pages.length > 1 && (
                <GripVertical className="w-3 h-3 text-slate-500 group-hover:text-slate-300 cursor-grab shrink-0" />
              )}

              {/* Mini Color indicator */}
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                style={{ backgroundColor: p.backgroundColor || '#ffffff' }}
              />

              <span className="truncate max-w-[90px]">{p.title}</span>

              {/* Reorder, Duplicate & Delete buttons inside tab on hover */}
              <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition">
                {idx > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorderPage(idx, idx - 1)
                    }}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                    title="Mover página para a esquerda"
                  >
                    <ArrowLeft className="w-3 h-3" />
                  </button>
                )}
                {idx < pages.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onReorderPage(idx, idx + 1)
                    }}
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                    title="Mover página para a direita"
                  >
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDuplicatePage(idx)
                  }}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                  title="Duplicar esta página do carrossel"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeletePage(idx)
                    }}
                    className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                    title="Excluir página"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Right: Add New Page Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={onAddPage}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-md shadow-purple-500/20 transition active:scale-95"
          title="Adicionar nova página ao carrossel"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ Adicionar Página</span>
        </button>
      </div>
    </div>
  )
}

