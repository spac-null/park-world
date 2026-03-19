import { Scene, MeshBuilder, StandardMaterial, DynamicTexture, Mesh } from '@babylonjs/core'

const LIFETIME      = 90
const FADE_START    = 80
const BURST_DUR     = 0.45
const FLOAT_HEIGHT  = 1.8
const FLOAT_DUR     = 1.4

const TEX_W = 512
const TEX_H = 200
const PLANE_W = 10
const PLANE_H = PLANE_W * TEX_H / TEX_W   // ≈3.9

interface Trace {
  mesh: Mesh
  mat: StandardMaterial
  age: number
  burst: number
  baseY: number
}

// Char-count word wrap — no measureText needed
function splitLines(text: string): string[] {
  const words = text.trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (line && test.length > 20) { lines.push(line); line = w }
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

    const r = parseInt(color.slice(1, 3), 16) || 100
    const g = parseInt(color.slice(3, 5), 16) || 160
    const b = parseInt(color.slice(5, 7), 16) || 255
    const bg = `rgb(${r},${g},${b})`

    // Use tex.drawText() — goes through real canvas, not the ICanvasRenderingContext proxy
    // First call: fill background (clearColor) + draw name
    tex.drawText(name.slice(0, 24), null, 42, 'bold 22px sans-serif', 'rgba(255,255,255,0.8)', bg, false, false)

    // Message lines — clearColor='' is falsy → preserves background
    const lines = splitLines(text)
    const msgY = lines.length === 1 ? 130 : 104
    tex.drawText(lines[0], null, msgY, 'bold 40px sans-serif', '#ffffff', '', false, false)
    if (lines[1]) tex.drawText(lines[1], null, msgY + 52, 'bold 40px sans-serif', '#ffffff', '', false, false)

    tex.update(false)

    const plane = MeshBuilder.CreatePlane(`trace${Date.now()}`, {
      width: PLANE_W, height: PLANE_H,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene)
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    plane.position.set(x, y + 2, z)
    plane.scaling.setAll(0)

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
        const p = 1 - t.burst / BURST_DUR
        const scale = p < 0.55
          ? (p / 0.55) * 1.3
          : 1.3 - ((p - 0.55) / 0.45) * 0.3
        t.mesh.scaling.setAll(scale)
      }

      // Float upward
      t.mesh.position.y = t.baseY + Math.min(t.age / FLOAT_DUR, 1) * FLOAT_HEIGHT

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
