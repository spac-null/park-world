import { Scene, MeshBuilder, StandardMaterial, DynamicTexture, Mesh } from '@babylonjs/core'

const LIFETIME      = 90
const FADE_START    = 80
const BURST_DUR     = 0.45
const FLOAT_HEIGHT  = 1.8
const FLOAT_DUR     = 1.4

const TEX_W = 512
const TEX_H = 200
const PLANE_W = 12
const PLANE_H = PLANE_W * TEX_H / TEX_W   // ≈4.7

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
    if (line && test.length > 18) { lines.push(line); line = w }
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
    const r = Math.min(255, (parseInt(color.slice(1, 3), 16) || 100) + 60)
    const g = Math.min(255, (parseInt(color.slice(3, 5), 16) || 160) + 60)
    const b = Math.min(255, (parseInt(color.slice(5, 7), 16) || 255) + 60)
    const col = `rgb(${r},${g},${b})`

    // Build tag on a real HTML canvas (avoid Babylon proxy clearRect alpha issues)
    const canvas = document.createElement('canvas')
    canvas.width  = TEX_W
    canvas.height = TEX_H
    const ctx = canvas.getContext('2d')!

    // Slight random tilt — hand-sprayed feel
    const tilt = (Math.random() - 0.5) * 0.22
    ctx.save()
    ctx.translate(TEX_W / 2, TEX_H / 2)
    ctx.rotate(tilt)
    ctx.translate(-TEX_W / 2, -TEX_H / 2)

    // Solid tag background in player color (graffiti tag shape)
    ctx.fillStyle = `rgb(${Math.floor(r*0.55)},${Math.floor(g*0.55)},${Math.floor(b*0.55)})`
    ctx.beginPath()
    const pad = 12
    ctx.roundRect(pad, pad, TEX_W - pad*2, TEX_H - pad*2, 10)
    ctx.fill()

    // Bright player-color stripe at top
    ctx.fillStyle = col
    ctx.fillRect(pad, pad, TEX_W - pad*2, 44)

    // Name — small, dark on bright stripe
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = `rgb(${Math.floor(r*0.2)},${Math.floor(g*0.2)},${Math.floor(b*0.2)})`
    ctx.fillText(name.slice(0, 26), TEX_W / 2, 36)

    // Message — big white text
    const lines = splitLines(text)
    const msgY  = lines.length === 1 ? 128 : 104
    ctx.font = 'bold 54px Impact, Arial Black, sans-serif'
    ctx.lineWidth = 7
    lines.forEach((ln, i) => {
      const y = msgY + i * 60
      ctx.strokeStyle = `rgb(${Math.floor(r*0.3)},${Math.floor(g*0.3)},${Math.floor(b*0.3)})`
      ctx.strokeText(ln, TEX_W / 2, y)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(ln, TEX_W / 2, y)
    })

    ctx.restore()

    // Upload to GPU via ImageData
    const tex = new DynamicTexture(`trTex${Date.now()}`, { width: TEX_W, height: TEX_H }, this.scene, false)
    const bCtx = tex.getContext() as unknown as CanvasRenderingContext2D
    bCtx.drawImage(canvas, 0, 0)
    tex.update()

    const plane = MeshBuilder.CreatePlane(`trace${Date.now()}`, {
      width: PLANE_W, height: PLANE_H,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene)
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    plane.position.set(x, y + 2, z)
    plane.scaling.setAll(0)

    const mat = new StandardMaterial(`trMat${Date.now()}`, this.scene)
    mat.emissiveTexture = tex    // full brightness regardless of scene lighting
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
