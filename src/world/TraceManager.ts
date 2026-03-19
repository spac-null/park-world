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
    // Draw on a real HTML canvas — bypasses ICanvasRenderingContext proxy entirely
    const canvas = document.createElement('canvas')
    canvas.width  = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')!

    const r = parseInt(color.slice(1, 3), 16) || 100
    const g = parseInt(color.slice(3, 5), 16) || 160
    const b = parseInt(color.slice(5, 7), 16) || 255

    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, TEX_W, TEX_H)

    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 4
    ctx.strokeRect(3, 3, TEX_W - 6, TEX_H - 6)

    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(name.slice(0, 24), TEX_W / 2, 40)

    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(24, 52, TEX_W - 48, 1)

    const lines = splitLines(text)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 40px sans-serif'
    const msgY = lines.length === 1 ? 130 : 104
    lines.forEach((ln, i) => ctx.fillText(ln, TEX_W / 2, msgY + i * 52))

    // Pass drawn canvas to DynamicTexture — uploads existing pixel data
    const tex = new DynamicTexture(`trTex${Date.now()}`, canvas, this.scene, false)
    tex.update()

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

      if (t.burst > 0) {
        t.burst = Math.max(0, t.burst - dt)
        const p = 1 - t.burst / BURST_DUR
        const scale = p < 0.55
          ? (p / 0.55) * 1.3
          : 1.3 - ((p - 0.55) / 0.45) * 0.3
        t.mesh.scaling.setAll(scale)
      }

      t.mesh.position.y = t.baseY + Math.min(t.age / FLOAT_DUR, 1) * FLOAT_HEIGHT

      if (t.age > FADE_START) {
        t.mat.alpha = 1 - (t.age - FADE_START) / (LIFETIME - FADE_START)
      }

      if (t.age >= LIFETIME) {
        t.mat.dispose()
        t.mesh.dispose()
        this.traces.splice(i, 1)
      }
    }
  }
}
