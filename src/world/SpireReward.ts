import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { WORLD } from '../config'

const STORAGE_KEY  = 'park-world-spire-reached'
const TRIGGER_Y    = WORLD.SPIRE_HEIGHT - 6   // y > 54
const TRIGGER_R2   = 15 * 15                   // x²+z² < 225

export class SpireReward {
  private ring: ReturnType<typeof MeshBuilder.CreateTorus>
  private mat: StandardMaterial
  private bobPhase = 0
  private triggered = false
  private alreadyReached: boolean

  constructor(scene: Scene) {
    this.alreadyReached = !!localStorage.getItem(STORAGE_KEY)

    // Pulsing ring at spire top — always visible as a goal marker
    this.ring = MeshBuilder.CreateTorus('spireRewardRing', {
      diameter: 10,
      thickness: 0.4,
      tessellation: 32,
    }, scene)
    this.ring.position.set(WORLD.SPIRE_X, WORLD.SPIRE_HEIGHT + 1, WORLD.SPIRE_Z)
    this.ring.rotation.x = Math.PI / 2

    this.mat = new StandardMaterial('spireRewardMat', scene)
    this.mat.emissiveColor = new Color3(1.0, 0.85, 0.2)
    this.mat.disableLighting = true
    this.ring.material = this.mat

    // If already reached in a previous session, ring glows dimmer
    if (this.alreadyReached) this.mat.emissiveColor = new Color3(0.6, 0.5, 0.15)
  }

  tick(dt: number, px: number, py: number, pz: number) {
    // Pulse scale
    this.bobPhase += dt * 2.2
    const pulse = 1 + Math.sin(this.bobPhase) * 0.08
    this.ring.scaling.setAll(pulse)

    // Trigger check — player at spire top for the first time this session
    if (!this.triggered) {
      const atTop = py > TRIGGER_Y && (px * px + pz * pz) < TRIGGER_R2
      if (atTop) {
        this.triggered = true
        this.flash()
        if (!this.alreadyReached) {
          localStorage.setItem(STORAGE_KEY, '1')
          this.alreadyReached = true
        }
        // Ring goes gold-white on first arrival
        this.mat.emissiveColor = new Color3(1.0, 1.0, 0.6)
      }
    }
  }

  private flash() {
    const el = document.getElementById('flash')
    if (!el) return
    el.style.opacity = '1'
    setTimeout(() => { el.style.opacity = '0' }, 80)
  }
}
