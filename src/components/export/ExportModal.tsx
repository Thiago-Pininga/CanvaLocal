import React, { useState, useEffect } from 'react'
import { Download, X, FolderArchive, Columns, CheckSquare, Square } from 'lucide-react'
import confetti from 'canvas-confetti'
import {
  dataUrlToBlob,
  triggerBlobDownload,
  createZipFromDataUrls,
  createPanoramicStripBlob,
} from '../../services/zipExportService'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  onExport: (format: 'png' | 'jpeg' | 'webp', scale: number, transparent: boolean) => string
  onExportAll?: (
    format: 'png' | 'jpeg' | 'webp',
    scale: number,
    transparent: boolean
  ) => Promise<Array<{ title: string; dataUrl: string }>>
  pageCount?: number
  activePageIndex?: number
  pageTitles?: string[]
  canvasWidth: number
  canvasHeight: number
  designTitle: string
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExport,
  onExportAll,
  pageCount = 1,
  activePageIndex = 0,
  pageTitles = [],
  canvasWidth,
  canvasHeight,
  designTitle,
}) => {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [scale, setScale] = useState<number>(1)
  const [transparent, setTransparent] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [selectedPages, setSelectedPages] = useState<number[]>([])

  // Select all pages by default whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPages(Array.from({ length: pageCount }, (_, i) => i))
    }
  }, [isOpen, pageCount])

  if (!isOpen) return null

  const togglePageSelection = (idx: number) => {
    setSelectedPages((prev) =>
      prev.includes(idx) ? (prev.length > 1 ? prev.filter((i) => i !== idx) : prev) : [...prev, idx].sort((a, b) => a - b)
    )
  }

  const selectBlock = (start: number, end: number) => {
    const indices: number[] = []
    for (let i = start; i <= Math.min(end, pageCount - 1); i++) {
      indices.push(i)
    }
    if (indices.length > 0) setSelectedPages(indices)
  }

  // 1. Download Current Active Page (via Blob URL so Chrome never blocks >2MB images)
  const handleDownloadCurrentPage = () => {
    const dataUrl = onExport(format, scale, transparent)
    if (!dataUrl) return

    const safeBase = designTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Design'
    const currentSlideName = (pageTitles[activePageIndex] || `Pagina_${activePageIndex + 1}`).replace(
      /[^a-zA-Z0-9_-]/g,
      '_'
    )
    const blob = dataUrlToBlob(dataUrl)
    triggerBlobDownload(blob, `${safeBase}_${currentSlideName}_${scale}x.${format}`)

    try {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } })
    } catch {}
    onClose()
  }

  // 2. Download Selected Block as a Single .ZIP Archive
  const handleDownloadZipBlock = async () => {
    if (!onExportAll || isExporting || selectedPages.length === 0) return
    setIsExporting(true)
    try {
      const allResults = await onExportAll(format, scale, transparent)
      const safeBase = designTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Carrossel'
      const ext = format === 'jpeg' ? 'jpg' : format

      const filesToZip = selectedPages
        .filter((idx) => Boolean(allResults[idx]))
        .map((idx) => {
          const item = allResults[idx]
          const num = String(idx + 1).padStart(2, '0')
          const safeSlide = item.title.replace(/[^a-zA-Z0-9_-]/g, '_')
          return {
            filename: `${num}_${safeSlide}.${ext}`,
            dataUrl: item.dataUrl,
          }
        })

      const zipBlob = createZipFromDataUrls(filesToZip)
      triggerBlobDownload(zipBlob, `${safeBase}_Bloco_${filesToZip.length}_Paginas.zip`)

      try {
        confetti({ particleCount: 110, spread: 75, origin: { y: 0.8 } })
      } catch {}
      onClose()
    } finally {
      setIsExporting(false)
    }
  }

  // 3. Download Selected Block Stitched as a Single Panoramic Board
  const handleDownloadPanoramicBlock = async () => {
    if (!onExportAll || isExporting || selectedPages.length === 0) return
    setIsExporting(true)
    try {
      const allResults = await onExportAll(format, scale, transparent)
      const safeBase = designTitle.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Carrossel'
      const ext = format === 'jpeg' ? 'jpg' : format

      const selectedUrls = selectedPages
        .filter((idx) => Boolean(allResults[idx]))
        .map((idx) => allResults[idx].dataUrl)

      const stripBlob = await createPanoramicStripBlob(selectedUrls, format, 0)
      triggerBlobDownload(stripBlob, `${safeBase}_Prancha_${selectedUrls.length}_Paginas_${scale}x.${ext}`)

      try {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.8 } })
      } catch {}
      onClose()
    } finally {
      setIsExporting(false)
    }
  }

  const finalWidth = canvasWidth * scale
  const finalHeight = canvasHeight * scale

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Exportar Design & Carrossel em Bloco</h3>
              <p className="text-[11px] text-slate-400">
                Baixe a página atual, um pacote .ZIP único ou uma prancha contínua
              </p>
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
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {/* Format selection */}
          <div>
            <label className="block font-medium text-slate-300 mb-2">Formato de Arquivo</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'png', label: 'PNG', desc: 'Máxima nitidez para textos e plantas' },
                { id: 'jpeg', label: 'JPG', desc: 'Arquivo leve para Instagram' },
                { id: 'webp', label: 'WebP', desc: 'Alta compactação para web' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id as any)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    format === f.id
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-semibold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold">{f.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Scale / Resolution Selection */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="font-medium text-slate-300">Resolução de Saída</label>
              <span className="text-slate-400 font-mono text-[11px]">
                {finalWidth} × {finalHeight} px
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { s: 1, label: '1x (Padrão)', desc: `${canvasWidth}×${canvasHeight}` },
                { s: 2, label: '2x (Alta Definição)', desc: `${canvasWidth * 2}×${canvasHeight * 2}` },
                { s: 4, label: '4x (Ultra HD)', desc: `${canvasWidth * 4}×${canvasHeight * 4}` },
              ].map((item) => (
                <button
                  key={item.s}
                  onClick={() => setScale(item.s)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    scale === item.s
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-semibold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Block / Page Range Selector when Multi-Page */}
          {pageCount > 1 && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">
                  Selecionar Bloco de Páginas ({selectedPages.length} de {pageCount})
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => selectBlock(0, pageCount - 1)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-purple-600/30 text-[10px] text-slate-300 border border-slate-700"
                  >
                    Todas ({pageCount})
                  </button>
                  {pageCount >= 3 && (
                    <button
                      onClick={() => selectBlock(0, 2)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-purple-600/30 text-[10px] text-slate-300 border border-slate-700"
                    >
                      Bloco 1–3
                    </button>
                  )}
                  {pageCount >= 5 && (
                    <button
                      onClick={() => selectBlock(2, 4)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-purple-600/30 text-[10px] text-slate-300 border border-slate-700"
                    >
                      Bloco 3–5
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {Array.from({ length: pageCount }, (_, idx) => {
                  const isChecked = selectedPages.includes(idx)
                  const label = pageTitles[idx] || `Página ${idx + 1}`
                  return (
                    <button
                      key={idx}
                      onClick={() => togglePageSelection(idx)}
                      className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-2 transition ${
                        isChecked
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 font-medium'
                          : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}
                      <span className="truncate text-[11px]">{label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Transparent Background option for PNG */}
          {format === 'png' && (
            <label className="flex items-center gap-2 p-3 bg-slate-800/60 border border-slate-700/80 rounded-xl cursor-pointer hover:bg-slate-800 transition">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 bg-slate-700 border-slate-600"
              />
              <div>
                <span className="font-medium text-slate-200">Fundo Transparente</span>
                <p className="text-[11px] text-slate-400">Exporta sem a cor de fundo do canvas</p>
              </div>
            </label>
          )}

          {/* Download Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* Button 1: Download Current Active Page */}
            <button
              onClick={handleDownloadCurrentPage}
              disabled={isExporting}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:opacity-95 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>
                Baixar Página Atual: {pageTitles[activePageIndex] || `Página ${activePageIndex + 1}`} (
                {format.toUpperCase()})
              </span>
            </button>

            {/* Buttons 2 & 3: Download Selected Block (.ZIP or Panoramic Strip) */}
            {pageCount > 1 && onExportAll && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleDownloadZipBlock}
                  disabled={isExporting}
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition active:scale-95"
                  title="Baixa todas as páginas selecionadas juntas dentro de um único arquivo .ZIP"
                >
                  <FolderArchive className="w-4 h-4 shrink-0" />
                  <span>
                    {isExporting ? 'Empacotando...' : `Baixar Bloco em .ZIP (${selectedPages.length}p)`}
                  </span>
                </button>

                <button
                  onClick={handleDownloadPanoramicBlock}
                  disabled={isExporting}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-50 text-slate-100 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  title="Junta as páginas selecionadas lado a lado em uma única imagem panorâmica"
                >
                  <Columns className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    {isExporting ? 'Gerando...' : `Baixar em Prancha Única (${selectedPages.length}p)`}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
