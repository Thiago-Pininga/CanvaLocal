import { useCallback, useEffect, useRef, useState } from 'react'
import * as fabric from 'fabric'
import type {
  LayerItem,
  GeneratedDesignSpec,
  DesignLayoutStyle,
  ImageFilterSettings,
  EditorialSlideSpec,
  VectorLineSettings,
} from '../types'
import type { SketchVectorType } from '../services/lmStudioService'
import { classifyUploadedImages } from '../services/imageAnalysisService'
import {
  createVectorLineObject,
  createCustomVectorLine,
  rebuildVectorPathGeometry,
  hydrateCanvasVectorLines,
  computeVectorGeometry,
} from '../utils/vectorLineUtils'

export interface PageData {
  id: string
  title: string
  json: string
  backgroundColor: string
}

interface CanvasOptions {
  width: number
  height: number
  backgroundColor?: string
}

export function useFabricCanvas(options: CanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fabricCanvas = useRef<fabric.Canvas | null>(null)

  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null)
  const [layers, setLayers] = useState<LayerItem[]>([])
  const [zoom, setZoom] = useState<number>(0.55)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [drawBrushColor, setDrawBrushColor] = useState('#8b5cf6')
  const [drawBrushWidth, setDrawBrushWidth] = useState(12)

  // Multi-Page state for Instagram Carousels & Slide Decks
  const [pages, setPages] = useState<PageData[]>([
    { id: 'page-1', title: 'Página 1', json: '', backgroundColor: options.backgroundColor || '#ffffff' },
  ])
  const [activePageIndex, setActivePageIndex] = useState<number>(0)
  const activePageIndexRef = useRef<number>(0)
  activePageIndexRef.current = activePageIndex
  const isSwitchingPage = useRef(false)

  // History stack for the active page
  const historyStack = useRef<string[]>([])
  const historyIndex = useRef<number>(-1)
  const isHistoryProcessing = useRef(false)

  // Save state for undo/redo & cache active page JSON
  const saveState = useCallback(() => {
    if (!fabricCanvas.current || isHistoryProcessing.current || isSwitchingPage.current) return

    const json = JSON.stringify(fabricCanvas.current.toJSON())

    if (historyIndex.current < historyStack.current.length - 1) {
      historyStack.current = historyStack.current.slice(0, historyIndex.current + 1)
    }

    historyStack.current.push(json)
    historyIndex.current = historyStack.current.length - 1

    setCanUndo(historyIndex.current > 0)
    setCanRedo(historyIndex.current < historyStack.current.length - 1)

    const currentIdx = activePageIndexRef.current
    setPages((prev) => {
      const copy = [...prev]
      if (copy[currentIdx]) {
        copy[currentIdx] = {
          ...copy[currentIdx],
          json,
          backgroundColor:
            typeof fabricCanvas.current?.backgroundColor === 'string'
              ? fabricCanvas.current.backgroundColor
              : '#ffffff',
        }
      }
      return copy
    })
  }, [])

  // Sync layer list
  const syncLayers = useCallback(() => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current
    const activeObj = canvas.getActiveObject()
    const objects = canvas.getObjects()
    const newLayers: LayerItem[] = objects
      .map((obj: any, index) => {
        let type: LayerItem['type'] = 'path'
        if (obj.type === 'image' || obj instanceof fabric.FabricImage) type = 'image'
        else if (
          obj.type === 'i-text' ||
          obj.type === 'textbox' ||
          obj instanceof fabric.IText ||
          obj instanceof fabric.Textbox
        )
          type = 'text'
        else if (obj.type === 'rect') type = 'rect'
        else if (obj.type === 'circle') type = 'circle'
        else if (obj.type === 'triangle') type = 'triangle'
        else if (obj.type === 'polygon') type = 'polygon'
        else if (obj.type === 'group') type = 'group'

        const name =
          obj.name ||
          `${
            type === 'image'
              ? 'Imagem'
              : type === 'text'
              ? obj.text?.substring(0, 22) || 'Texto'
              : type === 'group'
              ? 'Grupo'
              : type === 'rect'
              ? 'Retângulo / Faixa'
              : 'Elemento'
          } ${index + 1}`

        return {
          id: obj.id || `layer_${index}`,
          name,
          type,
          visible: obj.visible !== false,
          locked: Boolean(obj.lockMovementX),
          opacity: Math.round((obj.opacity ?? 1) * 100),
          zIndex: index,
          selected: obj === activeObj,
        }
      })
      .reverse()
    setLayers(newLayers)
  }, [])

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current || fabricCanvas.current) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: options.width,
      height: options.height,
      backgroundColor: options.backgroundColor || '#ffffff',
      preserveObjectStacking: true,
      selection: true,
    })

    fabricCanvas.current = canvas

    const handleSelection = () => {
      const active = canvas.getActiveObject()
      setSelectedObject(active || null)
      syncLayers()
    }

    canvas.on('selection:created', handleSelection)
    canvas.on('selection:updated', handleSelection)
    canvas.on('selection:cleared', () => {
      setSelectedObject(null)
      syncLayers()
    })

    canvas.on('object:added', () => {
      syncLayers()
      saveState()
    })
    canvas.on('object:modified', () => {
      syncLayers()
      saveState()
    })
    canvas.on('object:removed', () => {
      syncLayers()
      saveState()
    })

    saveState()
    syncLayers()

    return () => {
      canvas.dispose()
      fabricCanvas.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, syncLayers])

  // Switch to another page
  const switchPage = useCallback(
    async (targetIndex: number) => {
      if (!fabricCanvas.current || targetIndex === activePageIndex || targetIndex < 0 || targetIndex >= pages.length)
        return

      isSwitchingPage.current = true
      const canvas = fabricCanvas.current

      const currentJson = JSON.stringify(canvas.toJSON())
      const currentBg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'

      const updatedPages = pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, json: currentJson, backgroundColor: currentBg } : p
      )
      setPages(updatedPages)

      const targetPage = updatedPages[targetIndex]
      activePageIndexRef.current = targetIndex
      setActivePageIndex(targetIndex)

      canvas.clear()
      canvas.backgroundColor = targetPage.backgroundColor || '#ffffff'

      if (targetPage.json) {
        try {
          await canvas.loadFromJSON(JSON.parse(targetPage.json))
          hydrateCanvasVectorLines(canvas)
        } catch (err) {
          console.warn('Erro ao alternar página:', err)
        }
      }

      canvas.backgroundColor = targetPage.backgroundColor || '#ffffff'
      canvas.requestRenderAll()
      canvas.renderAll()
      syncLayers()

      historyStack.current = [JSON.stringify(canvas.toJSON())]
      historyIndex.current = 0
      setCanUndo(false)
      setCanRedo(false)
      setSelectedObject(null)

      isSwitchingPage.current = false
    },
    [activePageIndex, pages, syncLayers]
  )

  // Add a new blank page
  const addPage = useCallback(async () => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current

    pages[activePageIndex].json = JSON.stringify(canvas.toJSON())
    pages[activePageIndex].backgroundColor =
      typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'

    const newPageNum = pages.length + 1
    const newPage: PageData = {
      id: `page-${Date.now()}`,
      title: `Página ${newPageNum}`,
      json: '',
      backgroundColor: typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff',
    }

    const newIndex = pages.length
    setPages((prev) => [...prev, newPage])

    isSwitchingPage.current = true
    setActivePageIndex(newIndex)
    canvas.clear()
    canvas.backgroundColor = newPage.backgroundColor
    canvas.renderAll()
    syncLayers()

    historyStack.current = [JSON.stringify(canvas.toJSON())]
    historyIndex.current = 0
    setCanUndo(false)
    setCanRedo(false)
    setSelectedObject(null)
    isSwitchingPage.current = false
  }, [activePageIndex, pages, syncLayers])

  // Duplicate current page
  const duplicatePage = useCallback(
    async (indexToDuplicate: number) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current

      pages[activePageIndex].json = JSON.stringify(canvas.toJSON())
      pages[activePageIndex].backgroundColor =
        typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'

      const source = pages[indexToDuplicate]
      const newPage: PageData = {
        id: `page-${Date.now()}`,
        title: `${source.title} (Cópia)`,
        json: source.json,
        backgroundColor: source.backgroundColor,
      }

      const newIndex = indexToDuplicate + 1
      const updated = [...pages]
      updated.splice(newIndex, 0, newPage)
      setPages(updated)

      await switchPage(newIndex)
    },
    [activePageIndex, pages, switchPage]
  )

  // Delete page
  const deletePage = useCallback(
    async (indexToDelete: number) => {
      if (pages.length <= 1) return
      const canvas = fabricCanvas.current
      if (!canvas) return

      const updated = pages.filter((_, i) => i !== indexToDelete)
      let nextIndex = activePageIndex
      if (activePageIndex >= updated.length) {
        nextIndex = updated.length - 1
      } else if (activePageIndex === indexToDelete) {
        nextIndex = Math.max(0, indexToDelete - 1)
      }

      setPages(updated)
      setActivePageIndex(nextIndex)

      isSwitchingPage.current = true
      canvas.clear()
      const targetPage = updated[nextIndex]
      canvas.backgroundColor = targetPage.backgroundColor || '#ffffff'
      if (targetPage.json) {
        await canvas.loadFromJSON(JSON.parse(targetPage.json))
        hydrateCanvasVectorLines(canvas)
      }
      canvas.renderAll()
      syncLayers()
      setSelectedObject(null)
      isSwitchingPage.current = false
    },
    [pages, activePageIndex, syncLayers]
  )

  // Reorder pages (drag-and-drop or move left/right buttons)
  const reorderPage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (
        !fabricCanvas.current ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= pages.length ||
        toIndex >= pages.length
      ) {
        return
      }
      const canvas = fabricCanvas.current

      // Snapshot active page before reordering array
      const currentJson = JSON.stringify(canvas.toJSON())
      const currentBg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'

      const updated = pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, json: currentJson, backgroundColor: currentBg } : p
      )

      const [moved] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, moved)

      let newActiveIdx = activePageIndex
      if (activePageIndex === fromIndex) {
        newActiveIdx = toIndex
      } else if (fromIndex < activePageIndex && toIndex >= activePageIndex) {
        newActiveIdx = activePageIndex - 1
      } else if (fromIndex > activePageIndex && toIndex <= activePageIndex) {
        newActiveIdx = activePageIndex + 1
      }

      activePageIndexRef.current = newActiveIdx
      setActivePageIndex(newActiveIdx)
      setPages(updated)
    },
    [pages, activePageIndex]
  )

  // Rename a page title
  const renamePage = useCallback((pageIndex: number, newTitle: string) => {
    const trimmed = newTitle.trim()
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === pageIndex ? { ...p, title: trimmed || `Página ${pageIndex + 1}` } : p
      )
    )
  }, [])

  // Undo & Redo
  const undo = useCallback(() => {
    if (!fabricCanvas.current || historyIndex.current <= 0) return
    isHistoryProcessing.current = true
    historyIndex.current -= 1
    const json = historyStack.current[historyIndex.current]
    fabricCanvas.current.loadFromJSON(JSON.parse(json)).then(() => {
      if (fabricCanvas.current) {
        hydrateCanvasVectorLines(fabricCanvas.current)
        fabricCanvas.current.renderAll()
      }
      syncLayers()
      setCanUndo(historyIndex.current > 0)
      setCanRedo(historyIndex.current < historyStack.current.length - 1)
      isHistoryProcessing.current = false
    })
  }, [syncLayers])

  const redo = useCallback(() => {
    if (!fabricCanvas.current || historyIndex.current >= historyStack.current.length - 1) return
    isHistoryProcessing.current = true
    historyIndex.current += 1
    const json = historyStack.current[historyIndex.current]
    fabricCanvas.current.loadFromJSON(JSON.parse(json)).then(() => {
      if (fabricCanvas.current) {
        hydrateCanvasVectorLines(fabricCanvas.current)
        fabricCanvas.current.renderAll()
      }
      syncLayers()
      setCanUndo(historyIndex.current > 0)
      setCanRedo(historyIndex.current < historyStack.current.length - 1)
      isHistoryProcessing.current = false
    })
  }, [syncLayers])

  // Add Text
  const addText = useCallback((text = 'Insira seu texto', opts: Partial<fabric.IText> = {}) => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current
    const iText = new fabric.IText(text, {
      left: canvas.width! / 2,
      top: canvas.height! / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter, sans-serif',
      fontSize: 48,
      fill: '#1e293b',
      fontWeight: 'bold',
      ...opts,
    })
    canvas.add(iText)
    canvas.setActiveObject(iText)
    canvas.renderAll()
  }, [])

  // Add Rectangle
  const addRectangle = useCallback((opts: Partial<fabric.Rect> = {}) => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current
    const rect = new fabric.Rect({
      left: canvas.width! / 2,
      top: canvas.height! / 2,
      originX: 'center',
      originY: 'center',
      width: 240,
      height: 160,
      fill: '#6366f1',
      rx: 16,
      ry: 16,
      ...opts,
    })
    canvas.add(rect)
    canvas.setActiveObject(rect)
    canvas.renderAll()
  }, [])

  // Add Circle
  const addCircle = useCallback((opts: Partial<fabric.Circle> = {}) => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current
    const circle = new fabric.Circle({
      left: canvas.width! / 2,
      top: canvas.height! / 2,
      originX: 'center',
      originY: 'center',
      radius: 100,
      fill: '#ec4899',
      ...opts,
    })
    canvas.add(circle)
    canvas.setActiveObject(circle)
    canvas.renderAll()
  }, [])

  // Add Rich Shapes (Triangle, Star, Heart, Hexagon, Diamond, Arrow, Curved Arrow, Dashed Arrow, Line, Badge)
  const addShape = useCallback(
    (
      shapeType:
        | 'triangle'
        | 'star'
        | 'heart'
        | 'hexagon'
        | 'diamond'
        | 'arrow'
        | 'curved-arrow'
        | 'dashed-arrow'
        | 'line'
        | 'dashed-line'
        | 'badge',
      color = '#8b5cf6'
    ) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const cx = canvas.width! / 2
      const cy = canvas.height! / 2
      let obj: fabric.FabricObject | null = null

      if (shapeType === 'triangle') {
        obj = new fabric.Triangle({
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          width: 200,
          height: 180,
          fill: color,
        })
      } else if (shapeType === 'star') {
        const points: Array<{ x: number; y: number }> = []
        const outer = 100
        const inner = 45
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outer : inner
          const angle = (Math.PI / 5) * i - Math.PI / 2
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
        }
        obj = new fabric.Polygon(points, {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          fill: color,
        })
      } else if (shapeType === 'badge') {
        // 12-point promotional starburst badge
        const points: Array<{ x: number; y: number }> = []
        const outer = 110
        const inner = 82
        for (let i = 0; i < 24; i++) {
          const r = i % 2 === 0 ? outer : inner
          const angle = (Math.PI / 12) * i
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
        }
        obj = new fabric.Polygon(points, {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          fill: color,
        })
      } else if (shapeType === 'hexagon') {
        const points: Array<{ x: number; y: number }> = []
        const r = 100
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6
          points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
        }
        obj = new fabric.Polygon(points, {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          fill: color,
        })
      } else if (shapeType === 'diamond') {
        const points = [
          { x: 0, y: -110 },
          { x: 90, y: 0 },
          { x: 0, y: 110 },
          { x: -90, y: 0 },
        ]
        obj = new fabric.Polygon(points, {
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          fill: color,
        })
      } else if (shapeType === 'heart') {
        obj = new fabric.Path(
          'M 272.70141,238.71731 C 206.46141,238.71731 152.70146,292.4773 152.70146,358.71731 C 152.70146,493.47282 288.63461,528.80461 381.26391,662.02535 C 468.83815,529.62199 609.82641,489.17075 609.82641,358.71731 C 609.82641,292.47731 556.06651,238.7173 489.82641,238.71731 C 441.77851,238.71731 400.42481,267.08774 381.26391,307.90481 C 362.10311,267.08773 320.74941,238.7173 272.70141,238.71731 z',
          {
            left: cx,
            top: cy,
            originX: 'center',
            originY: 'center',
            fill: color,
            scaleX: 0.45,
            scaleY: 0.45,
          }
        )
      } else if (
        shapeType === 'arrow' ||
        shapeType === 'curved-arrow' ||
        shapeType === 'dashed-arrow' ||
        shapeType === 'line' ||
        shapeType === 'dashed-line'
      ) {
        obj = createVectorLineObject(shapeType, cx, cy, color)
      }

      if (obj) {
        canvas.add(obj)
        canvas.setActiveObject(obj)
        setSelectedObject(obj)
        canvas.renderAll()
      }
    },
    []
  )

  // Update vector line / arrow settings, add/remove vector control points, or adjust curvature & dash pattern
  const updateVectorLine = useCallback(
    (
      actionOrSettings:
        | Partial<VectorLineSettings>
        | 'add-node'
        | 'remove-node'
        | 'straighten'
        | 'curve-preset'
    ) => {
      if (!fabricCanvas.current || !selectedObject) return
      const canvas = fabricCanvas.current
      if (!(selectedObject instanceof fabric.Path)) return
      const currentSettings = (selectedObject as any).customVectorLine as VectorLineSettings | undefined
      if (!currentSettings || !currentSettings.isVectorLine) return

      const next: VectorLineSettings = {
        ...currentSettings,
        nodes: currentSettings.nodes.map((pt) => ({ ...pt })),
      }

      if (actionOrSettings === 'add-node') {
        // Find the longest segment and insert a new vector node right at its curve midpoint
        const geom = computeVectorGeometry(next)
        let bestSeg = 0
        let maxDist = -1
        for (let i = 0; i < next.nodes.length - 1; i++) {
          const d = Math.hypot(
            next.nodes[i + 1].x - next.nodes[i].x,
            next.nodes[i + 1].y - next.nodes[i].y
          )
          if (d > maxDist) {
            maxDist = d
            bestSeg = i
          }
        }
        const midPt = geom.midpoints[bestSeg] || {
          x: (next.nodes[bestSeg].x + next.nodes[bestSeg + 1].x) / 2,
          y: (next.nodes[bestSeg].y + next.nodes[bestSeg + 1].y) / 2 - 45,
        }
        // Offset slightly if currently completely straight so the user immediately sees the new curve handle
        const wasStraight = Math.abs(next.curvature) < 2 && next.nodes.length === 2
        if (wasStraight) {
          const dx = next.nodes[1].x - next.nodes[0].x
          const dy = next.nodes[1].y - next.nodes[0].y
          const len = Math.max(1, Math.hypot(dx, dy))
          midPt.x += (-dy / len) * 55
          midPt.y += (dx / len) * 55
          next.curvature = 100
        } else if (next.curvature === 0) {
          next.curvature = 100
        }
        next.nodes.splice(bestSeg + 1, 0, midPt)
      } else if (actionOrSettings === 'remove-node') {
        if (next.nodes.length > 2) {
          // Remove last intermediate node (preserve start and end points)
          next.nodes.splice(next.nodes.length - 2, 1)
        }
      } else if (actionOrSettings === 'straighten') {
        next.curvature = 0
        if (next.nodes.length > 2) {
          const first = next.nodes[0]
          const last = next.nodes[next.nodes.length - 1]
          next.nodes = [first, last]
        }
      } else if (actionOrSettings === 'curve-preset') {
        if (next.nodes.length === 2) {
          next.curvature = next.curvature === 0 ? -45 : next.curvature > 0 ? -next.curvature : 0
        } else {
          next.curvature = next.curvature === 0 ? 100 : Math.min(200, next.curvature + 40)
        }
      } else {
        Object.assign(next, actionOrSettings)
      }

      rebuildVectorPathGeometry(selectedObject, next)
      canvas.requestRenderAll()
      canvas.renderAll()
      saveState()
    },
    [selectedObject, saveState]
  )

  // Add Image from URL or File
  const addImage = useCallback(async (source: string | File | Blob) => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current

    let url: string
    if (source instanceof File || source instanceof Blob) {
      url = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target?.result as string)
        reader.readAsDataURL(source)
      })
    } else {
      url = source
    }

    try {
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
      const maxDim = Math.min(canvas.width!, canvas.height!) * 0.65
      if (img.width! > maxDim || img.height! > maxDim) {
        const scale = maxDim / Math.max(img.width!, img.height!)
        img.scale(scale)
      }

      img.set({
        left: canvas.width! / 2,
        top: canvas.height! / 2,
        originX: 'center',
        originY: 'center',
      })

      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
    } catch (err) {
      console.error('Falha ao adicionar imagem ao canvas:', err)
    }
  }, [])

  // Replace selected image while keeping visual bounding size, position & angle
  const replaceSelectedImage = useCallback(
    async (newUrl: string) => {
      if (!fabricCanvas.current || !selectedObject) return
      const canvas = fabricCanvas.current

      try {
        const newImg = await fabric.FabricImage.fromURL(newUrl, { crossOrigin: 'anonymous' })
        const prevW = selectedObject.getScaledWidth() || 400
        const prevH = selectedObject.getScaledHeight() || 400
        const fitScale = Math.min(
          prevW / Math.max(1, newImg.width || prevW),
          prevH / Math.max(1, newImg.height || prevH)
        )

        newImg.set({
          left: selectedObject.left,
          top: selectedObject.top,
          originX: selectedObject.originX,
          originY: selectedObject.originY,
          scaleX: fitScale,
          scaleY: fitScale,
          angle: selectedObject.angle,
          opacity: selectedObject.opacity,
          shadow: selectedObject.shadow,
        })

        canvas.remove(selectedObject)
        canvas.add(newImg)
        canvas.setActiveObject(newImg)
        setSelectedObject(newImg)
        canvas.renderAll()
        syncLayers()
        saveState()
      } catch (err) {
        console.error('Falha ao substituir imagem:', err)
      }
    },
    [selectedObject, syncLayers, saveState]
  )

  // Export selected object as high-res PNG DataURL for the Photo Editor Studio Modal
  const getSelectedObjectDataUrl = useCallback((): string | null => {
    if (!selectedObject) return null
    try {
      if (selectedObject instanceof fabric.FabricImage || (selectedObject as any).type === 'image') {
        const el = (selectedObject as fabric.FabricImage).getElement() as HTMLImageElement
        if (el && (el.naturalWidth || el.width)) {
          const nw = el.naturalWidth || el.width
          const nh = el.naturalHeight || el.height
          const maxDim = 1280
          const scale = Math.min(1, maxDim / Math.max(nw, nh))
          const off = document.createElement('canvas')
          off.width = Math.round(nw * scale)
          off.height = Math.round(nh * scale)
          const ctx = off.getContext('2d')
          if (ctx) {
            ctx.drawImage(el, 0, 0, off.width, off.height)
            return off.toDataURL('image/png')
          }
        }
      }
      return selectedObject.toDataURL({
        format: 'png',
        multiplier: 2,
      })
    } catch {
      return null
    }
  }, [selectedObject])

  // Export selected object as Blob (for ComfyUI background removal)
  const getSelectedImageBlob = useCallback(async (): Promise<Blob> => {
    if (!selectedObject) throw new Error('Nenhum objeto selecionado.')
    const dataUrl = selectedObject.toDataURL({
      format: 'png',
      multiplier: 1,
    })
    const res = await fetch(dataUrl)
    return await res.blob()
  }, [selectedObject])

  // Apply Canva Pro Photo Filters & Adjustments
  const applyImageFilters = useCallback(
    (settings: Partial<ImageFilterSettings>) => {
      if (!fabricCanvas.current || !selectedObject) return
      if (!(selectedObject instanceof fabric.FabricImage || (selectedObject as any).type === 'image')) return

      const img = selectedObject as fabric.FabricImage
      const currentMeta = (img as any).customFilterMeta || {
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

      const merged: ImageFilterSettings = { ...currentMeta, ...settings }
      ;(img as any).customFilterMeta = merged

      const filtersList: any[] = []

      // 1. Preset filters
      if (merged.preset === 'grayscale') {
        filtersList.push(new fabric.filters.Grayscale())
      } else if (merged.preset === 'sepia') {
        filtersList.push(new fabric.filters.Sepia())
      } else if (merged.preset === 'vintage') {
        filtersList.push(new fabric.filters.Vintage())
      } else if (merged.preset === 'warm') {
        filtersList.push(new fabric.filters.Saturation({ saturation: 0.25 }))
        filtersList.push(new fabric.filters.Brightness({ brightness: 0.06 }))
      } else if (merged.preset === 'cool') {
        filtersList.push(new fabric.filters.Contrast({ contrast: 0.12 }))
        filtersList.push(new fabric.filters.Saturation({ saturation: -0.15 }))
      } else if (merged.preset === 'dramatic') {
        filtersList.push(new fabric.filters.Contrast({ contrast: 0.35 }))
        filtersList.push(new fabric.filters.Brightness({ brightness: -0.08 }))
      } else if (merged.preset === 'cyberpunk') {
        filtersList.push(new fabric.filters.Saturation({ saturation: 0.55 }))
        filtersList.push(new fabric.filters.Contrast({ contrast: 0.2 }))
      }

      // 2. Manual Sliders
      if (merged.brightness !== 0) {
        filtersList.push(new fabric.filters.Brightness({ brightness: merged.brightness / 100 }))
      }
      if (merged.contrast !== 0) {
        filtersList.push(new fabric.filters.Contrast({ contrast: merged.contrast / 100 }))
      }
      if (merged.saturation !== 0) {
        filtersList.push(new fabric.filters.Saturation({ saturation: merged.saturation / 100 }))
      }
      if (merged.blur > 0) {
        filtersList.push(new fabric.filters.Blur({ blur: merged.blur / 100 }))
      }

      img.filters = filtersList
      img.applyFilters()

      // 3. Corner radius / Circle clipPath
      if (merged.cornerRadius > 0) {
        const w = img.width || 400
        const h = img.height || 400
        const r = Math.min(w, h) * (merged.cornerRadius / 100) * 0.5
        img.clipPath = new fabric.Rect({
          width: w,
          height: h,
          rx: r,
          ry: r,
          originX: 'center',
          originY: 'center',
        })
      } else {
        img.clipPath = undefined
      }

      // 4. Drop shadow
      if (merged.shadow) {
        img.set(
          'shadow',
          new fabric.Shadow({
            color: 'rgba(0,0,0,0.45)',
            blur: 28,
            offsetX: 0,
            offsetY: 14,
          })
        )
      } else {
        img.set('shadow', null)
      }

      // 5. Border
      if (merged.borderWidth > 0) {
        img.set({
          stroke: merged.borderColor || '#ffffff',
          strokeWidth: merged.borderWidth,
        })
      } else {
        img.set({ strokeWidth: 0 })
      }

      fabricCanvas.current.renderAll()
      saveState()
    },
    [selectedObject, saveState]
  )

  // Apply Canva Pro Text Effects (Shadow, Neon Glow, Outline/Hollow, Spacing)
  const applyTextEffect = useCallback(
    (effect: 'none' | 'shadow' | 'neon' | 'hollow' | 'outline' | 'lift') => {
      if (!fabricCanvas.current || !(selectedObject instanceof fabric.IText)) return
      const textObj = selectedObject
      const baseColor = (textObj.fill as string) || '#ffffff'

      if (effect === 'none') {
        textObj.set({
          shadow: null,
          stroke: undefined,
          strokeWidth: 0,
          backgroundColor: '',
        })
      } else if (effect === 'shadow') {
        textObj.set({
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.6)',
            blur: 8,
            offsetX: 4,
            offsetY: 4,
          }),
          strokeWidth: 0,
        })
      } else if (effect === 'lift') {
        textObj.set({
          shadow: new fabric.Shadow({
            color: 'rgba(0,0,0,0.45)',
            blur: 25,
            offsetX: 0,
            offsetY: 10,
          }),
          strokeWidth: 0,
        })
      } else if (effect === 'neon') {
        textObj.set({
          shadow: new fabric.Shadow({
            color: baseColor === '#ffffff' ? '#a855f7' : baseColor,
            blur: 30,
            offsetX: 0,
            offsetY: 0,
          }),
          stroke: '#ffffff',
          strokeWidth: 1,
        })
      } else if (effect === 'outline') {
        textObj.set({
          stroke: '#0f172a',
          strokeWidth: 3,
          shadow: null,
        })
      } else if (effect === 'hollow') {
        textObj.set({
          stroke: baseColor === 'transparent' ? '#ffffff' : baseColor,
          strokeWidth: 2.5,
          fill: 'transparent',
          shadow: null,
        })
      }

      fabricCanvas.current.renderAll()
      saveState()
    },
    [selectedObject, saveState]
  )

  // Smart Object Alignment on Page
  const alignSelected = useCallback(
    (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
      if (!fabricCanvas.current || !selectedObject) return
      const canvas = fabricCanvas.current
      const cw = canvas.width!
      const ch = canvas.height!
      const bound = selectedObject.getBoundingRect()

      if (alignment === 'left') {
        selectedObject.set('left', (selectedObject.left || 0) - bound.left + 40)
      } else if (alignment === 'center-h') {
        selectedObject.set({ left: cw / 2, originX: 'center' })
      } else if (alignment === 'right') {
        selectedObject.set('left', (selectedObject.left || 0) + (cw - (bound.left + bound.width)) - 40)
      } else if (alignment === 'top') {
        selectedObject.set('top', (selectedObject.top || 0) - bound.top + 40)
      } else if (alignment === 'center-v') {
        selectedObject.set({ top: ch / 2, originY: 'center' })
      } else if (alignment === 'bottom') {
        selectedObject.set('top', (selectedObject.top || 0) + (ch - (bound.top + bound.height)) - 40)
      }

      selectedObject.setCoords()
      canvas.renderAll()
      saveState()
    },
    [selectedObject, saveState]
  )

  // Group / Ungroup Selected Objects
  const toggleGroupSelected = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    const canvas = fabricCanvas.current

    if (selectedObject.type === 'activeselection') {
      const activeSel = selectedObject as fabric.ActiveSelection
      const objs = activeSel.getObjects()
      canvas.discardActiveObject()
      objs.forEach((o) => canvas.remove(o))
      const group = new fabric.Group(objs)
      canvas.add(group)
      canvas.setActiveObject(group)
      canvas.renderAll()
      syncLayers()
      saveState()
    } else if (selectedObject.type === 'group') {
      const group = selectedObject as fabric.Group
      const objs = group.removeAll()
      canvas.remove(group)
      objs.forEach((o) => canvas.add(o))
      const sel = new fabric.ActiveSelection(objs, { canvas })
      canvas.setActiveObject(sel)
      canvas.renderAll()
      syncLayers()
      saveState()
    }
  }, [selectedObject, syncLayers, saveState])

  // Lock / Unlock Selected Object
  const toggleLockSelected = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    const isLocked = Boolean(selectedObject.lockMovementX)
    selectedObject.set({
      lockMovementX: !isLocked,
      lockMovementY: !isLocked,
      lockScalingX: !isLocked,
      lockScalingY: !isLocked,
      lockRotation: !isLocked,
      hasControls: isLocked,
    })
    fabricCanvas.current.renderAll()
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  // Freehand Drawing Mode (Canva Draw)
  const toggleDrawingMode = useCallback(
    (enable: boolean, color = drawBrushColor, width = drawBrushWidth) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      setIsDrawingMode(enable)
      setDrawBrushColor(color)
      setDrawBrushWidth(width)
      canvas.isDrawingMode = enable

      if (enable) {
        const brush = new fabric.PencilBrush(canvas)
        brush.color = color
        brush.width = width
        canvas.freeDrawingBrush = brush
      }
    },
    [drawBrushColor, drawBrushWidth]
  )

  /**
   * Captures the user's freehand drawing (all path strokes on the page, or the selected path),
   * extracts geometric descriptors, and renders an isolated 512x512 sketch DataURL for AI analysis.
   */
  const captureFreehandSketch = useCallback((): {
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
  } | null => {
    if (!fabricCanvas.current) return null
    const canvas = fabricCanvas.current

    const allPaths = canvas
      .getObjects()
      .filter((o) => o.type === 'path' && !(o as any).customVectorLine?.isVectorLine) as fabric.Path[]

    if (allPaths.length === 0) return null

    const targetPaths =
      selectedObject &&
      selectedObject.type === 'path' &&
      !(selectedObject as any).customVectorLine?.isVectorLine
        ? [selectedObject as fabric.Path]
        : allPaths

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let strokeColor = drawBrushColor || '#8b5cf6'

    const pts: Array<{ x: number; y: number }> = []

    targetPaths.forEach((p) => {
      const b = p.getBoundingRect()
      minX = Math.min(minX, b.left)
      minY = Math.min(minY, b.top)
      maxX = Math.max(maxX, b.left + b.width)
      maxY = Math.max(maxY, b.top + b.height)
      if (typeof p.stroke === 'string' && p.stroke) {
        strokeColor = p.stroke
      }
      const cmds = p.path || []
      cmds.forEach((cmd: any) => {
        if (cmd.length >= 3 && typeof cmd[cmd.length - 2] === 'number' && typeof cmd[cmd.length - 1] === 'number') {
          pts.push({ x: cmd[cmd.length - 2], y: cmd[cmd.length - 1] })
        }
      })
    })

    const boxW = Math.max(40, maxX - minX)
    const boxH = Math.max(40, maxY - minY)
    const cx = minX + boxW / 2
    const cy = minY + boxH / 2
    const aspectRatio = boxW / boxH
    const diag = Math.hypot(boxW, boxH)

    // Geometric heuristic analysis of the freehand stroke(s)
    let isClosed = false
    if (pts.length >= 4) {
      const start = pts[0]
      const end = pts[pts.length - 1]
      const dist = Math.hypot(end.x - start.x, end.y - start.y)
      isClosed = dist < diag * 0.28
    }

    // Count sharp direction changes (corners/vertices)
    let corners = 0
    const step = Math.max(1, Math.floor(pts.length / 24))
    for (let i = step; i < pts.length - step; i += step) {
      const p0 = pts[i - step]
      const p1 = pts[i]
      const p2 = pts[i + step]
      const a1 = Math.atan2(p1.y - p0.y, p1.x - p0.x)
      const a2 = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      let diff = Math.abs(a2 - a1)
      if (diff > Math.PI) diff = 2 * Math.PI - diff
      if (diff > 0.65) corners++
    }

    let inferredShape: SketchVectorType = 'circle'
    if (!isClosed && targetPaths.length === 1) {
      if (aspectRatio > 2.6 || aspectRatio < 0.35) {
        inferredShape = 'line'
      } else if (corners >= 1 && corners <= 2) {
        inferredShape = 'check'
      } else {
        inferredShape = 'arrow'
      }
    } else if (targetPaths.length >= 2 && !isClosed) {
      inferredShape = 'arrow'
    } else if (corners >= 7) {
      inferredShape = 'star'
    } else if (corners === 5 || corners === 6) {
      inferredShape = 'house'
    } else if (corners === 3) {
      inferredShape = 'triangle'
    } else if (corners === 4) {
      inferredShape = 'rect'
    } else {
      // Check circularity vs heart
      inferredShape = 'circle'
    }

    // Render isolated high-contrast sketch on a 512x512 white canvas for Vision LLM
    const off = document.createElement('canvas')
    off.width = 512
    off.height = 512
    const octx = off.getContext('2d')!
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, 512, 512)

    try {
      // Draw the normalized path strokes directly in bold dark ink for maximum AI clarity
      octx.save()
      octx.strokeStyle = '#111827'
      octx.lineWidth = 8
      octx.lineCap = 'round'
      octx.lineJoin = 'round'
      const pad = 56
      const scale = Math.min((512 - pad * 2) / boxW, (512 - pad * 2) / boxH)
      let pMinX = Infinity
      let pMinY = Infinity
      pts.forEach((pt) => {
        pMinX = Math.min(pMinX, pt.x)
        pMinY = Math.min(pMinY, pt.y)
      })
      if (pts.length > 1 && Number.isFinite(pMinX)) {
        octx.beginPath()
        pts.forEach((pt, idx) => {
          const sx = pad + (pt.x - pMinX) * scale
          const sy = pad + (pt.y - pMinY) * scale
          if (idx === 0) octx.moveTo(sx, sy)
          else octx.lineTo(sx, sy)
        })
        octx.stroke()
      }
      octx.restore()
    } catch {}

    return {
      sketchDataUrl: off.toDataURL('image/png'),
      cx,
      cy,
      width: boxW,
      height: boxH,
      color: strokeColor,
      geometry: {
        inferredShape,
        isClosed,
        aspectRatio,
        strokeCount: targetPaths.length,
        pointCount: pts.length,
      },
    }
  }, [selectedObject, drawBrushColor])

  /**
   * Replaces the freehand sketch strokes on the canvas with a clean, perfected vector graphic
   * at the exact center and bounding dimensions where the user drew it.
   */
  const replaceSketchWithVector = useCallback(
    (vectorType: SketchVectorType, customSvgPath?: string) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const info = captureFreehandSketch()

      const cx = info ? info.cx : canvas.width! / 2
      const cy = info ? info.cy : canvas.height! / 2
      const targetW = info ? Math.max(120, info.width) : 240
      const targetH = info ? Math.max(120, info.height) : 240
      const color = info ? info.color : drawBrushColor || '#8b5cf6'

      // Remove freehand path strokes (exclude vector lines)
      const pathsToRemove =
        selectedObject &&
        selectedObject.type === 'path' &&
        !(selectedObject as any).customVectorLine?.isVectorLine
          ? [selectedObject]
          : canvas.getObjects().filter((o) => o.type === 'path' && !(o as any).customVectorLine?.isVectorLine)
      pathsToRemove.forEach((p) => canvas.remove(p))

      // Turn off drawing mode so user can immediately interact with the new vector
      canvas.isDrawingMode = false
      setIsDrawingMode(false)

      const svgPathsCatalog: Record<string, string> = {
        star: 'M 100 10 L 126 68 L 190 75 L 142 118 L 155 182 L 100 148 L 45 182 L 58 118 L 10 75 L 74 68 Z',
        heart:
          'M 100 178 C 100 178 22 126 22 68 C 22 38 46 18 72 18 C 88 18 100 28 100 40 C 100 28 112 18 128 18 C 154 18 178 38 178 68 C 178 126 100 178 100 178 Z',
        house:
          'M 100 18 L 184 88 L 160 88 L 160 182 L 118 182 L 118 126 L 82 126 L 82 182 L 40 182 L 40 88 L 16 88 Z',
        tree:
          'M 100 16 C 64 16 38 46 44 82 C 28 92 26 122 50 134 C 58 138 72 138 84 136 L 84 184 L 116 184 L 116 136 C 128 138 142 138 150 134 C 174 122 172 92 156 82 C 162 46 136 16 100 16 Z',
        cloud:
          'M 64 156 L 152 156 C 174 156 190 140 190 118 C 190 98 175 82 156 80 C 150 48 122 28 90 32 C 60 36 38 62 40 92 C 22 96 10 112 12 130 C 14 146 36 156 64 156 Z',
        check: 'M 24 106 L 76 158 L 178 42 L 158 24 L 76 118 L 42 86 Z',
        sun: 'M 100 45 C 70 45 45 70 45 100 C 45 130 70 155 100 155 C 130 155 155 130 155 100 C 155 70 130 45 100 45 Z',
        arrow: 'M 16 82 L 122 82 L 122 44 L 186 100 L 122 156 L 122 118 L 16 118 Z',
        triangle: 'M 100 18 L 186 178 L 14 178 Z',
        diamond: 'M 100 12 L 184 100 L 100 188 L 16 100 Z',
        hexagon: 'M 100 12 L 178 56 L 178 144 L 100 188 L 22 144 L 22 56 Z',
      }

      let created: fabric.FabricObject | null = null

      if (vectorType === 'circle') {
        const radius = Math.max(targetW, targetH) / 2
        created = new fabric.Circle({
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          radius,
          fill: color,
        })
      } else if (vectorType === 'rect') {
        created = new fabric.Rect({
          left: cx,
          top: cy,
          originX: 'center',
          originY: 'center',
          width: targetW,
          height: targetH,
          rx: 14,
          ry: 14,
          fill: color,
        })
      } else if (vectorType === 'line' || vectorType === 'arrow') {
        created = createVectorLineObject(vectorType, cx, cy, color)
      } else {
        const pathData =
          (vectorType === 'custom-svg' && customSvgPath) ||
          svgPathsCatalog[vectorType] ||
          svgPathsCatalog.star
        const pathObj = new fabric.Path(pathData, {
          fill: color,
          originX: 'center',
          originY: 'center',
        })
        const scaleX = targetW / Math.max(40, pathObj.width || 180)
        const scaleY = targetH / Math.max(40, pathObj.height || 180)
        const uniformScale = Math.min(scaleX, scaleY)
        pathObj.set({
          left: cx,
          top: cy,
          scaleX: uniformScale,
          scaleY: uniformScale,
          originX: 'center',
          originY: 'center',
        })
        created = pathObj
      }

      if (created) {
        ;(created as any).name = `Vetor IA (${vectorType})`
        canvas.add(created)
        canvas.setActiveObject(created)
        setSelectedObject(created)
        canvas.renderAll()
        syncLayers()
        saveState()
      }
    },
    [captureFreehandSketch, selectedObject, drawBrushColor, syncLayers, saveState]
  )

  /**
   * Replaces the freehand sketch strokes on the canvas with an AI-generated image
   * at the exact center and bounding dimensions where the user drew it.
   */
  const replaceSketchWithImage = useCallback(
    async (imageUrl: string) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const info = captureFreehandSketch()

      const cx = info ? info.cx : canvas.width! / 2
      const cy = info ? info.cy : canvas.height! / 2
      const targetDim = info ? Math.max(280, Math.max(info.width, info.height)) : 420

      const pathsToRemove =
        selectedObject &&
        selectedObject.type === 'path' &&
        !(selectedObject as any).customVectorLine?.isVectorLine
          ? [selectedObject]
          : canvas.getObjects().filter((o) => o.type === 'path' && !(o as any).customVectorLine?.isVectorLine)
      pathsToRemove.forEach((p) => canvas.remove(p))

      canvas.isDrawingMode = false
      setIsDrawingMode(false)

      const img = await fabric.FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })
      const scale = targetDim / Math.max(img.width || 512, img.height || 512)
      img.scale(scale)
      img.set({
        left: cx,
        top: cy,
        originX: 'center',
        originY: 'center',
      })
      ;(img as any).name = 'Imagem Gerada do Desenho'
      canvas.add(img)
      canvas.setActiveObject(img)
      canvas.renderAll()
      syncLayers()
      saveState()
    },
    [captureFreehandSketch, selectedObject, syncLayers, saveState]
  )

  const clearFreehandSketch = useCallback(() => {
    if (!fabricCanvas.current) return
    const canvas = fabricCanvas.current
    const paths = canvas.getObjects().filter((o) => o.type === 'path' && !(o as any).customVectorLine?.isVectorLine)
    paths.forEach((p) => canvas.remove(p))
    canvas.renderAll()
    syncLayers()
    saveState()
  }, [syncLayers, saveState])

  // Select an object directly from the Layers panel by its canvas zIndex
  const selectLayer = useCallback(
    (zIndex: number) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const objects = canvas.getObjects()
      const target = objects[zIndex]
      if (!target) return

      // Ensure drawing mode is off so selection box is shown
      if (canvas.isDrawingMode) {
        canvas.isDrawingMode = false
        setIsDrawingMode(false)
      }

      // Allow selecting even background/decorative elements when explicitly clicked in Layers panel
      if (!target.selectable) {
        target.set({ selectable: true, evented: true })
      }

      canvas.setActiveObject(target)
      setSelectedObject(target)
      canvas.requestRenderAll()
      canvas.renderAll()
      syncLayers()
    },
    [syncLayers]
  )

  // Toggle visibility of a layer from the Layers panel
  const toggleLayerVisibility = useCallback(
    (zIndex: number) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const target = canvas.getObjects()[zIndex]
      if (!target) return

      const nextVisible = target.visible === false
      target.set('visible', nextVisible)
      if (!nextVisible && canvas.getActiveObject() === target) {
        canvas.discardActiveObject()
        setSelectedObject(null)
      }
      canvas.requestRenderAll()
      canvas.renderAll()
      syncLayers()
      saveState()
    },
    [syncLayers, saveState]
  )

  // Layer ordering & deletion
  const bringForward = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    fabricCanvas.current.bringObjectForward(selectedObject)
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  const sendBackward = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    fabricCanvas.current.sendObjectBackwards(selectedObject)
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  const bringToFront = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    fabricCanvas.current.bringObjectToFront(selectedObject)
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  const sendToBack = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    fabricCanvas.current.sendObjectToBack(selectedObject)
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  const deleteSelected = useCallback(() => {
    if (!fabricCanvas.current || !selectedObject) return
    fabricCanvas.current.remove(selectedObject)
    setSelectedObject(null)
    syncLayers()
    saveState()
  }, [selectedObject, syncLayers, saveState])

  const duplicateSelected = useCallback(async () => {
    if (!fabricCanvas.current || !selectedObject) return
    const cloned = await selectedObject.clone()
    const vecSettings = (selectedObject as any).customVectorLine as VectorLineSettings | undefined
    if (vecSettings && vecSettings.isVectorLine && cloned instanceof fabric.Path) {
      const clonedSettings: VectorLineSettings = {
        ...vecSettings,
        nodes: vecSettings.nodes.map((pt) => ({ x: pt.x + 30, y: pt.y + 30 })),
      }
      rebuildVectorPathGeometry(cloned, clonedSettings)
    } else {
      cloned.set({
        left: (selectedObject.left || 0) + 25,
        top: (selectedObject.top || 0) + 25,
        evented: true,
      })
    }
    fabricCanvas.current.add(cloned)
    fabricCanvas.current.setActiveObject(cloned)
    setSelectedObject(cloned)
    fabricCanvas.current.renderAll()
  }, [selectedObject])

  const setDimensions = useCallback(
    (width: number, height: number) => {
      if (!fabricCanvas.current) return
      fabricCanvas.current.setDimensions({ width, height })
      fabricCanvas.current.renderAll()
      saveState()
    },
    [saveState]
  )

  const setBackgroundColor = useCallback(
    (color: string) => {
      if (!fabricCanvas.current) return
      fabricCanvas.current.backgroundColor = color
      fabricCanvas.current.renderAll()
      saveState()
    },
    [saveState]
  )

  // Set Gradient Background
  const setBackgroundGradient = useCallback(
    (colorStart: string, colorEnd: string, direction: 'diagonal' | 'vertical' | 'horizontal' = 'diagonal') => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const w = canvas.width!
      const h = canvas.height!

      // Remove previous background gradient rect if exists
      const existingBg = canvas.getObjects().find((o: any) => o.name === '__bg_gradient')
      if (existingBg) canvas.remove(existingBg)

      const coords =
        direction === 'vertical'
          ? { x1: 0, y1: 0, x2: 0, y2: h }
          : direction === 'horizontal'
          ? { x1: 0, y1: 0, x2: w, y2: 0 }
          : { x1: 0, y1: 0, x2: w, y2: h }

      const grad = new fabric.Gradient({
        type: 'linear',
        coords,
        colorStops: [
          { offset: 0, color: colorStart },
          { offset: 1, color: colorEnd },
        ],
      })

      const bgRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: w,
        height: h,
        fill: grad,
        selectable: true,
      })
      ;(bgRect as any).name = '__bg_gradient'

      canvas.add(bgRect)
      canvas.sendObjectToBack(bgRect)
      canvas.renderAll()
      syncLayers()
      saveState()
    },
    [syncLayers, saveState]
  )

  const exportDesign = useCallback((format: 'png' | 'jpeg' | 'webp' = 'png', multiplier = 1, transparent = false) => {
    if (!fabricCanvas.current) return ''
    const canvas = fabricCanvas.current
    const prevBg = canvas.backgroundColor

    if (transparent && format === 'png') {
      canvas.backgroundColor = ''
    }

    const dataUrl = canvas.toDataURL({
      format: format,
      multiplier,
      quality: 0.95,
    })

    if (transparent && format === 'png') {
      canvas.backgroundColor = prevBg
      canvas.renderAll()
    }

    return dataUrl
  }, [])

  const exportAllPages = useCallback(
    async (
      format: 'png' | 'jpeg' | 'webp' = 'png',
      multiplier = 1,
      transparent = false
    ): Promise<Array<{ title: string; dataUrl: string }>> => {
      if (!fabricCanvas.current) return []
      const canvas = fabricCanvas.current
      isSwitchingPage.current = true

      // Save current page state first
      const currentJson = JSON.stringify(canvas.toJSON())
      const currentBg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'
      const snapshotPages = pages.map((p, idx) =>
        idx === activePageIndex ? { ...p, json: currentJson, backgroundColor: currentBg } : p
      )

      const results: Array<{ title: string; dataUrl: string }> = []

      for (let i = 0; i < snapshotPages.length; i++) {
        const p = snapshotPages[i]
        canvas.clear()
        canvas.backgroundColor = transparent && format === 'png' ? '' : p.backgroundColor || '#ffffff'
        if (p.json) {
          try {
            await canvas.loadFromJSON(JSON.parse(p.json))
          } catch {}
        }
        canvas.renderAll()
        const dataUrl = canvas.toDataURL({
          format,
          multiplier,
          quality: 0.95,
        })
        results.push({
          title: p.title || `Slide_${i + 1}`,
          dataUrl,
        })
      }

      // Restore active page
      const restore = snapshotPages[activePageIndex] || snapshotPages[0]
      if (restore) {
        canvas.clear()
        canvas.backgroundColor = restore.backgroundColor || '#ffffff'
        if (restore.json) {
          try {
            await canvas.loadFromJSON(JSON.parse(restore.json))
          } catch {}
        }
        canvas.renderAll()
      }

      isSwitchingPage.current = false
      return results
    },
    [pages, activePageIndex]
  )

  /**
   * Renders a high-complexity Canva Editorial Slide ("Pipa Arquitetura" Agency Standard)
   * Uses native Canvas2D Path2D for pixel-exact architectural shapes, parallel offset strokes,
   * Gobo botanical shadows & curved arrows (preventing Fabric v7 Path (0,0) bounding-box shifts),
   * while placing all floor plan images and typography as editable Fabric objects.
   */
  const renderEditorialSlideOnCanvas = async (
    canvas: fabric.Canvas,
    slide: EditorialSlideSpec,
    spec: GeneratedDesignSpec,
    slideImageUrl: string,
    fullImageUrl?: string
  ) => {
    const w = canvas.width || 1080
    const h = canvas.height || 1350

    const bgCream = spec.palette.background || '#ebe6de'
    const olivePrimary = spec.palette.primary || '#636953'
    const oliveSecondary = spec.palette.secondary || '#7d836d'
    const goldAccent = spec.palette.accent || '#b49a7b'
    const charcoalText = spec.palette.textColor || '#2c302e'

    canvas.clear()
    canvas.backgroundColor = bgCream

    // 1. Render Pixel-Exact Architectural Backdrop via HTML5 Canvas2D + Path2D
    const bgCanvas = document.createElement('canvas')
    bgCanvas.width = w
    bgCanvas.height = h
    const bctx = bgCanvas.getContext('2d')!

    // Warm paper background using selected palette
    bctx.fillStyle = bgCream
    bctx.fillRect(0, 0, w, h)

    if (slide.slideType === 'cover') {
      // Top-left organic chamfered olive shape
      bctx.save()
      bctx.fillStyle = oliveSecondary
      bctx.globalAlpha = 0.82
      bctx.fill(new Path2D('M 0 0 L 380 0 L 120 440 Q 85 495 0 510 Z'))
      bctx.restore()

      // Parallel inner cream stroke on top-left shape
      bctx.save()
      bctx.strokeStyle = '#f7f4ef'
      bctx.lineWidth = 2
      bctx.globalAlpha = 0.88
      bctx.stroke(new Path2D('M 0 0 L 352 0 L 98 422 Q 68 472 0 486'))
      bctx.restore()

      // Bottom-right organic stepped olive shape
      bctx.save()
      bctx.fillStyle = olivePrimary
      bctx.globalAlpha = 0.88
      bctx.fill(
        new Path2D(
          `M ${w} ${h * 0.56} L ${w * 0.85} ${h * 0.79} Q ${w * 0.82} ${h * 0.82} ${w * 0.76} ${h * 0.83} Q ${w * 0.71} ${h * 0.84} ${w * 0.67} ${h * 0.9} L ${w * 0.58} ${h} L ${w} ${h} Z`
        )
      )
      bctx.restore()

      // Parallel inner cream stroke on bottom-right shape
      bctx.save()
      bctx.strokeStyle = '#f7f4ef'
      bctx.lineWidth = 2
      bctx.globalAlpha = 0.85
      bctx.stroke(
        new Path2D(
          `M ${w} ${h * 0.59} L ${w * 0.865} ${h * 0.805} Q ${w * 0.835} ${h * 0.835} ${w * 0.775} ${h * 0.845} Q ${w * 0.725} ${h * 0.855} ${w * 0.685} ${h * 0.915} L ${w * 0.605} ${h}`
        )
      )
      bctx.restore()

      // Diagonal Window Sunlight Beam (Soft Blurred Light)
      bctx.save()
      bctx.filter = 'blur(28px)'
      bctx.fillStyle = 'rgba(255, 255, 255, 0.36)'
      bctx.beginPath()
      bctx.moveTo(0, h * 0.36)
      bctx.lineTo(w * 0.66, 0)
      bctx.lineTo(w, 0)
      bctx.lineTo(w, h * 0.44)
      bctx.lineTo(0, h * 0.94)
      bctx.closePath()
      bctx.fill()
      bctx.restore()

      // Soft Blurred Botanical Palm / Foliage Gobo Shadow in Bottom-Left
      bctx.save()
      bctx.filter = 'blur(16px)'
      bctx.fillStyle = 'rgba(72, 66, 56, 0.16)'
      const leafPaths = [
        'M -20 1350 Q 80 1120 260 1020 Q 120 1160 40 1350 Z',
        'M 20 1200 Q 140 1050 340 1040 Q 190 1120 50 1230 Z',
        'M -10 1080 Q 110 940 280 910 Q 140 1000 10 1120 Z',
        'M 60 1150 Q 30 960 120 820 Q 100 980 95 1150 Z',
        'M 110 1260 Q 260 1160 430 1210 Q 270 1230 120 1290 Z',
      ]
      for (const lp of leafPaths) {
        bctx.fill(new Path2D(lp))
      }
      bctx.restore()
    } else {
      // Slides 2, 3, 4: Top-Right Chamfered Organic Shape + Parallel Inner Cream Line
      if (slide.slideType !== 'detail') {
        bctx.save()
        bctx.fillStyle = olivePrimary
        bctx.globalAlpha = 0.85
        bctx.fill(
          new Path2D(
            `M ${w * 0.72} 0 L ${w} 0 L ${w} ${h * 0.44} L ${w * 0.67} ${h * 0.16} Q ${w * 0.63} ${h * 0.125} ${w * 0.66} ${h * 0.07} Z`
          )
        )
        bctx.restore()

        bctx.save()
        bctx.strokeStyle = '#f7f4ef'
        bctx.lineWidth = 1.8
        bctx.globalAlpha = 0.85
        bctx.stroke(
          new Path2D(
            `M ${w * 0.74} 0 L ${w * 0.685} ${h * 0.075} Q ${w * 0.655} ${h * 0.125} ${w * 0.695} ${h * 0.16} L ${w} ${h * 0.415}`
          )
        )
        bctx.restore()

        // Short cream divider line inside top-right shape under sideTag
        bctx.fillStyle = '#dcd8d0'
        bctx.fillRect(w * 0.76, h * 0.172, 72, 2)
      }

      // Bottom-Right Stepped Organic Shape (Slides 2, 3, 4, 5)
      bctx.save()
      bctx.fillStyle = olivePrimary
      bctx.globalAlpha = 0.9
      bctx.fill(
        new Path2D(
          `M ${w} ${h * 0.71} L ${w * 0.94} ${h * 0.81} Q ${w * 0.91} ${h * 0.84} ${w * 0.84} ${h * 0.86} Q ${w * 0.79} ${h * 0.875} ${w * 0.75} ${h * 0.93} L ${w * 0.7} ${h} L ${w} ${h} Z`
        )
      )
      bctx.restore()

      bctx.save()
      bctx.strokeStyle = '#f7f4ef'
      bctx.lineWidth = 1.8
      bctx.globalAlpha = 0.82
      bctx.stroke(
        new Path2D(
          `M ${w} ${h * 0.735} L ${w * 0.95} ${h * 0.82} Q ${w * 0.92} ${h * 0.85} ${w * 0.855} ${h * 0.87} Q ${w * 0.805} ${h * 0.885} ${w * 0.765} ${h * 0.94} L ${w * 0.72} ${h}`
        )
      )
      bctx.restore()

      // Slide 5 Left Decorative Accent Shape behind Zoomed Frame
      if (slide.slideType === 'detail') {
        bctx.save()
        bctx.fillStyle = olivePrimary
        bctx.globalAlpha = 0.78
        bctx.fill(new Path2D(`M 0 ${h * 0.28} L ${w * 0.14} ${h * 0.39} L ${w * 0.14} ${h * 0.79} L 0 ${h * 0.86} Z`))
        bctx.restore()
      }

      // Editorial Footer Horizontal Line (Slides 2, 3, 4)
      if (slide.slideType !== 'detail') {
        bctx.fillStyle = olivePrimary
        bctx.fillRect(0, h * 0.888, 112, 2.5)
      }
    }

    // Add the pixel-exact architectural backdrop to the Fabric canvas (using native center origin so JSON reload never shifts it)
    const bgImg = await fabric.FabricImage.fromURL(bgCanvas.toDataURL('image/png'), { crossOrigin: 'anonymous' })
    bgImg.set({
      left: w / 2,
      top: h / 2,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    })
    ;(bgImg as any).name = 'Fundo Editorial'
    canvas.add(bgImg)

    // Helper: creates a strictly bounded, auto-wrapping Textbox using Fabric v7's native center origin
    // so text NEVER overflows outside the page and NEVER shifts on JSON reload
    const addBoundedTextbox = (
      rawText: string,
      opts: {
        x: number // left edge (or centerX when centered=true)
        y: number // top edge (or centerY when centered=true)
        maxWidth: number
        maxHeight?: number
        fontSize: number
        minFontSize?: number
        fontFamily?: string
        fontWeight?: string
        fill?: string
        lineHeight?: number
        charSpacing?: number
        textAlign?: 'left' | 'center' | 'right'
        centered?: boolean
        opacity?: number
      }
    ): { tb: fabric.Textbox; bottomY: number; height: number } => {
      const cleanText = (rawText || '').replace(/\r\n/g, '\n').trim()
      let sz = opts.fontSize
      const minSz = opts.minFontSize || 13

      const tb = new fabric.Textbox(cleanText, {
        width: opts.maxWidth,
        fontFamily: opts.fontFamily || 'Montserrat, sans-serif',
        fontSize: sz,
        fontWeight: opts.fontWeight || 'normal',
        fill: opts.fill || charcoalText,
        lineHeight: opts.lineHeight || 1.18,
        charSpacing: opts.charSpacing || 0,
        textAlign: opts.textAlign || (opts.centered ? 'center' : 'left'),
        originX: 'center',
        originY: 'center',
        opacity: opts.opacity ?? 1,
        splitByGrapheme: false,
      })

      const maxH = opts.maxHeight || h * 0.22
      while (sz > minSz && ((tb.height || 0) > maxH || (tb.width || 0) > opts.maxWidth + 4)) {
        sz -= 2
        tb.set({ fontSize: sz, width: opts.maxWidth })
      }

      const finalW = Math.min(tb.width || opts.maxWidth, opts.maxWidth)
      const finalH = tb.height || sz * 1.2

      let centerX = opts.centered ? opts.x : opts.x + finalW / 2
      let centerY = opts.centered ? opts.y : opts.y + finalH / 2

      const halfW = finalW / 2
      const halfH = finalH / 2
      // Strict safe margin clamping so no box ever touches or crosses the canvas edges
      centerX = Math.max(42 + halfW, Math.min(w - 42 - halfW, centerX))
      centerY = Math.max(28 + halfH, Math.min(h - 28 - halfH, centerY))

      tb.set({
        width: finalW,
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
      })
      tb.setCoords()
      canvas.add(tb)

      return {
        tb,
        bottomY: centerY + halfH,
        height: finalH,
      }
    }

    // Helper: places a rectangle by its top-left (x, y) using Fabric v7's native center origin
    const addBoundedRect = (x: number, y: number, rectW: number, rectH: number, fill: string, rx = 0) => {
      const r = new fabric.Rect({
        left: x + rectW / 2,
        top: y + rectH / 2,
        originX: 'center',
        originY: 'center',
        width: rectW,
        height: rectH,
        fill,
        rx,
        ry: rx,
      })
      canvas.add(r)
      return r
    }

    // 2. Slide 1 (Cover) Typography & Optional Brand Logo Image
    if (slide.slideType === 'cover') {
      const hasCustomCoverText =
        Boolean(slide.titleLine1 && slide.titleLine1 !== 'PiPa' && slide.titleLine1 !== spec.brandName) ||
        Boolean(slide.subtitle && slide.subtitle !== 'Projeto completo com soluções técnicas e estética refinada.')

      if (slideImageUrl) {
        try {
          const logoImg = await fabric.FabricImage.fromURL(slideImageUrl, { crossOrigin: 'anonymous' })
          const maxLogoW = hasCustomCoverText ? w * 0.44 : w * 0.66
          const maxLogoH = hasCustomCoverText ? h * 0.22 : h * 0.34
          const scale = Math.min(maxLogoW / (logoImg.width || 400), maxLogoH / (logoImg.height || 400))
          logoImg.scale(scale)
          logoImg.set({
            left: w * 0.5,
            top: hasCustomCoverText ? h * 0.32 : h * 0.48,
            originX: 'center',
            originY: 'center',
          })
          canvas.add(logoImg)
          if (!hasCustomCoverText) {
            canvas.renderAll()
            return
          }
        } catch {}
      }

      const titleY = slideImageUrl && hasCustomCoverText ? h * 0.54 : h * 0.45
      const titleRes = addBoundedTextbox(slide.titleLine1 || spec.brandName || 'PiPa', {
        x: w * 0.5,
        y: titleY,
        maxWidth: w * 0.78,
        maxHeight: h * 0.18,
        fontSize: hasCustomCoverText ? Math.round(w * 0.065) : Math.round(w * 0.135),
        minFontSize: 34,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: hasCustomCoverText ? 'bold' : 'normal',
        fill: olivePrimary,
        charSpacing: hasCustomCoverText ? 20 : 30,
        centered: true,
      })

      const subRes = addBoundedTextbox((slide.titleLine2 || spec.brandTagline || 'ARQUITETURA').toUpperCase(), {
        x: w * 0.5,
        y: titleRes.bottomY + 24,
        maxWidth: w * 0.76,
        maxHeight: 90,
        fontSize: hasCustomCoverText ? 28 : 30,
        minFontSize: 16,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: '500',
        fill: charcoalText,
        charSpacing: hasCustomCoverText ? 80 : 260,
        centered: true,
      })

      if (hasCustomCoverText && slide.subtitle) {
        addBoundedTextbox(slide.subtitle, {
          x: w * 0.5,
          y: subRes.bottomY + 22,
          maxWidth: w * 0.72,
          maxHeight: 110,
          fontSize: 22,
          minFontSize: 15,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          centered: true,
        })
      }

      canvas.renderAll()
      return
    }

    // 3. Top-Right Side Tag (Slides 2, 3, 4) strictly inside [w*0.76 .. w-42]
    if (slide.slideType !== 'detail') {
      addBoundedTextbox((slide.sideTag || 'ARQUITETURA\nA FAVOR\nDA SAÚDE').toUpperCase(), {
        x: w * 0.76,
        y: h * 0.065,
        maxWidth: w * 0.2,
        maxHeight: h * 0.1,
        fontSize: 16,
        minFontSize: 11,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 'normal',
        fill: '#f2efe9',
        lineHeight: 1.28,
        charSpacing: 120,
      })
    }

    // 4. Header Section (Strictly Top-Left Aligned, Dynamic Vertical Stacking, Zero Overlap)
    const headerMaxW = slide.slideType === 'detail' ? w * 0.5 : w * 0.6
    let currentY = Math.round(h * 0.042)

    if (slide.slideType === 'challenge' || slide.slideType === 'detail') {
      const kickerRes = addBoundedTextbox((slide.kicker || 'ARQUITETURA A FAVOR DA SAÚDE').toUpperCase(), {
        x: 78,
        y: currentY,
        maxWidth: headerMaxW,
        maxHeight: 44,
        fontSize: 18,
        minFontSize: 12,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 'normal',
        fill: olivePrimary,
        charSpacing: 180,
      })
      currentY = kickerRes.bottomY + 10
      addBoundedRect(78, currentY, 76, 2.5, goldAccent)
      currentY += 16
    }

    const title1Res = addBoundedTextbox(slide.titleLine1 || 'O espaço', {
      x: 78,
      y: currentY,
      maxWidth: headerMaxW,
      maxHeight: Math.round(h * 0.09),
      fontSize: slide.slideType === 'opportunity' ? 54 : 62,
      minFontSize: 30,
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: slide.slideType === 'challenge' ? 'bold' : 'normal',
      fill: slide.slideType === 'detail' ? olivePrimary : charcoalText,
      lineHeight: 1.06,
    })
    currentY = title1Res.bottomY + 4

    const title2Res = addBoundedTextbox(slide.titleLine2 || 'original:', {
      x: 78,
      y: currentY,
      maxWidth: headerMaxW,
      maxHeight: Math.round(h * 0.11),
      fontSize: slide.slideType === 'opportunity' ? 56 : 64,
      minFontSize: 30,
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: 'bold',
      fill: olivePrimary,
      lineHeight: 1.06,
    })
    currentY = title2Res.bottomY + 14

    // Gold Accent Divider Line under Title
    addBoundedRect(78, currentY, 82, 3.5, goldAccent)
    currentY += 18

    // Subtitle Paragraph
    addBoundedTextbox(slide.subtitle || '', {
      x: 78,
      y: currentY,
      maxWidth: headerMaxW,
      maxHeight: Math.round(h * 0.095),
      fontSize: slide.slideType === 'detail' ? 19 : 24,
      minFontSize: 14,
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'normal',
      fill: slide.slideType === 'detail' ? olivePrimary : charcoalText,
      lineHeight: 1.28,
      charSpacing: slide.slideType === 'detail' ? 100 : 0,
    })

    // 5. Slide 5: Technical Detail Picture-in-Picture + Legend Card
    if (slide.slideType === 'detail') {
      const mainImgUrl = slideImageUrl || fullImageUrl
      if (mainImgUrl) {
        try {
          // A. Top-Right Mini Overview Floor Plan
          const miniImg = await fabric.FabricImage.fromURL(mainImgUrl, { crossOrigin: 'anonymous' })
          const miniScale = Math.min((w * 0.31) / miniImg.width!, (h * 0.18) / miniImg.height!)
          miniImg.scale(miniScale)
          miniImg.set({
            left: w * 0.76,
            top: h * 0.175,
            originX: 'center',
            originY: 'center',
            opacity: 0.88,
          })
          canvas.add(miniImg)

          // Green highlight lens box on mini plan
          const lensRect = new fabric.Rect({
            left: w * 0.71,
            top: h * 0.21,
            originX: 'center',
            originY: 'center',
            width: w * 0.15,
            height: h * 0.09,
            fill: 'rgba(99, 105, 83, 0.12)',
            stroke: olivePrimary,
            strokeWidth: 3.5,
            rx: 12,
            ry: 12,
          })
          canvas.add(lensRect)

          // B. Left Large Zoomed-in Framed Detail Image (Offscreen rounded crop + overlaid flow arrows)
          const rawEl = miniImg.getElement() as HTMLImageElement
          const frameW = Math.round(w * 0.53)
          const frameH = Math.round(h * 0.43)
          const offCanvas = document.createElement('canvas')
          offCanvas.width = frameW
          offCanvas.height = frameH
          const ctx = offCanvas.getContext('2d')
          if (ctx && rawEl) {
            const r = 26
            ctx.beginPath()
            ctx.moveTo(r, 0)
            ctx.lineTo(frameW - r, 0)
            ctx.quadraticCurveTo(frameW, 0, frameW, r)
            ctx.lineTo(frameW, frameH - r)
            ctx.quadraticCurveTo(frameW, frameH, frameW - r, frameH)
            ctx.lineTo(r, frameH)
            ctx.quadraticCurveTo(0, frameH, 0, frameH - r)
            ctx.lineTo(0, r)
            ctx.quadraticCurveTo(0, 0, r, 0)
            ctx.closePath()
            ctx.clip()

            ctx.fillStyle = '#f7f4ee'
            ctx.fillRect(0, 0, frameW, frameH)

            const srcW = rawEl.naturalWidth || rawEl.width || 800
            const srcH = rawEl.naturalHeight || rawEl.height || 600
            ctx.drawImage(rawEl, srcW * 0.04, srcH * 0.04, srcW * 0.62, srcH * 0.68, 0, 0, frameW, frameH)

            ctx.strokeStyle = olivePrimary
            ctx.lineWidth = 7
            ctx.strokeRect(0, 0, frameW, frameH)

            const croppedDataUrl = offCanvas.toDataURL('image/png')
            const zoomImg = await fabric.FabricImage.fromURL(croppedDataUrl, { crossOrigin: 'anonymous' })
            const zoomLeft = 78
            const zoomTop = Math.round(h * 0.56 - frameH / 2)
            zoomImg.set({
              left: 78 + frameW / 2,
              top: h * 0.56,
              originX: 'center',
              originY: 'center',
              shadow: new fabric.Shadow({ color: 'rgba(45,42,38,0.22)', blur: 28, offsetX: 0, offsetY: 12 }),
            })
            canvas.add(zoomImg)

            // Interactive Vector Arrow 1: Fluxo Limpo (3 vector points, editable on canvas)
            const cleanFlowVec = createCustomVectorLine(
              {
                nodes: [
                  { x: zoomLeft + 250, y: zoomTop + 470 },
                  { x: zoomLeft + 250, y: zoomTop + 290 },
                  { x: zoomLeft + 395, y: zoomTop + 290 },
                ],
                curvature: 35,
                strokeWidth: 6,
                strokeColor: olivePrimary,
                isDashed: false,
                hasArrowEnd: true,
                arrowSize: 20,
              },
              'Seta Fluxo Limpo (Vetorial)'
            )
            canvas.add(cleanFlowVec)

            // Interactive Vector Arrow 2: Fluxo Sujo (Dashed vector arrow, editable on canvas)
            const dirtyFlowVec = createCustomVectorLine(
              {
                nodes: [
                  { x: zoomLeft + 195, y: zoomTop + 285 },
                  { x: zoomLeft + 195, y: zoomTop + 135 },
                ],
                curvature: 0,
                strokeWidth: 6,
                strokeColor: '#b86b52',
                isDashed: true,
                dashLength: 14,
                dashGap: 10,
                hasArrowEnd: true,
                arrowSize: 20,
              },
              'Seta Fluxo Sujo (Tracejada)'
            )
            canvas.add(dirtyFlowVec)
          }
        } catch {}
      }

      // C. Right Legend Card rendered cleanly via offscreen canvas + bounded labels
      const rightColX = Math.round(w * 0.64)
      const rightColW = Math.round(w - rightColX - 48)
      const legW = rightColW
      const legH = Math.round(h * 0.155)
      const legY = Math.round(h * 0.345)

      const legCanvas = document.createElement('canvas')
      legCanvas.width = legW
      legCanvas.height = legH
      const lctx = legCanvas.getContext('2d')!
      lctx.fillStyle = '#e2ddd3'
      lctx.beginPath()
      lctx.roundRect(0, 0, legW, legH, 20)
      lctx.fill()

      // Solid olive arrow
      lctx.strokeStyle = olivePrimary
      lctx.lineWidth = 5.5
      lctx.lineCap = 'round'
      lctx.lineJoin = 'round'
      lctx.stroke(new Path2D('M 20 58 L 68 58 M 55 46 L 70 58 L 55 70'))

      // Dashed terracotta arrow
      lctx.save()
      lctx.strokeStyle = '#b86b52'
      lctx.lineWidth = 5.5
      lctx.setLineDash([9, 7])
      lctx.lineCap = 'round'
      lctx.lineJoin = 'round'
      lctx.stroke(new Path2D('M 20 138 L 68 138 M 55 126 L 70 138 L 55 150'))
      lctx.restore()

      const legImg = await fabric.FabricImage.fromURL(legCanvas.toDataURL('image/png'), { crossOrigin: 'anonymous' })
      legImg.set({
        left: rightColX + legW / 2,
        top: legY + legH / 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
      })
      canvas.add(legImg)

      const labelX = rightColX + 84
      const labelMaxW = rightColW - 96

      addBoundedTextbox(slide.legendTitle1 || 'Fluxo limpo', {
        x: labelX,
        y: legY + 32,
        maxWidth: labelMaxW,
        maxHeight: 28,
        fontSize: 19,
        minFontSize: 14,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: charcoalText,
      })
      addBoundedTextbox(slide.legendDesc1 || 'Pacientes e atendimento', {
        x: labelX,
        y: legY + 58,
        maxWidth: labelMaxW,
        maxHeight: 34,
        fontSize: 15,
        minFontSize: 12,
        fontFamily: 'Inter, sans-serif',
        fill: charcoalText,
        opacity: 0.82,
      })

      addBoundedTextbox(slide.legendTitle2 || 'Fluxo sujo', {
        x: labelX,
        y: legY + 112,
        maxWidth: labelMaxW,
        maxHeight: 28,
        fontSize: 19,
        minFontSize: 14,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        fill: charcoalText,
      })
      addBoundedTextbox(slide.legendDesc2 || 'Materiais e resíduos', {
        x: labelX,
        y: legY + 138,
        maxWidth: labelMaxW,
        maxHeight: 34,
        fontSize: 15,
        minFontSize: 12,
        fontFamily: 'Inter, sans-serif',
        fill: charcoalText,
        opacity: 0.82,
      })

      // D. Right Technical Explanation Paragraph below Legend Card
      let rightTextY = legY + legH + 26
      const headRes = addBoundedTextbox(slide.detailHeading || 'Arquitetura para saúde exige rigor:', {
        x: rightColX,
        y: rightTextY,
        maxWidth: rightColW,
        maxHeight: 82,
        fontSize: 27,
        minFontSize: 18,
        fontFamily: 'Montserrat, sans-serif',
        fontWeight: 'bold',
        fill: charcoalText,
        lineHeight: 1.18,
      })
      rightTextY = headRes.bottomY + 12

      const bodyRes = addBoundedTextbox(
        slide.detailBody || 'fluxo limpo x fluxo sujo e conforto tanto para o paciente quanto para a equipe.',
        {
          x: rightColX,
          y: rightTextY,
          maxWidth: rightColW,
          maxHeight: 135,
          fontSize: 21,
          minFontSize: 15,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          lineHeight: 1.28,
        }
      )
      addBoundedRect(rightColX, bodyRes.bottomY + 16, 76, 3.5, goldAccent)

      // Bottom-Right Side Tag on Slide 5
      addBoundedTextbox('ARQUITETURA\nA FAVOR\nDA SAÚDE', {
        x: w * 0.78,
        y: h * 0.865,
        maxWidth: w * 0.18,
        maxHeight: 90,
        fontSize: 16,
        minFontSize: 11,
        fontFamily: 'Montserrat, sans-serif',
        fill: '#f2efe9',
        lineHeight: 1.3,
        charSpacing: 120,
      })
    } else {
      // 6. Standard Main Image Placement for Slides 2, 3, 4 with Drop Shadow
      if (slideImageUrl) {
        try {
          const img = await fabric.FabricImage.fromURL(slideImageUrl, { crossOrigin: 'anonymous' })
          const maxW = slide.slideType === 'challenge' ? w * 0.5 : w * 0.76
          const maxH = slide.slideType === 'challenge' ? h * 0.34 : h * 0.39
          const scale = Math.min(maxW / img.width!, maxH / img.height!)
          img.scale(scale)
          img.set({
            left: w * 0.5,
            top: h * 0.585,
            originX: 'center',
            originY: 'center',
            shadow: new fabric.Shadow({
              color: 'rgba(45, 42, 38, 0.25)',
              blur: 36,
              offsetX: 0,
              offsetY: 16,
            }),
          })
          canvas.add(img)
        } catch {}
      }

      // 7. Curved Vector Callout Arrows & Strictly Bounded Callout Labels on Slide 2 (O Desafio)
      if (slide.slideType === 'challenge') {
        const callouts = slide.callouts || ['Geometria irregular', 'Ângulos difíceis', 'Múltiplos acessos']

        const calloutVectors = [
          {
            name: 'Seta Geometria Irregular',
            nodes: [
              { x: Math.round(w * 0.78), y: Math.round(h * 0.39) },
              { x: Math.round(w * 0.72), y: Math.round(h * 0.455) },
            ],
            curvature: -40,
          },
          {
            name: 'Seta Ângulos Difíceis',
            nodes: [
              { x: Math.round(w * 0.88), y: Math.round(h * 0.54) },
              { x: Math.round(w * 0.795), y: Math.round(h * 0.59) },
            ],
            curvature: 38,
          },
          {
            name: 'Seta Circulação',
            nodes: [
              { x: Math.round(w * 0.13), y: Math.round(h * 0.56) },
              { x: Math.round(w * 0.225), y: Math.round(h * 0.61) },
            ],
            curvature: -38,
          },
          {
            name: 'Seta Múltiplos Acessos',
            nodes: [
              { x: Math.round(w * 0.15), y: Math.round(h * 0.74) },
              { x: Math.round(w * 0.235), y: Math.round(h * 0.7) },
            ],
            curvature: 35,
          },
        ]

        calloutVectors.forEach((cv) => {
          const vecArrow = createCustomVectorLine(
            {
              nodes: cv.nodes,
              curvature: cv.curvature,
              strokeWidth: 4,
              strokeColor: olivePrimary,
              isDashed: false,
              hasArrowEnd: true,
              arrowSize: 16,
            },
            cv.name
          )
          canvas.add(vecArrow)
        })

        // Bounded Callout Textboxes strictly inside [52..225] (left) and [835..1025] (right)
        addBoundedTextbox(callouts[0] || 'Geometria irregular', {
          x: w * 0.84,
          y: h * 0.355,
          maxWidth: 175,
          maxHeight: 64,
          fontSize: 19,
          minFontSize: 14,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          centered: true,
        })
        addBoundedTextbox(callouts[1] || 'Ângulos difíceis', {
          x: w * 0.88,
          y: h * 0.495,
          maxWidth: 165,
          maxHeight: 64,
          fontSize: 19,
          minFontSize: 14,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          centered: true,
        })
        addBoundedTextbox('Entradas que condicionam a circulação', {
          x: w * 0.13,
          y: h * 0.5,
          maxWidth: 170,
          maxHeight: 82,
          fontSize: 18,
          minFontSize: 13,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          centered: true,
        })
        addBoundedTextbox(callouts[2] || 'Múltiplos acessos', {
          x: w * 0.13,
          y: h * 0.775,
          maxWidth: 170,
          maxHeight: 64,
          fontSize: 19,
          minFontSize: 14,
          fontFamily: 'Inter, sans-serif',
          fill: charcoalText,
          centered: true,
        })
      }
    }

    // 8. Editorial Footer Spaced Typography (Strictly bounded inside [footerX .. w*0.68])
    const footerX = slide.slideType === 'detail' ? 78 : 132
    const footerRes = addBoundedTextbox((slide.footerMain || 'ESPAÇOS BEM PENSADOS').toUpperCase(), {
      x: footerX,
      y: h * 0.87,
      maxWidth: w * 0.55,
      maxHeight: 42,
      fontSize: 25,
      minFontSize: 16,
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: slide.slideType === 'challenge' || slide.slideType === 'detail' ? 'normal' : 'bold',
      fill: olivePrimary,
      charSpacing: 150,
    })

    addBoundedTextbox((slide.footerSub || 'PARA CUIDAR DE PESSOAS').toUpperCase(), {
      x: footerX,
      y: footerRes.bottomY + 6,
      maxWidth: w * 0.55,
      maxHeight: 36,
      fontSize: 19,
      minFontSize: 13,
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: 'normal',
      fill: olivePrimary,
      opacity: 0.85,
      charSpacing: 180,
    })

    canvas.renderAll()
  }

  /**
   * Standard single-slide fallback renderer
   */
  const renderDesignSlideOnCanvas = async (
    canvas: fabric.Canvas,
    imageUrls: string[],
    spec: GeneratedDesignSpec,
    styleOverride?: DesignLayoutStyle
  ) => {
    const w = canvas.width!
    const h = canvas.height!
    const style: DesignLayoutStyle = styleOverride || spec.layoutStyle || 'hero'

    canvas.clear()
    canvas.backgroundColor = spec.palette.background

    // 1. Differentiated Background & Decorative Shapes per Layout Style
    if (style === 'hero') {
      // Modern Hero Spotlight with glowing central orb & frame
      const grad = new fabric.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: w, y2: h },
        colorStops: [
          { offset: 0, color: spec.palette.background },
          { offset: 1, color: spec.palette.secondary },
        ],
      })
      canvas.add(
        new fabric.Rect({
          left: 0,
          top: 0,
          width: w,
          height: h,
          fill: grad,
          selectable: false,
        })
      )

      // Decorative accent glow circle behind product/photo
      canvas.add(
        new fabric.Circle({
          left: w / 2,
          top: h * 0.4,
          originX: 'center',
          originY: 'center',
          radius: Math.min(w, h) * 0.26,
          fill: spec.palette.accent,
          opacity: 0.22,
        })
      )
    } else if (style === 'split') {
      // Split Magazine Layout (Left/Top colored block + asymmetric accents)
      canvas.add(
        new fabric.Rect({
          left: 0,
          top: 0,
          width: w * 0.45,
          height: h,
          fill: spec.palette.primary,
          opacity: 0.9,
        })
      )
      canvas.add(
        new fabric.Circle({
          left: w * 0.85,
          top: h * 0.15,
          originX: 'center',
          originY: 'center',
          radius: w * 0.12,
          fill: spec.palette.accent,
          opacity: 0.25,
        })
      )
    } else if (style === 'editorial') {
      // Editorial Luxury Frame with inner border & geometric arch
      canvas.add(
        new fabric.Rect({
          left: w / 2,
          top: h / 2,
          originX: 'center',
          originY: 'center',
          width: w * 0.9,
          height: h * 0.9,
          fill: 'transparent',
          stroke: spec.palette.primary,
          strokeWidth: 4,
          rx: 24,
          ry: 24,
        })
      )
      canvas.add(
        new fabric.Rect({
          left: w / 2,
          top: h * 0.38,
          originX: 'center',
          originY: 'center',
          width: w * 0.65,
          height: h * 0.42,
          fill: spec.palette.secondary,
          opacity: 0.18,
          rx: 180,
          ry: 180,
        })
      )
    } else if (style === 'promo') {
      // Bold Promotional Retail Layout with diagonal banner & starburst
      const grad = new fabric.Gradient({
        type: 'linear',
        coords: { x1: 0, y1: 0, x2: w, y2: h },
        colorStops: [
          { offset: 0, color: spec.palette.primary },
          { offset: 1, color: spec.palette.secondary },
        ],
      })
      canvas.add(
        new fabric.Rect({
          left: 0,
          top: 0,
          width: w,
          height: h,
          fill: grad,
        })
      )
      canvas.add(
        new fabric.Rect({
          left: w / 2,
          top: h * 0.75,
          originX: 'center',
          originY: 'center',
          width: w * 0.88,
          height: h * 0.36,
          fill: spec.palette.background,
          rx: 32,
          ry: 32,
          shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 30, offsetX: 0, offsetY: 12 }),
        })
      )
    } else {
      // Minimalist Clean Studio
      canvas.add(
        new fabric.Rect({
          left: w / 2,
          top: h / 2,
          originX: 'center',
          originY: 'center',
          width: w * 0.88,
          height: h * 0.88,
          fill: spec.palette.secondary,
          opacity: 0.08,
          rx: 32,
          ry: 32,
        })
      )
    }

    // 2. Load and Place User Images with Drop Shadows & Rounded Frames
    try {
      const validUrls = imageUrls.filter(Boolean)
      if (validUrls.length === 1) {
        const img = await fabric.FabricImage.fromURL(validUrls[0], { crossOrigin: 'anonymous' })
        const maxImgDim = Math.min(w * 0.72, h * 0.44)
        const scale = maxImgDim / Math.max(img.width!, img.height!)
        img.scale(scale)
        img.set({
          left: style === 'split' ? w * 0.65 : w / 2,
          top: h * 0.4,
          originX: 'center',
          originY: 'center',
          shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.4)', blur: 32, offsetX: 0, offsetY: 16 }),
        })
        canvas.add(img)
      } else if (validUrls.length === 2) {
        const targetW = w * 0.38
        const targetH = h * 0.38
        for (let i = 0; i < 2; i++) {
          const img = await fabric.FabricImage.fromURL(validUrls[i], { crossOrigin: 'anonymous' })
          const scale = Math.min(targetW / img.width!, targetH / img.height!)
          img.scale(scale)
          img.set({
            left: i === 0 ? w * 0.32 : w * 0.68,
            top: h * 0.4,
            originX: 'center',
            originY: 'center',
            angle: i === 0 ? -3 : 3,
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 24, offsetX: 0, offsetY: 12 }),
          })
          canvas.add(img)
        }
      } else if (validUrls.length >= 3) {
        const count = Math.min(validUrls.length, 4)
        const targetDim = count <= 3 ? w * 0.27 : w * 0.22
        const spacing = w / (count + 1)
        for (let i = 0; i < count; i++) {
          const img = await fabric.FabricImage.fromURL(validUrls[i], { crossOrigin: 'anonymous' })
          const scale = targetDim / Math.max(img.width!, img.height!)
          img.scale(scale)
          img.set({
            left: spacing * (i + 1),
            top: h * 0.4,
            originX: 'center',
            originY: 'center',
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.35)', blur: 20, offsetX: 0, offsetY: 10 }),
          })
          canvas.add(img)
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar imagens para o design:', e)
    }

    // 3. Top Badge Pill
    const badgeW = Math.max(150, spec.badgeText.length * 14 + 44)
    const badgeBg = new fabric.Rect({
      left: w / 2,
      top: h * 0.11,
      originX: 'center',
      originY: 'center',
      width: badgeW,
      height: 44,
      fill: spec.palette.accent,
      rx: 22,
      ry: 22,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.25)', blur: 12, offsetX: 0, offsetY: 4 }),
    })
    const badgeText = new fabric.IText(spec.badgeText.toUpperCase(), {
      left: w / 2,
      top: h * 0.11,
      originX: 'center',
      originY: 'center',
      fontFamily: spec.fontFamily,
      fontSize: 16,
      fontWeight: 'bold',
      fill: '#ffffff',
    })
    canvas.add(badgeBg)
    canvas.add(badgeText)

    // 4. Headline & Subtitle
    const textFill = style === 'promo' ? spec.palette.textColor : spec.palette.textColor
    const headline = new fabric.IText(spec.headline, {
      left: w / 2,
      top: h * 0.68,
      originX: 'center',
      originY: 'center',
      fontFamily: spec.fontFamily,
      fontSize: Math.min(52, Math.round(w * 0.048)),
      fontWeight: 'bold',
      fill: textFill,
      textAlign: 'center',
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.18)', blur: 8, offsetX: 0, offsetY: 3 }),
    })
    canvas.add(headline)

    const subtitle = new fabric.IText(spec.subtitle, {
      left: w / 2,
      top: h * 0.76,
      originX: 'center',
      originY: 'center',
      fontFamily: 'Inter, sans-serif',
      fontSize: Math.min(24, Math.round(w * 0.022)),
      fill: textFill,
      opacity: 0.88,
      textAlign: 'center',
    })
    canvas.add(subtitle)

    // 5. CTA Button Pill
    const btnWidth = Math.max(220, spec.ctaText.length * 14 + 56)
    const btnBg = new fabric.Rect({
      left: w / 2,
      top: h * 0.86,
      originX: 'center',
      originY: 'center',
      width: btnWidth,
      height: 56,
      fill: style === 'promo' ? spec.palette.accent : spec.palette.primary,
      rx: 28,
      ry: 28,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 16, offsetX: 0, offsetY: 6 }),
    })
    const btnText = new fabric.IText(spec.ctaText.toUpperCase(), {
      left: w / 2,
      top: h * 0.86,
      originX: 'center',
      originY: 'center',
      fontFamily: spec.fontFamily,
      fontSize: 18,
      fontWeight: 'bold',
      fill: '#ffffff',
    })
    canvas.add(btnBg)
    canvas.add(btnText)

    canvas.renderAll()
  }

  /**
   * Auto-assemble a complete design layout OR a 5-page Editorial Carousel ("Pipa Arquitetura" Standard)
   */
  const applyGeneratedDesign = useCallback(
    async (imageInput: string | string[], spec: GeneratedDesignSpec, clearExisting = true) => {
      if (!fabricCanvas.current) return
      const canvas = fabricCanvas.current
      const imageUrls = (Array.isArray(imageInput) ? imageInput : [imageInput]).filter(Boolean)

      // Classify uploaded images (Line-art B&W plan vs Brand Logo vs Colorful Humanized plan)
      const classified = await classifyUploadedImages(imageUrls)

      // Check if spec has multi-page carousel slides (5 pages)
      if (spec.slides && spec.slides.length > 1) {
        isSwitchingPage.current = true

        // Ensure 1080x1350 Portrait Carousel dimensions if currently square 1080x1080
        if (canvas.width === 1080 && canvas.height === 1080) {
          canvas.setDimensions({ width: 1080, height: 1350 })
        }

        const newPages: PageData[] = new Array(spec.slides.length)
        const slideTitles = [
          '1. Capa Editorial',
          '2. O Desafio',
          '3. Oportunidade',
          '4. A Solução',
          '5. Detalhamento',
        ]

        // Preserve active page index if user is already viewing a multi-page carousel and re-editing it
        const targetPageIdx =
          pages.length > 1
            ? Math.min(Math.max(0, activePageIndexRef.current), spec.slides.length - 1)
            : 0

        // Build render order so targetPageIdx is rendered LAST and stays live on the canvas
        const renderOrder: number[] = []
        for (let i = 0; i < spec.slides.length; i++) {
          if (i !== targetPageIdx) renderOrder.push(i)
        }
        renderOrder.push(targetPageIdx)

        for (const i of renderOrder) {
          const slide = spec.slides[i]
          const slideType = slide.slideType || (['cover', 'challenge', 'opportunity', 'solution', 'detail'][i % 5] as EditorialSlideSpec['slideType'])

          // Route the right image to each slide type
          let routedImage = classified.colorfulUrl || imageUrls[i % Math.max(1, imageUrls.length)] || ''
          if (slideType === 'cover') {
            routedImage = classified.logoUrl || ''
          } else if (slideType === 'challenge') {
            routedImage = classified.lineartUrl || imageUrls[0] || ''
          } else if (slideType === 'opportunity' || slideType === 'solution' || slideType === 'detail') {
            routedImage = classified.colorfulUrl || imageUrls[imageUrls.length - 1] || ''
          }

          const normalizedSlide: EditorialSlideSpec = {
            ...slide,
            slideType,
          }

          await renderEditorialSlideOnCanvas(
            canvas,
            normalizedSlide,
            spec,
            routedImage,
            classified.colorfulUrl || routedImage
          )

          newPages[i] = {
            id: `page-${Date.now()}-${i}`,
            title: slideTitles[i] || `Slide ${i + 1}`,
            json: JSON.stringify(canvas.toJSON()),
            backgroundColor: spec.palette.background || '#ebe6de',
          }
        }

        // targetPageIdx is already live on the canvas!
        activePageIndexRef.current = targetPageIdx
        setActivePageIndex(targetPageIdx)
        setPages(newPages)
        canvas.requestRenderAll()
        canvas.renderAll()
        isSwitchingPage.current = false
        syncLayers()
        saveState()
        return
      }

      // Single page design
      if (!clearExisting) {
        // Keep existing objects if requested
      }
      if (spec.slides && spec.slides.length === 1 && spec.slides[0].slideType) {
        const slide = spec.slides[0]
        await renderEditorialSlideOnCanvas(
          canvas,
          slide,
          spec,
          classified.colorfulUrl || imageUrls[0] || '',
          classified.colorfulUrl || imageUrls[0] || ''
        )
      } else {
        await renderDesignSlideOnCanvas(canvas, imageUrls, spec, spec.layoutStyle)
      }
      syncLayers()
      saveState()
    },
    [syncLayers, saveState]
  )

  // Export all pages (including active canvas state) and thumbnail for project saving
  const serializeProjectPages = useCallback(() => {
    if (!fabricCanvas.current) return { pages, activePageIndex, thumbnail: '' }
    const canvas = fabricCanvas.current
    const currentJson = JSON.stringify(canvas.toJSON())
    const currentBg = typeof canvas.backgroundColor === 'string' ? canvas.backgroundColor : '#ffffff'

    const updatedPages = pages.map((p, idx) =>
      idx === activePageIndex ? { ...p, json: currentJson, backgroundColor: currentBg } : p
    )

    setPages(updatedPages)

    let thumbnail = ''
    try {
      thumbnail = canvas.toDataURL({ format: 'jpeg', multiplier: 0.25, quality: 0.7 })
    } catch {}

    return {
      pages: updatedPages,
      activePageIndex,
      thumbnail,
    }
  }, [pages, activePageIndex])

  // Load saved project pages into the workspace
  const loadProjectPages = useCallback(
    async (savedPages: PageData[], targetPageIndex = 0, width?: number, height?: number) => {
      if (!fabricCanvas.current || !savedPages || savedPages.length === 0) return
      const canvas = fabricCanvas.current

      isSwitchingPage.current = true
      if (width && height) {
        canvas.setDimensions({ width, height })
      }

      const idx = Math.min(Math.max(0, targetPageIndex), savedPages.length - 1)
      setPages(savedPages)
      setActivePageIndex(idx)

      const target = savedPages[idx]
      canvas.clear()
      canvas.backgroundColor = target.backgroundColor || '#ffffff'

      if (target.json) {
        try {
          await canvas.loadFromJSON(JSON.parse(target.json))
          hydrateCanvasVectorLines(canvas)
        } catch (e) {
          console.warn('Erro ao carregar JSON da página:', e)
        }
      }

      canvas.renderAll()
      syncLayers()
      historyStack.current = [JSON.stringify(canvas.toJSON())]
      historyIndex.current = 0
      setCanUndo(false)
      setCanRedo(false)
      setSelectedObject(null)
      isSwitchingPage.current = false
    },
    [syncLayers]
  )

  return {
    canvasRef,
    fabricCanvas,
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
    updateVectorLine,
    addImage,
    replaceSelectedImage,
    getSelectedObjectDataUrl,
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
    selectLayer,
    toggleLayerVisibility,
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
    reorderPage,
    renamePage,
    serializeProjectPages,
    loadProjectPages,
  }
}
