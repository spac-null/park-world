import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from './WorldBuilder'

const STORAGE_KEY  = 'park-world-gems'
const BEAM_RADIUS  = 3.2   // fly within this horizontal distance of beam center = grab
const BEAM_HEIGHT  = 80
export const GEM_TOTAL = 5

// [x, z, height above terrain]
const GEM_SPOTS: [number, number, number][] = [
  [   2,    2, 62],   // spire top
  [   0,  -73, 18],   // mountain cave exit
  [ 110,  -40, 28],   // canopy pillar top
  [   0,  -88, 58],   // mountain summit
  [ -90,   10,  8],   // scrapyard
]

const GEM_COLORS = [
  new Color3(1.0, 0.9, 0.1),   // gold
  new Color3(0.2, 0.9, 1.0),   // cyan
  new Color3(0.8, 0.2, 1.0),   // purple
  new Color3(1.0, 0.3, 0.2),   // red
  new Color3(0.2, 1.0, 0.4),   // green
]

interface Gem {
  beam: ReturnType<typeof MeshBuilder.CreateCylinder>
  beamMat: StandardMaterial
  collected: boolean
  phase: number
  idx: number
  gx: number
  gz: number
  beamBottom: number   // terrain y at this spot — beam runs from here upward
}

export class GemManager {
  private gems: Gem[] = []
  private collected: Set<number>
  onCollect: ((idx: number) => void) | null = null

  constructor(scene: Scene) {
    const stored = localStorage.getItem(STORAGE_KEY)
    this.collected = new Set(stored ? JSON.parse(stored) : [])

    for (let i = 0; i < GEM_SPOTS.length; i++) {
      const [gx, gz, gh] = GEM_SPOTS[i]
      const beamBottom = terrainY(gx, gz) + gh
      const color = GEM_COLORS[i % GEM_COLORS.length]

      // Beam — the entire column is the collectible, fly through it at any height
      const beam = MeshBuilder.CreateCylinder(`gemBeam${i}`, {
        height: BEAM_HEIGHT, diameter: BEAM_RADIUS * 2, tessellation: 8,
      }, scene)
      beam.position.set(gx, beamBottom + BEAM_HEIGHT / 2, gz)
      beam.isPickable = false

      const beamMat = new StandardMaterial(`gemBeamMat${i}`, scene)
      beamMat.emissiveColor = color.clone()
      beamMat.disableLighting = true
      beamMat.alpha = 0.4
      beamMat.backFaceCulling = false
      beam.material = beamMat

      if (this.collected.has(i)) beam.isVisible = false

      this.gems.push({ beam, beamMat, collected: this.collected.has(i), phase: i * 1.3, idx: i, gx, gz, beamBottom })
    }
  }

  tick(dt: number, px: number, py: number, pz: number) {
    for (const g of this.gems) {
      if (g.collected) continue

      g.phase += dt * 1.4

      // Beam breathes — scale in XZ so it feels alive and reachable
      const breathe = 1 + Math.sin(g.phase * 0.9) * 0.12
      g.beam.scaling.x = breathe
      g.beam.scaling.z = breathe

      // Pulse brightness
      const pulse = 0.65 + Math.sin(g.phase * 1.4) * 0.35
      const base = GEM_COLORS[g.idx % GEM_COLORS.length]
      g.beamMat.emissiveColor.set(base.r * pulse, base.g * pulse, base.b * pulse)

      // Cylindrical collect — horizontal distance from beam center only
      // Any height inside the beam counts — just fly through it
      const dx = px - g.gx
      const dz = pz - g.gz
      const horizDist2 = dx * dx + dz * dz
      const beamTop = g.beamBottom + BEAM_HEIGHT + 5
      if (horizDist2 < BEAM_RADIUS * BEAM_RADIUS && py >= g.beamBottom - 5 && py <= beamTop) {
        this.collect(g)
      }
    }
  }

  private collect(g: Gem) {
    g.collected = true
    // Flash beam bright white before vanishing
    g.beamMat.emissiveColor = new Color3(1, 1, 1)
    setTimeout(() => { g.beam.isVisible = false }, 150)

    this.collected.add(g.idx)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collected]))
    this.bigFlash(g.idx)
    this.onCollect?.(g.idx)
  }

  getCount() { return this.collected.size }

  private bigFlash(idx: number) {
    const el = document.getElementById('flash')
    if (!el) return
    const hex = GEM_COLORS[idx % GEM_COLORS.length].toHexString()
    el.style.background = `#${hex}`
    el.style.opacity = '0.7'
    // Fade out slowly — 600ms so the child notices
    setTimeout(() => { el.style.opacity = '0.4' }, 100)
    setTimeout(() => { el.style.opacity = '0.1' }, 300)
    setTimeout(() => { el.style.opacity = '0'; el.style.background = '#fff' }, 600)
  }
}
