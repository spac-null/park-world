import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from './WorldBuilder'

const STORAGE_KEY = 'park-world-notes'
export const NOTE_TOTAL = 60

// [x, yOffset, z] — actual Y = terrainY(x,z) + yOffset
const NOTE_POSITIONS: [number, number, number][] = [
  // CENTER
  [0,15,10],[8,14,4],[10,14,-6],[4,14,-12],[-6,14,-10],
  [-12,14,-3],[-10,14,8],[-3,14,13],[6,12,0],[-4,12,5],
  // HOLLOWS
  [-25,18,-55],[-32,20,-62],[-40,22,-68],[-48,20,-75],[-35,16,-82],
  [-20,14,-78],[-15,18,-65],[-28,24,-58],[-42,26,-72],[-50,22,-80],
  // CANOPY
  [60,22,-28],[68,20,-20],[78,18,-15],[90,24,-10],[100,20,-18],
  [110,30,-38],[105,26,-50],[95,22,-55],[80,18,-48],[70,20,-38],
  // SCRAPYARD
  [-65,12,5],[-72,10,10],[-80,8,15],[-88,10,20],[-92,12,28],
  [-85,10,35],[-75,8,30],[-68,10,22],[-60,12,18],[-55,14,12],
  // MOUNTAIN
  [5,15,-65],[3,20,-70],[0,26,-75],[-3,32,-80],[0,38,-85],
  [4,42,-88],[-5,46,-84],[0,50,-78],[8,44,-72],[-8,40,-76],
  // SPIRE
  [2,10,2],[2,16,2],[2,22,2],[2,28,2],[2,34,2],
  [2,40,2],[2,46,2],[2,52,2],[-2,10,-2],[-2,16,-2],
]

interface Note {
  mesh: ReturnType<typeof MeshBuilder.CreateSphere>
  collected: boolean
  phase: number
  idx: number
  wx: number; wy: number; wz: number
}

export class NoteManager {
  private notes: Note[] = []
  private collected: Set<number>
  private _ctx: AudioContext | null = null
  onCollect: ((idx: number) => void) | null = null

  constructor(scene: Scene, glideMode = false) {
    if (glideMode) localStorage.removeItem(STORAGE_KEY)
    const stored = localStorage.getItem(STORAGE_KEY)
    this.collected = new Set(stored ? JSON.parse(stored) : [])

    for (let i = 0; i < NOTE_POSITIONS.length; i++) {
      const [x, yOff, z] = NOTE_POSITIONS[i]
      const wy = terrainY(x, z) + yOff

      const mesh = MeshBuilder.CreateSphere(`note${i}`, { diameter: 0.8, segments: 4 }, scene)
      mesh.position.set(x, wy, z)
      mesh.isPickable = false

      const mat = new StandardMaterial(`noteMat${i}`, scene)
      mat.emissiveColor = new Color3(1, 0.95, 0.5)
      mat.disableLighting = true
      mesh.material = mat

      if (this.collected.has(i)) mesh.isVisible = false

      this.notes.push({ mesh, collected: this.collected.has(i), phase: i * 0.4, idx: i, wx: x, wy, wz: z })
    }
  }

  tick(dt: number, px: number, py: number, pz: number) {
    for (const n of this.notes) {
      if (n.collected) continue
      n.phase += dt * 2.5
      n.mesh.rotation.y = n.phase
      n.mesh.position.y = n.wy + Math.sin(n.phase * 0.8) * 0.3

      const dx = px - n.wx, dz = pz - n.wz
      const dy = py - n.wy
      if (dx*dx + dz*dz < 2.5*2.5 && dy*dy < 4.0*4.0) this._collect(n)
    }
  }

  private _collect(n: Note) {
    n.collected = true
    n.mesh.isVisible = false
    this.collected.add(n.idx)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collected]))
    this._ting()
    this.onCollect?.(n.idx)
  }

  private _ting() {
    try {
      if (!this._ctx) this._ctx = new AudioContext()
      if (this._ctx.state === 'suspended') void this._ctx.resume()
      const ctx = this._ctx
      const osc = ctx.createOscillator(), gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'; osc.frequency.value = 2093  // C7
      const t = ctx.currentTime
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
      osc.start(t); osc.stop(t + 0.15)
    } catch (_) {}
  }

  getCount() { return this.collected.size }
}
