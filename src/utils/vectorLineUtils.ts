import * as fabric from 'fabric'
import type { VectorLineNode, VectorLineSettings } from '../types'

// Ensure custom properties are always serialized by Fabric.js toJSON / toObject
if (Array.isArray((fabric.FabricObject as any).customProperties)) {
  const existing = new Set((fabric.FabricObject as any).customProperties)
  ;[
    'customVectorLine',
    'customFilterMeta',
    'customTextEffect',
    'isSketchGuide',
    'aiRole',
    'name',
    'id',
  ].forEach((prop) => existing.add(prop))
  ;(fabric.FabricObject as any).customProperties = Array.from(existing)
} else {
  ;(fabric.FabricObject as any).customProperties = [
    'customVectorLine',
    'customFilterMeta',
    'customTextEffect',
    'isSketchGuide',
    'aiRole',
    'name',
    'id',
  ]
}

export interface ComputedVectorGeometry {
  curveSvgPath: string
  fullSvgPathWithBounds: string
  midpoints: VectorLineNode[]
  startTangentAngle: number
  endTangentAngle: number
}

/**
 * Computes the SVG curve path, segment midpoints (for '+' handles),
 * and start/end tangent angles (for arrowheads) from VectorLineSettings.
 */
export function computeVectorGeometry(settings: VectorLineSettings): ComputedVectorGeometry {
  const nodes = settings.nodes
  if (!nodes || nodes.length < 2) {
    return {
      curveSvgPath: 'M 0 0 L 100 0',
      fullSvgPathWithBounds: 'M 0 0 L 100 0',
      midpoints: [{ x: 50, y: 0 }],
      startTangentAngle: Math.PI,
      endTangentAngle: 0,
    }
  }

  const n = nodes.length
  const midpoints: VectorLineNode[] = []
  let curveSvgPath = `M ${nodes[0].x.toFixed(2)} ${nodes[0].y.toFixed(2)}`
  let startTangentAngle = 0
  let endTangentAngle = 0

  // Collect extra points to ensure bounding box includes curve extrema and arrowheads
  const boundPoints: VectorLineNode[] = [...nodes]

  if (n === 2) {
    const p0 = nodes[0]
    const p1 = nodes[1]
    const dx = p1.x - p0.x
    const dy = p1.y - p0.y
    const len = Math.max(1, Math.hypot(dx, dy))

    if (Math.abs(settings.curvature) < 1) {
      // Straight 2-point line
      curveSvgPath += ` L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
      midpoints.push({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 })
      endTangentAngle = Math.atan2(dy, dx)
      startTangentAngle = Math.atan2(-dy, -dx)
    } else {
      // Curved 2-point arch controlled by settings.curvature (-100 to +100)
      const nx = -dy / len
      const ny = dx / len
      const archOffset = len * (settings.curvature / 100) * 0.65
      const cx = (p0.x + p1.x) / 2 + nx * archOffset
      const cy = (p0.y + p1.y) / 2 + ny * archOffset

      curveSvgPath += ` Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`

      // Midpoint at t = 0.5 on Quadratic Bézier
      const mx = 0.25 * p0.x + 0.5 * cx + 0.25 * p1.x
      const my = 0.25 * p0.y + 0.5 * cy + 0.25 * p1.y
      midpoints.push({ x: mx, y: my })
      boundPoints.push({ x: mx, y: my }, { x: cx, y: cy })

      endTangentAngle = Math.atan2(p1.y - cy, p1.x - cx)
      startTangentAngle = Math.atan2(p0.y - cy, p0.x - cx)
    }
  } else {
    // 3 or more vector nodes: Catmull-Rom to Cubic Bézier spline with configurable curvature tension
    const absCurv = Math.max(0, Math.abs(settings.curvature))
    if (absCurv < 2) {
      // Straight polyline through all vector nodes
      for (let i = 0; i < n - 1; i++) {
        const a = nodes[i]
        const b = nodes[i + 1]
        curveSvgPath += ` L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
        midpoints.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      }
      endTangentAngle = Math.atan2(nodes[n - 1].y - nodes[n - 2].y, nodes[n - 1].x - nodes[n - 2].x)
      startTangentAngle = Math.atan2(nodes[0].y - nodes[1].y, nodes[0].x - nodes[1].x)
    } else {
      // Tension factor: 100% = smooth standard spline, >100% = extra accentuated curves
      const k = (absCurv / 100) / 4.2
      for (let i = 0; i < n - 1; i++) {
        const pPrev = nodes[Math.max(0, i - 1)]
        const pCurr = nodes[i]
        const pNext = nodes[i + 1]
        const pAfter = nodes[Math.min(n - 1, i + 2)]

        const cp1x = pCurr.x + (pNext.x - pPrev.x) * k
        const cp1y = pCurr.y + (pNext.y - pPrev.y) * k
        const cp2x = pNext.x - (pAfter.x - pCurr.x) * k
        const cp2y = pNext.y - (pAfter.y - pCurr.y) * k

        curveSvgPath += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${pNext.x.toFixed(2)} ${pNext.y.toFixed(2)}`

        // Point at t = 0.5 on Cubic Bézier
        const mx = 0.125 * pCurr.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * pNext.x
        const my = 0.125 * pCurr.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * pNext.y
        midpoints.push({ x: mx, y: my })
        boundPoints.push({ x: mx, y: my }, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y })

        if (i === 0) {
          startTangentAngle = Math.atan2(pCurr.y - cp1y, pCurr.x - cp1x)
        }
        if (i === n - 2) {
          endTangentAngle = Math.atan2(pNext.y - cp2y, pNext.x - cp2x)
        }
      }
    }
  }

  // Expand bounding box with invisible MoveTo commands so arrowheads and thick strokes are never clipped
  const pad = Math.max(24, (settings.arrowSize || 22) + (settings.strokeWidth || 6) * 2)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of boundPoints) {
    minX = Math.min(minX, pt.x - pad)
    minY = Math.min(minY, pt.y - pad)
    maxX = Math.max(maxX, pt.x + pad)
    maxY = Math.max(maxY, pt.y + pad)
  }

  const fullSvgPathWithBounds = `${curveSvgPath} M ${minX.toFixed(1)} ${minY.toFixed(1)} M ${maxX.toFixed(1)} ${maxY.toFixed(1)}`

  return {
    curveSvgPath,
    fullSvgPathWithBounds,
    midpoints,
    startTangentAngle,
    endTangentAngle,
  }
}

/**
 * If the user moved, scaled, or rotated the entire vector Path using standard bounding box handles,
 * bake that transformation matrix into `settings.nodes` so nodes remain 1:1 with canvas coordinates.
 */
export function bakeTransformIntoVectorNodes(pathObj: fabric.Path): void {
  const settings: VectorLineSettings | undefined = (pathObj as any).customVectorLine
  if (!settings || !settings.nodes) return

  const sx = pathObj.scaleX ?? 1
  const sy = pathObj.scaleY ?? 1
  const angle = pathObj.angle ?? 0
  const ox = pathObj.pathOffset?.x ?? 0
  const oy = pathObj.pathOffset?.y ?? 0
  const left = pathObj.left ?? ox
  const top = pathObj.top ?? oy

  const wasTransformed =
    Math.abs(sx - 1) > 0.001 ||
    Math.abs(sy - 1) > 0.001 ||
    Math.abs(angle) > 0.01 ||
    Math.abs(left - ox) > 0.5 ||
    Math.abs(top - oy) > 0.5

  if (!wasTransformed) return

  const matrix = pathObj.calcTransformMatrix()
  settings.nodes = settings.nodes.map((pt) => {
    const localPt = new fabric.Point(pt.x - ox, pt.y - oy)
    const worldPt = fabric.util.transformPoint(localPt, matrix)
    return { x: worldPt.x, y: worldPt.y }
  })

  if (Math.abs(sx - 1) > 0.01 || Math.abs(sy - 1) > 0.01) {
    const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2
    settings.strokeWidth = Math.max(1, Math.round(settings.strokeWidth * avgScale))
    settings.arrowSize = Math.max(8, Math.round(settings.arrowSize * avgScale))
  }

  rebuildVectorPathGeometry(pathObj, settings)
}

/**
 * Rebuilds the Path's internal geometry and controls from `settings`.
 */
export function rebuildVectorPathGeometry(
  pathObj: fabric.Path,
  settings: VectorLineSettings
): void {
  ;(pathObj as any).customVectorLine = settings
  const geom = computeVectorGeometry(settings)

  pathObj._setPath(geom.fullSvgPathWithBounds, false)
  pathObj.set({
    left: pathObj.pathOffset.x,
    top: pathObj.pathOffset.y,
    originX: 'center',
    originY: 'center',
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    fill: 'transparent',
    stroke: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
    strokeLineCap: settings.lineCap || 'round',
    strokeLineJoin: 'round',
    strokeDashArray: settings.isDashed
      ? [Math.max(2, settings.dashLength), Math.max(2, settings.dashGap)]
      : undefined,
    objectCaching: false,
    dirty: true,
  })

  attachVectorLineRendererAndControls(pathObj)
  pathObj.setCoords()
}

/**
 * Attaches custom Canvas2D renderer (for solid arrowheads + crisp dashes)
 * and interactive draggable vector controls (`node_i` and `mid_i`) to a `fabric.Path`.
 */
export function attachVectorLineRendererAndControls(pathObj: fabric.Path): void {
  const settings: VectorLineSettings | undefined = (pathObj as any).customVectorLine
  if (!settings || !settings.nodes) return

  // 1. Custom _render so dashed lines are genuinely dashed and arrowheads remain solid & sharp
  ;(pathObj as any)._render = function (ctx: CanvasRenderingContext2D) {
    const s: VectorLineSettings | undefined = (this as any).customVectorLine
    if (!s || !s.nodes || s.nodes.length < 2) {
      return fabric.Path.prototype._render.call(this, ctx)
    }

    const geom = computeVectorGeometry(s)
    const ox = this.pathOffset?.x || 0
    const oy = this.pathOffset?.y || 0
    const color = (this.stroke as string) || s.strokeColor || '#1e293b'
    const lw = this.strokeWidth || s.strokeWidth || 6

    ctx.save()
    ctx.translate(-ox, -oy)

    // Draw main curve (solid or dashed)
    const path2d = new Path2D(geom.curveSvgPath)
    ctx.strokeStyle = color
    ctx.lineWidth = lw
    ctx.lineCap = s.lineCap || 'round'
    ctx.lineJoin = 'round'

    if (s.isDashed) {
      const dLen = Math.max(2, Number(s.dashLength) || 16)
      const dGap = Math.max(2, Number(s.dashGap) || 12)
      ctx.setLineDash([dLen, dGap])
    } else {
      ctx.setLineDash([])
    }
    ctx.stroke(path2d)

    // Draw solid arrowheads (never dashed)
    ctx.setLineDash([])
    ctx.fillStyle = color
    const headLen = Math.max(12, (Number(s.arrowSize) || 22) + lw * 1.15)
    const headAngle = Math.PI / 6.2

    const drawArrowHead = (node: VectorLineNode, angle: number) => {
      const tipX = node.x + Math.cos(angle) * (lw * 0.4)
      const tipY = node.y + Math.sin(angle) * (lw * 0.4)
      const x1 = tipX - headLen * Math.cos(angle - headAngle)
      const y1 = tipY - headLen * Math.sin(angle - headAngle)
      const x2 = tipX - headLen * Math.cos(angle + headAngle)
      const y2 = tipY - headLen * Math.sin(angle + headAngle)
      const backX = tipX - headLen * 0.74 * Math.cos(angle)
      const backY = tipY - headLen * 0.74 * Math.sin(angle)

      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(x1, y1)
      ctx.lineTo(backX, backY)
      ctx.lineTo(x2, y2)
      ctx.closePath()
      ctx.fill()
      ctx.lineWidth = Math.max(1.5, lw * 0.3)
      ctx.stroke()
    }

    if (s.hasArrowEnd) {
      drawArrowHead(s.nodes[s.nodes.length - 1], geom.endTangentAngle)
    }
    if (s.hasArrowStart) {
      drawArrowHead(s.nodes[0], geom.startTangentAngle)
    }

    ctx.restore()
  }

  // 2. Build interactive vector node controls (`node_0`, `node_1`, ...) and midpoint '+' controls (`mid_0`, ...)
  const controls: Record<string, fabric.Control> = {}

  // Keep rotation control at top if user wants to rotate whole vector, but hide corner box clutter
  pathObj.set({
    hasBorders: false,
    transparentCorners: false,
    objectCaching: false,
  })

  settings.nodes.forEach((_, idx) => {
    const isEndpoint = idx === 0 || idx === settings.nodes.length - 1

    controls[`node_${idx}`] = new fabric.Control({
      x: 0,
      y: 0,
      cursorStyle: 'move',
      actionName: `vector_node_${idx}`,
      positionHandler: (_dim, finalMatrix, fabricObject) => {
        const pObj = fabricObject as fabric.Path
        const s: VectorLineSettings = (pObj as any).customVectorLine
        const pt = s?.nodes?.[idx] || { x: 0, y: 0 }
        const localPt = new fabric.Point(
          pt.x - (pObj.pathOffset?.x || 0),
          pt.y - (pObj.pathOffset?.y || 0)
        )
        return fabric.util.transformPoint(localPt, finalMatrix)
      },
      actionHandler: (_eventData, transform, x, y) => {
        const pObj = transform.target as fabric.Path
        bakeTransformIntoVectorNodes(pObj)
        const s: VectorLineSettings = (pObj as any).customVectorLine
        if (!s || !s.nodes[idx]) return false

        s.nodes[idx] = { x, y }
        rebuildVectorPathGeometry(pObj, s)
        pObj.canvas?.requestRenderAll()
        return true
      },
      render: (ctx, left, top) => {
        ctx.save()
        ctx.translate(left, top)

        // Outer glow
        ctx.beginPath()
        ctx.arc(0, 0, isEndpoint ? 8 : 7, 0, Math.PI * 2)
        ctx.fillStyle = isEndpoint ? '#a855f7' : '#10b981'
        ctx.fill()
        ctx.lineWidth = 2.2
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()

        // Inner dot
        ctx.beginPath()
        ctx.arc(0, 0, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()

        ctx.restore()
      },
    })
  })

  // Midpoint '+' controls between each segment: dragging a '+' midpoint inserts a new vector point and curves it!
  const segmentCount = settings.nodes.length - 1
  for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
    controls[`mid_${segIdx}`] = new fabric.Control({
      x: 0,
      y: 0,
      cursorStyle: 'pointer',
      actionName: `vector_add_mid_${segIdx}`,
      positionHandler: (_dim, finalMatrix, fabricObject) => {
        const pObj = fabricObject as fabric.Path
        const s: VectorLineSettings = (pObj as any).customVectorLine
        const geom = computeVectorGeometry(s)
        const midPt = geom.midpoints[segIdx] || { x: 0, y: 0 }
        const localPt = new fabric.Point(
          midPt.x - (pObj.pathOffset?.x || 0),
          midPt.y - (pObj.pathOffset?.y || 0)
        )
        return fabric.util.transformPoint(localPt, finalMatrix)
      },
      actionHandler: (_eventData, transform, x, y) => {
        const pObj = transform.target as fabric.Path
        bakeTransformIntoVectorNodes(pObj)
        const s: VectorLineSettings = (pObj as any).customVectorLine
        if (!s) return false

        // Insert new vector node at index segIdx + 1 and switch current active control to it
        const newIdx = segIdx + 1
        s.nodes.splice(newIdx, 0, { x, y })
        if (s.curvature === 0) {
          s.curvature = 100
        }
        rebuildVectorPathGeometry(pObj, s)
        // Seamlessly switch the active dragged control to the newly created `node_${newIdx}`
        transform.corner = `node_${newIdx}`
        if (pObj.controls[`node_${newIdx}`]) {
          transform.actionHandler = pObj.controls[`node_${newIdx}`].actionHandler
        }
        pObj.canvas?.requestRenderAll()
        return true
      },
      render: (ctx, left, top) => {
        ctx.save()
        ctx.translate(left, top)

        ctx.beginPath()
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2)
        ctx.fillStyle = '#0f172a'
        ctx.fill()
        ctx.lineWidth = 1.8
        ctx.strokeStyle = '#38bdf8'
        ctx.stroke()

        // Draw '+' icon inside the midpoint handle
        ctx.strokeStyle = '#38bdf8'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(-3, 0)
        ctx.lineTo(3, 0)
        ctx.moveTo(0, -3)
        ctx.lineTo(0, 3)
        ctx.stroke()

        ctx.restore()
      },
    })
  }

  pathObj.controls = controls

  if (!(pathObj as any).__vectorModifiedHooked) {
    ;(pathObj as any).__vectorModifiedHooked = true
    pathObj.on('modified', () => {
      bakeTransformIntoVectorNodes(pathObj)
      pathObj.canvas?.requestRenderAll()
    })
  }
}

/**
 * Creates a custom interactive Vector Line or Arrow (`fabric.Path`) with explicit nodes and settings.
 */
export function createCustomVectorLine(
  config: Partial<VectorLineSettings> & { nodes: VectorLineNode[] },
  name = 'Seta Vetorial'
): fabric.Path {
  const settings: VectorLineSettings = {
    isVectorLine: true,
    nodes: config.nodes.map((pt) => ({ x: pt.x, y: pt.y })),
    curvature: config.curvature ?? 0,
    strokeWidth: config.strokeWidth ?? 6,
    strokeColor: config.strokeColor ?? '#6366f1',
    isDashed: config.isDashed ?? false,
    dashLength: config.dashLength ?? 16,
    dashGap: config.dashGap ?? 12,
    hasArrowEnd: config.hasArrowEnd ?? true,
    hasArrowStart: config.hasArrowStart ?? false,
    arrowSize: config.arrowSize ?? 20,
    lineCap: config.lineCap ?? 'round',
  }

  const geom = computeVectorGeometry(settings)
  const pathObj = new fabric.Path(geom.fullSvgPathWithBounds, {
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: settings.strokeColor,
    strokeWidth: settings.strokeWidth,
    strokeLineCap: settings.lineCap,
    strokeLineJoin: 'round',
    objectCaching: false,
  })

  ;(pathObj as any).name = name
  rebuildVectorPathGeometry(pathObj, settings)
  return pathObj
}

/**
 * Creates a brand-new interactive Vector Line or Arrow (`fabric.Path`).
 */
export function createVectorLineObject(
  kind: 'line' | 'dashed-line' | 'arrow' | 'curved-arrow' | 'dashed-arrow',
  cx: number,
  cy: number,
  color = '#6366f1'
): fabric.Path {
  const halfLen = 190
  const isCurved = kind === 'curved-arrow'
  const isDashed = kind === 'dashed-line' || kind === 'dashed-arrow'
  const isArrow = kind === 'arrow' || kind === 'curved-arrow' || kind === 'dashed-arrow'

  const nodes: VectorLineNode[] = isCurved
    ? [
        { x: cx - halfLen, y: cy + 35 },
        { x: cx, y: cy - 55 },
        { x: cx + halfLen, y: cy + 15 },
      ]
    : [
        { x: cx - halfLen, y: cy },
        { x: cx + halfLen, y: cy },
      ]

  return createCustomVectorLine(
    {
      nodes,
      curvature: isCurved ? 100 : 0,
      strokeWidth: isArrow ? 7 : 6,
      strokeColor: color,
      isDashed,
      dashLength: 18,
      dashGap: 12,
      hasArrowEnd: isArrow,
      hasArrowStart: false,
      arrowSize: 22,
      lineCap: 'round',
    },
    isArrow ? (isDashed ? 'Seta Tracejada' : 'Seta Vetorial') : isDashed ? 'Linha Tracejada' : 'Linha Vetorial'
  )
}

/**
 * Re-attaches vector controls and custom renderer to any vector lines after `canvas.loadFromJSON`.
 */
export function hydrateCanvasVectorLines(canvas: fabric.Canvas): void {
  canvas.getObjects().forEach((obj) => {
    const s = (obj as any).customVectorLine as VectorLineSettings | undefined
    if (s && s.isVectorLine && obj instanceof fabric.Path) {
      rebuildVectorPathGeometry(obj, s)
    }
  })
}

