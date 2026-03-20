import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from './WorldBuilder'

const STORAGE_KEY  = 'park-world-gems'
const BEAM_RADIUS  = 3.2
const BEAM_HEIGHT  = 100
export const GEM_TOTAL = 5

// [x, z, label] — beam always rises from ground level, visible from anywhere
const GEM_SPOTS: [number, number, string][] = [
  [   2,    2, 'spire'],
  [   0,  -73, 'mountain'],
  [ 110,  -40, 'canopy'],
  [   0,  -88, 'summit'],
  [ -90,   10, 'scrapyard'],
]

export const GEM_COLORS = [
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
  groundY: number   // terrain at this spot — beam rises from here
}

export class GemManager {
  private gems: Gem[] = []
  private collected: Set<number>
  onCollect: ((idx: number) => void) | null = null

  constructor(scene: Scene) {
    const stored = localStorage.getItem(STORAGE_KEY)
    this.collected = new Set(stored ? JSON.parse(stored) : [])

    for (let i = 0; i < GEM_SPOTS.length; i++) {
      const [gx, gz] = GEM_SPOTS[i]
      const groundY = terrainY(gx, gz)   // always start beam at terrain
      const color = GEM_COLORS[i % GEM_COLORS.length]

      // Beam rises from ground — visible from across the whole map
      const beam = MeshBuilder.CreateCylinder(`gemBeam${i}`, {
        height: BEAM_HEIGHT, diameter: BEAM_RADIUS * 2, tessellation: 8,
      }, scene)
      beam.position.set(gx, groundY + BEAM_HEIGHT / 2, gz)
      beam.isPickable = false

      const beamMat = new StandardMaterial(`gemBeamMat${i}`, scene)
      beamMat.emissiveColor = color.clone()
      beamMat.disableLighting = true
      beamMat.alpha = 0.4
      beamMat.backFaceCulling = false
      beam.material = beamMat

      if (this.collected.has(i)) beam.isVisible = false

      this.gems.push({ beam, beamMat, collected: this.collected.has(i), phase: i * 1.3, idx: i, gx, gz, groundY })
    }
  }

  tick(dt: number, px: number, py: number, pz: number) {
    for (const g of this.gems) {
      if (g.collected) continue

      g.phase += dt * 1.4

      // Beam breathes
      const breathe = 1 + Math.sin(g.phase * 0.9) * 0.12
      g.beam.scaling.x = breathe
      g.beam.scaling.z = breathe

      // Pulse brightness
      const pulse = 0.65 + Math.sin(g.phase * 1.4) * 0.35
      const base = GEM_COLORS[g.idx % GEM_COLORS.length]
      g.beamMat.emissiveColor.set(base.r * pulse, base.g * pulse, base.b * pulse)

      // Cylindrical collect — fly through the beam at any height
      const dx = px - g.gx
      const dz = pz - g.gz
      const horizDist2 = dx * dx + dz * dz
      if (horizDist2 < BEAM_RADIUS * BEAM_RADIUS && py >= g.groundY - 5 && py <= g.groundY + BEAM_HEIGHT + 5) {
        this.collect(g)
      }
    }
  }

  private collect(g: Gem) {
    g.collected = true
    g.beamMat.emissiveColor = new Color3(1, 1, 1)
    setTimeout(() => { g.beam.isVisible = false }, 200)
    this.collected.add(g.idx)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collected]))
    this.onCollect?.(g.idx)
  }

  getCount() { return this.collected.size }
}
