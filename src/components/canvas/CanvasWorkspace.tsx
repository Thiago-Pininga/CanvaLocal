import React, { useEffect, useLayoutEffect, useRef } from 'react'

interface CanvasWorkspaceProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  width: number
  height: number
  zoom: number
  setZoom: React.Dispatch<React.SetStateAction<number>>
  backgroundColor: string
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 3.0

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  canvasRef,
  width,
  height,
  zoom,
  setZoom,
  backgroundColor,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const artboardBoxRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // Stores the cursor anchor point on the unscaled image/artboard during Ctrl+Scroll zoom
  const zoomAnchorRef = useRef<{
    imgX: number
    imgY: number
    clientX: number
    clientY: number
  } | null>(null)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const currentZoom = zoomRef.current
      const box = artboardBoxRef.current
      if (box) {
        const rect = box.getBoundingClientRect()
        // Clamp cursor target to the artboard bounds if hovering over or near it
        const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
        const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
        zoomAnchorRef.current = {
          imgX: relX / currentZoom,
          imgY: relY / currentZoom,
          clientX: e.clientX,
          clientY: e.clientY,
        }
      }

      // Smooth exponential zoom step (works naturally with both mouse wheels and precision trackpads)
      const zoomFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((currentZoom * zoomFactor).toFixed(3))))

      if (nextZoom !== currentZoom) {
        setZoom(nextZoom)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [setZoom])

  // Keep the exact image pixel under the mouse cursor stationary when zooming with Ctrl+Scroll
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const container = scrollContainerRef.current
    const box = artboardBoxRef.current
    if (!anchor || !container || !box) return

    const newRect = box.getBoundingClientRect()
    const currentScreenX = newRect.left + anchor.imgX * zoom
    const currentScreenY = newRect.top + anchor.imgY * zoom

    container.scrollLeft += currentScreenX - anchor.clientX
    container.scrollTop += currentScreenY - anchor.clientY

    zoomAnchorRef.current = null
  }, [zoom])

  const scaledWidth = Math.round(width * zoom)
  const scaledHeight = Math.round(height * zoom)

  return (
    <div
      ref={scrollContainerRef}
      className="relative flex-1 h-full overflow-auto bg-[#0a0c10] select-none"
    >
      <div className="min-w-full min-h-full flex items-center justify-center p-12">
        {/* Sized Artboard Wrapper so scrollbars and cursor-anchored zoom work at any scale */}
        <div
          ref={artboardBoxRef}
          className="relative shrink-0"
          style={{
            width: scaledWidth,
            height: scaledHeight,
          }}
        >
          {/* Artboard Container with Zoom & Shadow */}
          <div
            className="origin-top-left"
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Canvas Frame */}
            <div
              className="relative shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] rounded-sm overflow-hidden border border-slate-700/50"
              style={{
                width,
                height,
                backgroundColor: backgroundColor || '#ffffff',
              }}
            >
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* Dimension & Zoom Badge */}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 whitespace-nowrap">
            {width} × {height} px • {Math.round(zoom * 100)}% (Ctrl + Scroll)
          </div>
        </div>
      </div>
    </div>
  )
}

