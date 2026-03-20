import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from './WorldBuilder'

const STORAGE_KEY   = 'park-world-gems'
const COLLECT_DIST2 = 8 * 8   // very generous — fly near the pillar and it pops
export const GEM_TOTAL = 5

// [x, z, height above terrain, label]
const GEM_SPOTS: [number, number, number, string][] = [
  [   2,    2, 62, 'spire'],        // spire top — above reward ring
  [   0,  -73, 18, 'mountain'],     // cave exit (north face, behind waterfall)
  [ 110,  -40, 28, 'canopy'],       // highest canopy pillar top
  [   0,  -88, 58, 'summit'],       // mountain peak
  [ -90,   10,  8, 'scrapyard'],    // inside scrapyard, low and hidden
]

const GEM_COLORS = [
  new Color3(1.0, 0.9, 0.1),   // gold
  new Color3(0.2, 0.9, 1.0),   // cyan
  new Color3(0.8, 0.2, 1.0),   // purple
  new Color3(1.0, 0.3, 0.2),   // red
  new Color3(0.2, 1.0, 0.4),   // green
]

interface Gem {
  mesh: ReturnType<typeof MeshBuilder.CreateSphere>
  beam: ReturnType<typeof MeshBuilder.CreateCylinder>
  mat: StandardMaterial
  collected: boolean
  phase: number
  idx: number
}

export class GemManager {
  private gems: Gem[] = []
  private collected: Set<number>
  onCollect: ((idx: number) => void) | null = null

  constructor(scene: Scene) {
    const stored = localStorage.getItem(STORAGE_KEY)
    this.collected = new Set(stored ? JSON.parse(stored) : [])

    for (let i = 0; i < GEM_SPOTS.length; i++) {
      const [gx, gz, gh, _label] = GEM_SPOTS[i]
      const gy = terrainY(gx, gz) + gh
      const color = GEM_COLORS[i % GEM_COLORS.length]

      // Gem — bigger so it's visible from a distance
      const mesh = MeshBuilder.CreateSphere(`gem${i}`, { diameter: 1.8, segments: 6 }, scene)
      mesh.position.set(gx, gy, gz)
      mesh.isPickable = false

      const mat = new StandardMaterial(`gemMat${i}`, scene)
      mat.emissiveColor = color.clone()
      mat.disableLighting = true
      mesh.material = mat

      // Beacon pillar — wide glowing column, fly into it to collect
      const beam = MeshBuilder.CreateCylinder(`gemBeam${i}`, {
        height: 80, diameter: 5, tessellation: 8,
      }, scene)
      beam.position.set(gx, gy + 40, gz)
      beam.isPickable = false

      const beamMat = new StandardMaterial(`gemBeamMat${i}`, scene)
      beamMat.emissiveColor = color.clone()
      beamMat.disableLighting = true
      beamMat.alpha = 0.35
      beamMat.backFaceCulling = false
      beam.material = beamMat

      const collected = this.collected.has(i)
      if (collected) { mesh.isVisible = false; beam.isVisible = false }

      this.gems.push({ mesh, beam, mat, collected, phase: i * 1.3, idx: i })
    }
  }

  tick(dt: number, px: number, py: number, pz: number) {
    for (const g of this.gems) {
      if (g.collected) continue

      // Rotate + float
      g.phase += dt * 1.8
      g.mesh.rotation.y = g.phase
      g.mesh.position.y += Math.sin(g.phase * 0.7) * 0.008

      // Pulse emissive on gem + scale pulse on beam
      const pulse = 0.7 + Math.sin(g.phase * 1.4) * 0.3
      const base = GEM_COLORS[g.idx % GEM_COLORS.length]
      g.mat.emissiveColor.set(base.r * pulse, base.g * pulse, base.b * pulse)
      const beamPulse = 1 + Math.sin(g.phase * 0.8) * 0.15
      g.beam.scaling.x = beamPulse
      g.beam.scaling.z = beamPulse

      // Collect
      const dx = px - g.mesh.position.x
      const dy = py - g.mesh.position.y
      const dz = pz - g.mesh.position.z
      if (dx * dx + dy * dy + dz * dz < COLLECT_DIST2) {
        g.collected = true
        g.mesh.isVisible = false
        g.beam.isVisible = false
        this.collected.add(g.idx)
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.collected]))
        this.flash(g.idx)
        this.onCollect?.(g.idx)
      }
    }
  }

  getCount() { return this.collected.size }

  private flash(idx: number) {
    const el = document.getElementById('flash')
    if (!el) return
    el.style.background = `#${GEM_COLORS[idx % GEM_COLORS.length].toHexString()}`
    el.style.opacity = '0.6'
    setTimeout(() => {
      el.style.opacity = '0'
      el.style.background = '#fff'
    }, 60)
  }
}
