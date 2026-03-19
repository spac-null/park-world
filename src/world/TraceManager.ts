import { Scene, MeshBuilder, StandardMaterial, DynamicTexture, Mesh } from '@babylonjs/core'

const LIFETIME      = 90    // seconds alive
const FADE_START    = 80    // begin fade at 80s
const BURST_DUR     = 0.45  // pop-in animation duration
const FLOAT_HEIGHT  = 1.8   // units to drift upward after spawn
const FLOAT_DUR     = 1.4   // seconds to complete float

const TEX_W = 512
const TEX_H = 200
const PLANE_W = 10
const PLANE_H = PLANE_W * TEX_H / TEX_W   // ≈3.9

interface Trace {
  mesh: Mesh
  mat: StandardMaterial
  age: number
  burst: number     // counts down from BURST_DUR
  baseY: number
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, font: string, maxW: number): string[] {
  ctx.font = font
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = w }
    else line = test
  }
  if (line) lines.push(line)
  return lines.slice(0, 2)
}


export class TraceManager {
  private traces: Trace[] = []
  private scene: Scene

  constructor(scene: Scene) { this.scene = scene }

  drop(x: number, y: number, z: number, text: string, color: string, name: string) {
    const tex = new DynamicTexture(`trTex${Date.now()}`, { width: TEX_W, height: TEX_H }, this.scene, false)
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D

    // Background — player color, rounded rect
    const r = parseInt(color.slice(1, 3), 16) || 100
    const g = parseInt(color.slice(3, 5), 16) || 160
    const b = parseInt(color.slice(5, 7), 16) || 255

    // Solid background — no alpha transparency needed
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, TEX_W, TEX_H)

    // White border
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'
    ctx.lineWidth = 4
    ctx.strokeRect(3, 3, TEX_W - 6, TEX_H - 6)

    // Name — small, dimmed
    ctx.fillStyle = 'rgba(255,255,255,0.72)'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(name.slice(0, 24), TEX_W / 2, 40)

    // Separator
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.fillRect(24, 52, TEX_W - 48, 1)

    // Message — big, white
    const msgFont = 'bold 40px sans-serif'
    const lines = wrapText(ctx, text, msgFont, TEX_W - 44)
    ctx.fillStyle = '#ffffff'
    ctx.font = msgFont
    const startY = lines.length === 1 ? 130 : 108
    lines.forEach((ln, i) => ctx.fillText(ln, TEX_W / 2, startY + i * 52, TEX_W - 44))

    tex.update()

    const plane = MeshBuilder.CreatePlane(`trace${Date.now()}`, {
      width: PLANE_W, height: PLANE_H,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene)
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    plane.position.set(x, y + 2, z)
    plane.scaling.setAll(0)   // burst in from zero

    const mat = new StandardMaterial(`trMat${Date.now()}`, this.scene)
    mat.diffuseTexture = tex
    mat.disableLighting = true
    mat.backFaceCulling = false
    plane.material = mat

    this.traces.push({ mesh: plane, mat, age: 0, burst: BURST_DUR, baseY: y + 2 })
  }

  tick(dt: number) {
    for (let i = this.traces.length - 1; i >= 0; i--) {
      const t = this.traces[i]
      t.age += dt

      // Burst pop: 0 → 1.3 (fast) → 1.0 (settle)
      if (t.burst > 0) {
        t.burst = Math.max(0, t.burst - dt)
        const p = 1 - t.burst / BURST_DUR           // progress 0→1
        const scale = p < 0.55
          ? (p / 0.55) * 1.3                         // 0 → 1.3
          : 1.3 - ((p - 0.55) / 0.45) * 0.3         // 1.3 → 1.0
        t.mesh.scaling.setAll(scale)
      }

      // Float upward
      const rise = Math.min(t.age / FLOAT_DUR, 1) * FLOAT_HEIGHT
      t.mesh.position.y = t.baseY + rise

      // Fade out last 10s
      if (t.age > FADE_START) {
        t.mat.alpha = 1 - (t.age - FADE_START) / (LIFETIME - FADE_START)
      }

      // Dispose
      if (t.age >= LIFETIME) {
        t.mat.dispose()
        t.mesh.dispose()
        this.traces.splice(i, 1)
      }
    }
  }
}
