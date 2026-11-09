import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Sparkles,
  Paintbrush,
  Undo2,
  Trash2,
  Scissors,
  Eraser,
  Wand2,
  Check,
  Loader2,
  Bot,
  RotateCcw,
} from 'lucide-react'
import { lmStudioService } from '../../services/lmStudioService'
import { comfyOnDemandService } from '../../services/comfyOnDemandService'

interface PhotoEditorStudioModalProps {
  isOpen: boolean
  initialImageUrl: string | null
  onClose: () => void
  onApplyEditedImage: (editedDataUrl: string) => Promise<void>
}

interface FreehandStroke {
  points: Array<{ x: number; y: number }>
  size: number
  color: string
  mode: 'highlight' | 'guide'
}

export const PhotoEditorStudioModal: React.FC<PhotoEditorStudioModalProps> = ({
  isOpen,
  initialImageUrl,
  onClose,
  onApplyEditedImage,
}) => {
  // Image version history inside the studio
  const [imageStack, setImageStack] = useState<string[]>([])
  const currentImageUrl = imageStack[imageStack.length - 1] || initialImageUrl || ''

  // Freehand strokes drawn over the photo
  const [strokes, setStrokes] = useState<FreehandStroke[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushMode, setBrushMode] = useState<'highlight' | 'guide'>('highlight')
  const [brushSize, setBrushSize] = useState<number>(34)
  const [brushColor, setBrushColor] = useState<string>('#10b981')

  // AI instruction & processing state
  const [aiPrompt, setAiPrompt] = useState('')
  const [editScope, setEditScope] = useState<'region' | 'full'>('region')
  const [removeBgOnFull, setRemoveBgOnFull] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusText, setStatusText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)

  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedImageRef = useRef<HTMLImageElement | null>(null)
  const [canvasDim, setCanvasDim] = useState<{ w: number; h: number }>({ w: 520, h: 520 })

  useEffect(() => {
    if (isOpen && initialImageUrl) {
      setImageStack([initialImageUrl])
      setStrokes([])
      setAiPrompt('')
      setError(null)
      setAiExplanation(null)
      setStatusText('')
    }
  }, [isOpen, initialImageUrl])

  // Load currentImageUrl onto baseCanvas
  useEffect(() => {
    if (!isOpen || !currentImageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      loadedImageRef.current = img
      const maxViewport = 520
      const nw = img.naturalWidth || img.width || 520
      const nh = img.naturalHeight || img.height || 520
      const scale = Math.min(maxViewport / nw, maxViewport / nh)
      const w = Math.max(180, Math.round(nw * scale))
      const h = Math.max(180, Math.round(nh * scale))
      setCanvasDim({ w, h })

      requestAnimationFrame(() => {
        const base = baseCanvasRef.current
        if (!base) return
        base.width = w
        base.height = h
        const ctx = base.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
      })
    }
    img.src = currentImageUrl
  }, [isOpen, currentImageUrl])

  // Render freehand strokes onto overlayCanvas
  const renderOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return
    overlay.width = canvasDim.w
    overlay.height = canvasDim.h
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvasDim.w, canvasDim.h)
    for (const s of strokes) {
      if (s.points.length === 0) continue
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = s.size
      ctx.strokeStyle = s.color
      ctx.globalAlpha = s.mode === 'highlight' ? 0.48 : 0.92
      ctx.beginPath()
      s.points.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x, pt.y)
        else ctx.lineTo(pt.x, pt.y)
      })
      if (s.points.length === 1) {
        ctx.lineTo(s.points[0].x + 0.5, s.points[0].y + 0.5)
      }
      ctx.stroke()
      ctx.restore()
    }
  }, [strokes, canvasDim])

  useEffect(() => {
    renderOverlay()
  }, [renderOverlay])

  if (!isOpen || !initialImageUrl) return null

  const getPointerPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(canvasDim.w, e.clientX - rect.left)),
      y: Math.max(0, Math.min(canvasDim.h, e.clientY - rect.top)),
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isProcessing) return
    const pt = getPointerPos(e)
    setIsDrawing(true)
    setStrokes((prev) => [
      ...prev,
      {
        points: [pt],
        size: brushSize,
        color: brushColor,
        mode: brushMode,
      },
    ])
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isProcessing) return
    const pt = getPointerPos(e)
    setStrokes((prev) => {
      if (prev.length === 0) return prev
      const copy = [...prev]
      const last = copy[copy.length - 1]
      copy[copy.length - 1] = {
        ...last,
        points: [...last.points, pt],
      }
      return copy
    })
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
  }

  // Compute bounding box of highlighted strokes in normalized [0..1] coordinates
  const getHighlightBoundsNormalized = (): {
    minX: number
    minY: number
    maxX: number
    maxY: number
    w: number
    h: number
  } | null => {
    if (strokes.length === 0) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    strokes.forEach((s) => {
      const r = s.size / 2
      s.points.forEach((pt) => {
        minX = Math.min(minX, pt.x - r)
        minY = Math.min(minY, pt.y - r)
        maxX = Math.max(maxX, pt.x + r)
        maxY = Math.max(maxY, pt.y + r)
      })
    })

    if (!Number.isFinite(minX)) return null
    const clampedMinX = Math.max(0, minX) / canvasDim.w
    const clampedMinY = Math.max(0, minY) / canvasDim.h
    const clampedMaxX = Math.min(canvasDim.w, maxX) / canvasDim.w
    const clampedMaxY = Math.min(canvasDim.h, maxY) / canvasDim.h

    return {
      minX: clampedMinX,
      minY: clampedMinY,
      maxX: clampedMaxX,
      maxY: clampedMaxY,
      w: Math.max(0.05, clampedMaxX - clampedMinX),
      h: Math.max(0.05, clampedMaxY - clampedMinY),
    }
  }

  const pushEditedImage = (newDataUrl: string) => {
    setImageStack((prev) => [...prev, newDataUrl])
    setStrokes([])
  }

  // 1. Magic Erase / Heal Highlighted Area Locally (fills highlighted strokes with surrounding ambient color)
  const handleEraseHighlightedArea = (makeTransparent = false) => {
    const img = loadedImageRef.current
    if (!img || strokes.length === 0) {
      setError('Destaque primeiro na imagem (com o pincel à mão livre) a área que deseja apagar!')
      return
    }
    setError(null)

    const nw = img.naturalWidth || img.width || canvasDim.w
    const nh = img.naturalHeight || img.height || canvasDim.h
    const scaleX = nw / canvasDim.w
    const scaleY = nh / canvasDim.h

    const workCanvas = document.createElement('canvas')
    workCanvas.width = nw
    workCanvas.height = nh
    const wctx = workCanvas.getContext('2d')!
    wctx.drawImage(img, 0, 0, nw, nh)

    // Build mask canvas at natural resolution
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = nw
    maskCanvas.height = nh
    const mctx = maskCanvas.getContext('2d')!
    mctx.lineCap = 'round'
    mctx.lineJoin = 'round'
    mctx.strokeStyle = '#ffffff'
    strokes.forEach((s) => {
      mctx.lineWidth = s.size * Math.max(scaleX, scaleY)
      mctx.beginPath()
      s.points.forEach((pt, idx) => {
        const x = pt.x * scaleX
        const y = pt.y * scaleY
        if (idx === 0) mctx.moveTo(x, y)
        else mctx.lineTo(x, y)
      })
      if (s.points.length === 1) {
        mctx.lineTo(s.points[0].x * scaleX + 1, s.points[0].y * scaleY + 1)
      }
      mctx.stroke()
    })

    if (makeTransparent) {
      wctx.save()
      wctx.globalCompositeOperation = 'destination-out'
      wctx.drawImage(maskCanvas, 0, 0)
      wctx.restore()
      pushEditedImage(workCanvas.toDataURL('image/png'))
      setAiExplanation('Área destacada removida (tornada transparente) com sucesso!')
      return
    }

    // Sample border pixels around the highlight bounds to heal seamlessly with background color
    const bounds = getHighlightBoundsNormalized()!
    const bx = Math.floor(bounds.minX * nw)
    const by = Math.floor(bounds.minY * nh)
    const bw = Math.ceil(bounds.w * nw)
    const bh = Math.ceil(bounds.h * nh)

    const imgData = wctx.getImageData(0, 0, nw, nh).data
    let rSum = 0
    let gSum = 0
    let bSum = 0
    let count = 0

    const samplePixel = (px: number, py: number) => {
      const cx = Math.max(0, Math.min(nw - 1, Math.round(px)))
      const cy = Math.max(0, Math.min(nh - 1, Math.round(py)))
      const idx = (cy * nw + cx) * 4
      if (imgData[idx + 3] > 128) {
        rSum += imgData[idx]
        gSum += imgData[idx + 1]
        bSum += imgData[idx + 2]
        count++
      }
    }

    for (let x = bx; x <= bx + bw; x += 6) {
      samplePixel(x, by - 6)
      samplePixel(x, by + bh + 6)
    }
    for (let y = by; y <= by + bh; y += 6) {
      samplePixel(bx - 6, y)
      samplePixel(bx + bw + 6, y)
    }

    const fillR = count > 0 ? Math.round(rSum / count) : 245
    const fillG = count > 0 ? Math.round(gSum / count) : 242
    const fillB = count > 0 ? Math.round(bSum / count) : 235

    const patchCanvas = document.createElement('canvas')
    patchCanvas.width = nw
    patchCanvas.height = nh
    const pctx = patchCanvas.getContext('2d')!
    pctx.drawImage(maskCanvas, 0, 0)
    pctx.globalCompositeOperation = 'source-in'
    pctx.fillStyle = `rgb(${fillR}, ${fillG}, ${fillB})`
    pctx.fillRect(0, 0, nw, nh)

    wctx.drawImage(patchCanvas, 0, 0)
    pushEditedImage(workCanvas.toDataURL('image/png'))
    setAiExplanation('Objeto destacado apagado e preenchido com o tom do fundo ao redor!')
  }

  // 2. Crop / Isolate ONLY the Highlighted Region
  const handleIsolateHighlightedRegion = () => {
    const img = loadedImageRef.current
    const bounds = getHighlightBoundsNormalized()
    if (!img || !bounds) {
      setError('Destaque primeiro com o pincel a parte da foto que deseja isolar/recortar!')
      return
    }
    setError(null)

    const nw = img.naturalWidth || img.width || canvasDim.w
    const nh = img.naturalHeight || img.height || canvasDim.h
    const sx = Math.max(0, Math.floor(bounds.minX * nw))
    const sy = Math.max(0, Math.floor(bounds.minY * nh))
    const sw = Math.min(nw - sx, Math.max(40, Math.ceil(bounds.w * nw)))
    const sh = Math.min(nh - sy, Math.max(40, Math.ceil(bounds.h * nh)))

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = sw
    cropCanvas.height = sh
    const cctx = cropCanvas.getContext('2d')!
    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

    pushEditedImage(cropCanvas.toDataURL('image/png'))
    setAiExplanation('Área destacada recortada e isolada com sucesso!')
  }

  // 3. Remove Background of the whole photo using ComfyUI BiRefNet
  const handleRemoveBgInStudio = async () => {
    setError(null)
    setIsProcessing(true)
    setStatusText('ComfyUI (BiRefNet): Removendo fundo da imagem...')
    try {
      const noBgUrl = await comfyOnDemandService.removeBackgroundFromDataUrl(currentImageUrl)
      pushEditedImage(noBgUrl)
      setAiExplanation('Fundo removido com BiRefNet no ComfyUI!')
    } catch (err: any) {
      setError(err.message || 'Erro ao remover fundo no ComfyUI.')
    } finally {
      setIsProcessing(false)
      setStatusText('')
    }
  }

  // 4. Ask AI (LM Studio + ComfyUI Z-Image-Turbo) to Edit the Highlighted Region or Full Photo
  const handleRunAIEdit = async () => {
    if (!aiPrompt.trim()) {
      setError('Digite abaixo o que você quer que a IA faça na imagem ou na área destacada!')
      return
    }
    setError(null)
    setIsProcessing(true)

    try {
      const bounds = getHighlightBoundsNormalized()
      const hasHighlight = Boolean(bounds)

      setStatusText('LM Studio entendendo seu pedido e a área destacada...')
      let enhancedPrompt = aiPrompt.trim()
      try {
        const enhanced = await lmStudioService.enhancePrompt(
          hasHighlight && editScope === 'region'
            ? `${aiPrompt.trim()}, isolated object on clean background, studio lighting, high detail`
            : aiPrompt.trim()
        )
        enhancedPrompt = enhanced.positive
      } catch {}

      setStatusText('ComfyUI (Z-Image-Turbo): Gerando edição com IA...')
      let genUrl = await comfyOnDemandService.generateImage({
        prompt: enhancedPrompt,
        width: 1024,
        height: 1024,
        steps: 8,
      })

      // If user highlighted a specific region and wants local fusion, remove BG of generated asset and composite it onto the highlighted bounds!
      if (hasHighlight && bounds && editScope === 'region') {
        setStatusText('ComfyUI (BiRefNet): Recortando elemento para fundir na área destacada...')
        try {
          genUrl = await comfyOnDemandService.removeBackgroundFromDataUrl(genUrl)
        } catch {}

        const baseImg = loadedImageRef.current!
        const nw = baseImg.naturalWidth || baseImg.width || canvasDim.w
        const nh = baseImg.naturalHeight || baseImg.height || canvasDim.h

        const genImg = await new Promise<HTMLImageElement>((resolve, reject) => {
          const im = new Image()
          im.crossOrigin = 'anonymous'
          im.onload = () => resolve(im)
          im.onerror = reject
          im.src = genUrl
        })

        const compCanvas = document.createElement('canvas')
        compCanvas.width = nw
        compCanvas.height = nh
        const cctx = compCanvas.getContext('2d')!
        cctx.drawImage(baseImg, 0, 0, nw, nh)

        const targetX = bounds.minX * nw
        const targetY = bounds.minY * nh
        const targetW = bounds.w * nw
        const targetH = bounds.h * nh

        // Maintain aspect ratio of generated element centered inside the user's highlighted box
        const gw = genImg.naturalWidth || genImg.width || 1024
        const gh = genImg.naturalHeight || genImg.height || 1024
        const fit = Math.min(targetW / gw, targetH / gh)
        const drawW = gw * fit
        const drawH = gh * fit
        const drawX = targetX + (targetW - drawW) / 2
        const drawY = targetY + (targetH - drawH) / 2

        cctx.drawImage(genImg, drawX, drawY, drawW, drawH)
        pushEditedImage(compCanvas.toDataURL('image/png'))
        setAiExplanation(
          `A IA entendeu a área destacada e inseriu "${aiPrompt.trim()}" exatamente onde você marcou!`
        )
      } else {
        // Full image replacement
        if (removeBgOnFull) {
          setStatusText('ComfyUI (BiRefNet): Removendo fundo da nova imagem...')
          try {
            genUrl = await comfyOnDemandService.removeBackgroundFromDataUrl(genUrl)
          } catch {}
        }
        pushEditedImage(genUrl)
        setAiExplanation(`Imagem transformada com sucesso pela IA ("${aiPrompt.trim()}")!`)
      }
    } catch (err: any) {
      setError(
        err.message ||
          'Erro ao processar com IA. Verifique se o seu ComfyUI está aberto na porta 8188.'
      )
    } finally {
      setIsProcessing(false)
      setStatusText('')
    }
  }

  const hasHighlight = strokes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-purple-600/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Estúdio de Edição de Foto & Destaque IA</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-semibold">
                  Magic Edit
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pinte ou circule à mão livre na foto o que deseja destacar para a IA entender, apagar, recortar ou transformar.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body: Left Interactive Highlight Canvas + Right AI Controls */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* Left Column (7 cols): Interactive Photo + Freehand Highlighting Brush */}
          <div className="lg:col-span-7 p-5 flex flex-col items-center justify-between bg-[#090b10] space-y-4">
            {/* Top Brush Toolbar */}
            <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBrushMode('highlight')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                    brushMode === 'highlight'
                      ? 'bg-emerald-600/25 border border-emerald-500 text-emerald-200'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Destacar área na foto para a IA focar"
                >
                  <Paintbrush className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Destacar Área (IA)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBrushMode('guide')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                    brushMode === 'guide'
                      ? 'bg-purple-600/25 border border-purple-500 text-purple-200'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="Desenhar traço guia sólido sobre a imagem"
                >
                  <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Traço Guia</span>
                </button>
              </div>

              {/* Brush Size */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Pincel:</span>
                <input
                  type="range"
                  min={8}
                  max={90}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20 accent-emerald-500"
                />
                <span className="font-mono text-[11px] text-slate-300 w-8">{brushSize}px</span>
              </div>

              {/* Brush Colors */}
              <div className="flex items-center gap-1">
                {['#10b981', '#a855f7', '#ef4444', '#f59e0b', '#3b82f6', '#ffffff'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setBrushColor(col)}
                    className={`w-5 h-5 rounded-full border transition ${
                      brushColor === col ? 'border-white scale-125 ring-2 ring-white/30' : 'border-slate-700'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>

              {/* Undo / Clear Highlight Strokes */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                  disabled={strokes.length === 0}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
                  title="Desfazer último traço de destaque"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setStrokes([])}
                  disabled={strokes.length === 0}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 disabled:opacity-30"
                  title="Limpar todo o destaque"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive Dual-Canvas Viewport */}
            <div className="relative flex items-center justify-center flex-1 min-h-[380px] w-full">
              <div
                className="relative rounded-xl overflow-hidden shadow-2xl border border-slate-700/80"
                style={{
                  width: canvasDim.w,
                  height: canvasDim.h,
                  backgroundImage:
                    'linear-gradient(45deg, #1e293b 25%, transparent 25%), linear-gradient(-45deg, #1e293b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1e293b 75%), linear-gradient(-45deg, transparent 75%, #1e293b 75%)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                  backgroundColor: '#0f172a',
                }}
              >
                <canvas
                  ref={baseCanvasRef}
                  className="block pointer-events-none"
                  style={{ width: canvasDim.w, height: canvasDim.h }}
                />
                <canvas
                  ref={overlayCanvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="absolute inset-0 cursor-crosshair"
                  style={{ width: canvasDim.w, height: canvasDim.h }}
                />
              </div>
            </div>

            {/* Bottom Status & Version Undo Bar */}
            <div className="w-full flex items-center justify-between text-xs text-slate-400 px-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasHighlight ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                  }`}
                />
                <span>
                  {hasHighlight
                    ? 'Área destacada pronta! Escolha abaixo o que fazer com a região marcada.'
                    : 'Dica: Arraste o mouse sobre a foto para destacar/circular uma região específica.'}
                </span>
              </div>

              {imageStack.length > 1 && (
                <button
                  type="button"
                  onClick={() => setImageStack((prev) => prev.slice(0, -1))}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Desfazer Edição na Foto</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): AI Commands & Instant Highlight Tools */}
          <div className="lg:col-span-5 p-5 flex flex-col justify-between bg-slate-900 space-y-4">
            <div className="space-y-4">
              {/* Section 1: Instant Actions on the Highlighted Area */}
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Paintbrush className="w-3.5 h-3.5" />
                  <span>Ações Rápidas na Área Destacada</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isProcessing || !hasHighlight}
                    onClick={handleIsolateHighlightedRegion}
                    className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500/50 text-left transition disabled:opacity-40"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-white text-xs mb-0.5">
                      <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Isolar / Recortar</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Mantém somente a parte que você destacou na foto
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing || !hasHighlight}
                    onClick={() => handleEraseHighlightedArea(false)}
                    className="p-2.5 rounded-xl bg-slate-800/90 hover:bg-purple-600/20 border border-slate-700 hover:border-purple-500/50 text-left transition disabled:opacity-40"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-white text-xs mb-0.5">
                      <Eraser className="w-3.5 h-3.5 text-purple-400" />
                      <span>Borracha Mágica</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Apaga o detalhe destacado preenchendo com o fundo
                    </p>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isProcessing || !hasHighlight}
                    onClick={() => handleEraseHighlightedArea(true)}
                    className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                  >
                    <Eraser className="w-3.5 h-3.5 text-rose-400" />
                    <span>Vazar Transparência</span>
                  </button>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleRemoveBgInStudio}
                    className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-emerald-600/25 border border-slate-700 hover:border-emerald-500/50 text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Remover Fundo (IA)</span>
                  </button>
                </div>
              </div>

              {/* Section 2: Ask AI to Transform / Generate inside the Highlighted Region or Photo */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-950/80 to-indigo-950/40 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span>Pedir para a IA fazer algo nesta Foto</span>
                  </div>
                </div>

                {hasHighlight && (
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditScope('region')}
                      className={`py-1.5 px-2 rounded-lg font-semibold transition ${
                        editScope === 'region'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🎯 Só na Área Destacada
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditScope('full')}
                      className={`py-1.5 px-2 rounded-lg font-semibold transition ${
                        editScope === 'full'
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🖼️ Na Foto Inteira
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] text-slate-300 mb-1.5">
                    Descreva o que deseja adicionar, mudar ou transformar:
                  </label>
                  <textarea
                    rows={3}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={
                      hasHighlight
                        ? 'Ex: Colocar uma planta decorativa vista de cima nesta área destacada...'
                        : 'Ex: Transformar em render arquitetônico 3D realista com iluminação quente...'
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 resize-none"
                  />
                </div>

                {/* Quick Prompt Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Planta humanizada vista de cima',
                    'Vaso de planta decorativo moderno',
                    'Mobiliário de clínica sofisticado',
                    'Render arquitetônico 3D realista',
                  ].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAiPrompt(chip)}
                      className="px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-purple-600/25 border border-slate-700 text-[10px] text-slate-300 hover:text-purple-200 transition"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>

                {(!hasHighlight || editScope === 'full') && (
                  <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeBgOnFull}
                      onChange={(e) => setRemoveBgOnFull(e.target.checked)}
                      className="rounded accent-emerald-500"
                    />
                    <span>Apagar fundo do resultado com BiRefNet</span>
                  </label>
                )}

                <button
                  type="button"
                  disabled={isProcessing || !aiPrompt.trim()}
                  onClick={handleRunAIEdit}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 transition disabled:opacity-40"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{statusText || 'Processando com IA...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {hasHighlight && editScope === 'region'
                          ? 'Executar IA na Área Destacada (ComfyUI)'
                          : 'Transformar Foto com IA (ComfyUI)'}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {aiExplanation && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs leading-relaxed">
                  ✨ {aiExplanation}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
                  {error}
                </div>
              )}
            </div>

            {/* Footer: Cancel or Save back to Slide */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={async () => {
                  await onApplyEditedImage(currentImageUrl)
                  onClose()
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition"
              >
                <Check className="w-4 h-4" />
                <span>Salvar e Atualizar na Página</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

