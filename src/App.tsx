import { useState, useEffect, useCallback } from 'react'
import { Header } from './components/header/Header'
import { TopToolbar } from './components/toolbar/TopToolbar'
import { Sidebar } from './components/sidebar/Sidebar'
import { CanvasWorkspace } from './components/canvas/CanvasWorkspace'
import { MagicWriteModal } from './components/ai/MagicWriteModal'
import { ComfyConfirmModal } from './components/ai/ComfyConfirmModal'
import { ExportModal } from './components/export/ExportModal'
import { PageManagerBar } from './components/carousel/PageManagerBar'
import { useFabricCanvas } from './hooks/useFabricCanvas'
import { lmStudioService } from './services/lmStudioService'
import { comfyOnDemandService } from './services/comfyOnDemandService'
import { projectStorageService } from './services/projectStorageService'
import {
  CANVAS_PRESETS,
  type CanvasPreset,
  type SidebarTab,
  type LMStudioStatus,
  type GeneratedDesignSpec,
  type SavedProject,
} from './types'
import * as fabric from 'fabric'

export function App() {
  const [projectId, setProjectId] = useState<string>(`proj-${Date.now()}`)
  const [title, setTitle] = useState('Design Sem Título')
  const [currentPreset, setCurrentPreset] = useState<CanvasPreset>(CANVAS_PRESETS[0])
  const [canvasBg, setCanvasBg] = useState('#ffffff')
  const [activeTab, setActiveTab] = useState<SidebarTab>('lmstudio')
  const [isMagicWriteOpen, setIsMagicWriteOpen] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [recentProjects, setRecentProjects] = useState<SavedProject[]>([])
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // On-Demand ComfyUI Confirmation Modal State
  const [comfyModalOpen, setComfyModalOpen] = useState(false)
  const [comfyModalMode, setComfyModalMode] = useState<'generate' | 'remove-bg'>('generate')
  const [comfyInitialPrompt, setComfyInitialPrompt] = useState('')

  // LM Studio Status State
  const [lmStudioStatus, setLmStudioStatus] = useState<LMStudioStatus>({ connected: false, models: [] })

  // Canvas hook
  const {
    canvasRef,
    selectedObject,
    layers,
    zoom,
    setZoom,
    canUndo,
    canRedo,
    undo,
    redo,
    addText,
    addRectangle,
    addCircle,
    addShape,
    addImage,
    replaceSelectedImage,
    applyGeneratedDesign,
    getSelectedImageBlob,
    applyImageFilters,
    applyTextEffect,
    alignSelected,
    toggleGroupSelected,
    toggleLockSelected,
    isDrawingMode,
    drawBrushColor,
    drawBrushWidth,
    toggleDrawingMode,
    captureFreehandSketch,
    replaceSketchWithVector,
    replaceSketchWithImage,
    clearFreehandSketch,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    deleteSelected,
    duplicateSelected,
    setDimensions,
    setBackgroundColor,
    setBackgroundGradient,
    exportDesign,
    exportAllPages,
    pages,
    activePageIndex,
    switchPage,
    addPage,
    duplicatePage,
    deletePage,
    serializeProjectPages,
    loadProjectPages,
  } = useFabricCanvas({
    width: currentPreset.width,
    height: currentPreset.height,
    backgroundColor: canvasBg,
  })

  // Set default initial zoom
  useEffect(() => {
    setZoom(0.55)
  }, [setZoom])

  const checkLMStudio = useCallback(async () => {
    const status = await lmStudioService.checkStatus()
    setLmStudioStatus(status)
  }, [])

  useEffect(() => {
    checkLMStudio()
    projectStorageService.getRecentProjects().then(setRecentProjects)
  }, [checkLMStudio])

  // Save Project to .canvalocal.json file AND store in Top 5 Recent Projects
  const handleSaveProject = useCallback(async () => {
    const serialized = serializeProjectPages()
    const projectObj: SavedProject = {
      id: projectId,
      title,
      updatedAt: new Date().toISOString(),
      preset: currentPreset,
      pages: serialized.pages,
      activePageIndex: serialized.activePageIndex,
      thumbnail: serialized.thumbnail,
    }

    const updatedRecents = await projectStorageService.saveProject(projectObj, true)
    setRecentProjects(updatedRecents)
    setSaveToast(`Projeto "${title}" salvo em arquivo e nos recentes!`)
    setTimeout(() => setSaveToast(null), 3500)
  }, [projectId, title, currentPreset, serializeProjectPages])

  // Load a recent project or imported project file
  const handleLoadProject = useCallback(
    async (proj: SavedProject) => {
      setProjectId(proj.id || `proj-${Date.now()}`)
      setTitle(proj.title || 'Projeto Carregado')
      if (proj.preset) {
        setCurrentPreset(proj.preset)
      }
      const targetIdx = proj.activePageIndex || 0
      const targetBg = proj.pages?.[targetIdx]?.backgroundColor || '#ffffff'
      setCanvasBg(targetBg)
      await loadProjectPages(
        proj.pages,
        targetIdx,
        proj.preset?.width || currentPreset.width,
        proj.preset?.height || currentPreset.height
      )
      setSaveToast(`Projeto "${proj.title}" carregado com sucesso!`)
      setTimeout(() => setSaveToast(null), 3000)
    },
    [loadProjectPages, currentPreset]
  )

  const handleDeleteRecentProject = useCallback(async (id: string) => {
    const updated = await projectStorageService.deleteRecentProject(id)
    setRecentProjects(updated)
  }, [])

  const handleImportProjectFile = useCallback(
    async (file: File) => {
      try {
        const proj = await projectStorageService.importProjectFromFile(file)
        await handleLoadProject(proj)
        const updated = await projectStorageService.saveProject(proj, false)
        setRecentProjects(updated)
      } catch (err: any) {
        alert(`Erro ao abrir projeto: ${err.message || 'Arquivo inválido'}`)
      }
    },
    [handleLoadProject]
  )

  // Change Canvas Preset
  const handleSelectPreset = (preset: CanvasPreset) => {
    setCurrentPreset(preset)
    setDimensions(preset.width, preset.height)
  }

  // Change Background Color
  const handleSetBgColor = (color: string) => {
    setCanvasBg(color)
    setBackgroundColor(color)
  }

  // Request ComfyUI Image Generation (Opens Confirmation Modal first)
  const handleRequestComfyGenerate = useCallback((initialPrompt = '') => {
    setComfyModalMode('generate')
    setComfyInitialPrompt(initialPrompt)
    setComfyModalOpen(true)
  }, [])

  // Request ComfyUI Background Removal (Opens Confirmation Modal first)
  const handleRequestComfyRemoveBg = useCallback(() => {
    if (!selectedObject) return
    setComfyModalMode('remove-bg')
    setComfyModalOpen(true)
  }, [selectedObject])

  // Execute Background Removal after user confirms ComfyUI is on
  const handleConfirmRemoveBg = useCallback(async () => {
    const blob = await getSelectedImageBlob()
    const newUrl = await comfyOnDemandService.removeBackground(blob)
    await replaceSelectedImage(newUrl)
    setSaveToast('Fundo removido com sucesso pelo ComfyUI!')
    setTimeout(() => setSaveToast(null), 3000)
  }, [getSelectedImageBlob, replaceSelectedImage])

  // Keyboard Shortcuts (Ctrl+S Save, Ctrl+G Group, Delete, Undo, Redo, Duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSaveProject()
        return
      }

      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        toggleGroupSelected()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObject && !(selectedObject as any).isEditing) {
          e.preventDefault()
          deleteSelected()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedObject, undo, redo, duplicateSelected, deleteSelected, handleSaveProject, toggleGroupSelected])

  // Apply Magic Write result
  const handleApplyMagicWrite = (text: string) => {
    if (selectedObject instanceof fabric.IText) {
      selectedObject.set('text', text)
      selectedObject.canvas?.renderAll()
    } else {
      addText(text, { fontSize: 40, fontWeight: 'bold' })
    }
  }

  // Apply Generated Design to Canvas
  const handleApplyGeneratedDesign = (
    imageUrls: string | string[],
    spec: GeneratedDesignSpec,
    clearExisting: boolean
  ) => {
    if (spec.slides && spec.slides.length > 1 && currentPreset.width === 1080 && currentPreset.height === 1080) {
      setCurrentPreset(CANVAS_PRESETS[0])
    }
    applyGeneratedDesign(imageUrls, spec, clearExisting)
    setCanvasBg(spec.palette.background)
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Save Notification Toast */}
      {saveToast && (
        <div className="fixed bottom-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-emerald-400/40 text-xs font-semibold flex items-center gap-2 animate-bounce">
          <span>✨ {saveToast}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        title={title}
        setTitle={setTitle}
        currentPreset={currentPreset}
        onSelectPreset={handleSelectPreset}
        zoom={zoom}
        setZoom={setZoom}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        lmStudioStatus={lmStudioStatus}
        onRefreshLMStudio={checkLMStudio}
        onSelectLMStudioModel={(modelId) => {
          lmStudioService.setSelectedModel(modelId)
          setLmStudioStatus((prev) => ({ ...prev, activeModel: modelId }))
        }}
        onOpenExport={() => setIsExportOpen(true)}
        onSaveProject={handleSaveProject}
        recentProjects={recentProjects}
        onLoadProject={handleLoadProject}
        onDeleteRecentProject={handleDeleteRecentProject}
        onImportProjectFile={handleImportProjectFile}
      />

      {/* Contextual Canva Pro Toolbar */}
      <TopToolbar
        selectedObject={selectedObject}
        onOpenMagicWrite={() => setIsMagicWriteOpen(true)}
        onRequestComfyRemoveBg={handleRequestComfyRemoveBg}
        onRequestComfyGenerateImage={() => handleRequestComfyGenerate('')}
        onApplyImageFilters={applyImageFilters}
        onApplyTextEffect={applyTextEffect}
        onAlignSelected={alignSelected}
        onToggleGroup={toggleGroupSelected}
        onToggleLock={toggleLockSelected}
        onDuplicate={duplicateSelected}
        onDelete={deleteSelected}
        onBringForward={bringForward}
        onSendBackward={sendBackward}
        onBringToFront={bringToFront}
        onSendToBack={sendToBack}
      />

      {/* Main Workspace: Left Sidebar + Center Canvas */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentPreset={currentPreset}
          onSelectPreset={handleSelectPreset}
          onAddText={addText}
          onAddRectangle={addRectangle}
          onAddCircle={addCircle}
          onAddShape={addShape}
          onAddImage={addImage}
          onSetBackgroundColor={handleSetBgColor}
          onSetBackgroundGradient={setBackgroundGradient}
          canvasBackgroundColor={canvasBg}
          lmStudioStatus={lmStudioStatus}
          layers={layers}
          onDeleteLayer={deleteSelected}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
          onOpenMagicWrite={() => setIsMagicWriteOpen(true)}
          onApplyGeneratedDesign={handleApplyGeneratedDesign}
          onRequestComfyGenerateImage={handleRequestComfyGenerate}
          isDrawingMode={isDrawingMode}
          drawBrushColor={drawBrushColor}
          drawBrushWidth={drawBrushWidth}
          onToggleDrawingMode={toggleDrawingMode}
          onCaptureFreehandSketch={captureFreehandSketch}
          onReplaceSketchWithVector={replaceSketchWithVector}
          onReplaceSketchWithImage={replaceSketchWithImage}
          onClearFreehandSketch={clearFreehandSketch}
          activePageIndex={activePageIndex}
        />

        <CanvasWorkspace
          canvasRef={canvasRef}
          width={currentPreset.width}
          height={currentPreset.height}
          zoom={zoom}
          setZoom={setZoom}
          backgroundColor={canvasBg}
        />
      </div>

      {/* Multi-Page Carousel Bar */}
      <PageManagerBar
        pages={pages}
        activePageIndex={activePageIndex}
        onSwitchPage={switchPage}
        onAddPage={addPage}
        onDuplicatePage={duplicatePage}
        onDeletePage={deletePage}
      />

      {/* On-Demand ComfyUI Confirmation & Generation Modal */}
      <ComfyConfirmModal
        isOpen={comfyModalOpen}
        mode={comfyModalMode}
        initialPrompt={comfyInitialPrompt}
        onClose={() => setComfyModalOpen(false)}
        onImageGenerated={(url) => {
          addImage(url)
          setSaveToast('Imagem gerada no ComfyUI e inserida na página!')
          setTimeout(() => setSaveToast(null), 3500)
        }}
        onConfirmRemoveBg={handleConfirmRemoveBg}
      />

      {/* Magic Write Modal (LM Studio) */}
      <MagicWriteModal
        isOpen={isMagicWriteOpen}
        onClose={() => setIsMagicWriteOpen(false)}
        initialText={selectedObject instanceof fabric.IText ? selectedObject.text : ''}
        onApplyText={handleApplyMagicWrite}
        isLMStudioConnected={lmStudioStatus.connected}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onExport={exportDesign}
        onExportAll={exportAllPages}
        pageCount={pages.length}
        activePageIndex={activePageIndex}
        pageTitles={pages.map((p) => p.title)}
        canvasWidth={currentPreset.width}
        canvasHeight={currentPreset.height}
        designTitle={title}
      />
    </div>
  )
}

export default App
