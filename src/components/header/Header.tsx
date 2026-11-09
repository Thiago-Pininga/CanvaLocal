import React, { useState, useRef } from 'react'
import {
  Undo2,
  Redo2,
  Download,
  Sparkles,
  Bot,
  Maximize,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Save,
  FolderClock,
  FolderOpen,
  Trash2,
} from 'lucide-react'
import { CANVAS_PRESETS, type CanvasPreset, type LMStudioStatus, type SavedProject } from '../../types'

interface HeaderProps {
  title: string
  setTitle: (title: string) => void
  currentPreset: CanvasPreset
  onSelectPreset: (preset: CanvasPreset) => void
  zoom: number
  setZoom: (zoom: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  lmStudioStatus: LMStudioStatus
  onRefreshLMStudio: () => void
  onSelectLMStudioModel?: (modelId: string) => void
  onOpenExport: () => void
  onSaveProject: (forceSaveAsNewFile?: boolean) => void
  recentProjects: SavedProject[]
  onLoadProject: (project: SavedProject) => void
  onDeleteRecentProject: (id: string) => void
  onImportProjectFile: (file: File) => void
  onOpenProjectWithPicker?: () => Promise<boolean>
}

export const Header: React.FC<HeaderProps> = ({
  title,
  setTitle,
  currentPreset,
  onSelectPreset,
  zoom,
  setZoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  lmStudioStatus,
  onRefreshLMStudio,
  onSelectLMStudioModel,
  onOpenExport,
  onSaveProject,
  recentProjects,
  onLoadProject,
  onDeleteRecentProject,
  onImportProjectFile,
  onOpenProjectWithPicker,
}) => {
  const [showPresets, setShowPresets] = useState(false)
  const [showModels, setShowModels] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const projectFileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between text-sm select-none z-30">
      {/* Left: Logo & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-base bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Canva<span className="text-purple-400">Local</span>
          </span>
        </div>

        <div className="h-5 w-px bg-slate-800" />

        {/* Editable Title */}
        {isEditingTitle ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
            autoFocus
            className="bg-slate-800 text-white font-medium px-2 py-1 rounded text-sm outline-none border border-purple-500 w-48"
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="text-slate-300 hover:text-white font-medium px-2 py-1 rounded hover:bg-slate-800/60 transition truncate max-w-[200px]"
            title="Clique para renomear"
          >
            {title}
          </button>
        )}

        {/* Preset Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium border border-slate-700/60 transition"
          >
            <span>{currentPreset.name}</span>
            <span className="text-slate-500">({currentPreset.width}×{currentPreset.height})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showPresets && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Dimensões Recomendadas
              </div>
              {CANVAS_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectPreset(p)
                    setShowPresets(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-purple-600/10 hover:text-purple-300 transition ${
                    p.id === currentPreset.id ? 'text-purple-400 font-semibold bg-purple-500/10' : 'text-slate-300'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] text-slate-500">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Desfazer (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Refazer (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-800" />

        {/* Save Project Button (Ctrl + S) */}
        <button
          onClick={() => onSaveProject(false)}
          title="Salvar / Atualizar Projeto Existente (Ctrl + S)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Salvar (Ctrl+S)</span>
        </button>

        {/* Recent Projects (Top 5) & Open File Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowRecent(!showRecent)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition"
            title="Acessar rapidamente os últimos 5 projetos ou abrir do computador"
          >
            <FolderClock className="w-3.5 h-3.5 text-purple-400" />
            <span>Projetos Recentes ({recentProjects.length}/5)</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          <input
            type="file"
            ref={projectFileInputRef}
            accept=".json,.canvalocal.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                onImportProjectFile(f)
                setShowRecent(false)
              }
              e.target.value = ''
            }}
            className="hidden"
          />

          {showRecent && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Últimos 5 Projetos
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onSaveProject(true)
                      setShowRecent(false)
                    }}
                    className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                    title="Escolher local no PC para salvar/vincular um arquivo .canvalocal.json"
                  >
                    <Save className="w-3 h-3" />
                    <span>Salvar Como...</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (onOpenProjectWithPicker) {
                        const handled = await onOpenProjectWithPicker()
                        if (handled) {
                          setShowRecent(false)
                          return
                        }
                      }
                      projectFileInputRef.current?.click()
                    }}
                    className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 font-medium"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Abrir Arquivo...</span>
                  </button>
                </div>
              </div>

              {recentProjects.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Nenhum projeto salvo recentemente. Pressione <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">Ctrl+S</kbd> para salvar!
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto">
                  {recentProjects.map((proj) => (
                    <div
                      key={proj.id}
                      className="px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-800/70 transition group"
                    >
                      <button
                        onClick={() => {
                          onLoadProject(proj)
                          setShowRecent(false)
                        }}
                        className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                      >
                        {proj.thumbnail ? (
                          <img
                            src={proj.thumbnail}
                            alt={proj.title}
                            className="w-10 h-10 object-cover rounded border border-slate-700 shrink-0 bg-slate-950"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded border border-slate-700 bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                            {proj.pages?.length || 1}p
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 truncate">
                            {proj.title}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {proj.pages?.length || 1} página(s) • {new Date(proj.updatedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteRecentProject(proj.id)
                        }}
                        className="p-1.5 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition"
                        title="Remover da lista"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center: Zoom Controls */}
      <div className="flex items-center gap-1.5 bg-slate-800/60 px-2 py-1 rounded-md border border-slate-700/50">
        <button
          onClick={() => setZoom(Math.max(0.2, zoom - 0.1))}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
          title="Diminuir Zoom"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-mono text-slate-300 min-w-[42px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(Math.min(3, zoom + 0.1))}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition"
          title="Aumentar Zoom"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition ml-1"
          title="Ajustar 100%"
        >
          <Maximize className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: AI Engine Status Badges & Export */}
      <div className="flex items-center gap-3">
        {/* LM Studio Status Pill & Model Selector */}
        <div className="relative">
          <div
            onClick={() => {
              if (lmStudioStatus.connected && lmStudioStatus.models.length > 0) {
                setShowModels(!showModels)
              } else {
                onRefreshLMStudio()
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition border ${
              lmStudioStatus.connected
                ? 'bg-purple-500/10 text-purple-300 border-purple-500/40 hover:bg-purple-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700/60'
            }`}
            title={
              lmStudioStatus.connected
                ? `Modelo Ativo: ${lmStudioStatus.activeModel || 'LM Studio'}. Clique para trocar de modelo.`
                : 'LM Studio Inativo (Porta 1234). Clique para testar conexão.'
            }
          >
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline font-mono truncate max-w-[150px]">
              {lmStudioStatus.connected ? lmStudioStatus.activeModel?.split('/').pop() || 'LM Studio' : 'LM Studio'}
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                lmStudioStatus.connected ? 'bg-purple-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            {lmStudioStatus.connected && lmStudioStatus.models.length > 1 && (
              <ChevronDown className="w-3 h-3 text-purple-400 opacity-70" />
            )}
          </div>

          {/* Model Switcher Dropdown */}
          {showModels && lmStudioStatus.models.length > 0 && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Modelos Baixados no LM Studio
              </div>
              {lmStudioStatus.models.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    onSelectLMStudioModel?.(m)
                    setShowModels(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex justify-between items-center hover:bg-purple-600/15 transition ${
                    m === lmStudioStatus.activeModel
                      ? 'text-purple-300 font-bold bg-purple-500/10'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="truncate">{m}</span>
                  {m === lmStudioStatus.activeModel && (
                    <span className="text-[10px] text-purple-400">Ativo</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium shadow-md shadow-purple-500/20 transition active:scale-95"
        >
          <Download className="w-4 h-4" />
          <span>Baixar</span>
        </button>
      </div>
    </header>
  )
}

