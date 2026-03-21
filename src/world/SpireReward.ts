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
  private _wasParty = false
  private _allGemsTimer = 0

  constructor(scene: Scene) {
    this.alreadyReached = !!localStorage.getItem(STORAGE_KEY)

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

    if (this.alreadyReached) this.mat.emissiveColor = new Color3(0.6, 0.5, 0.15)
  }

  // remoteAtSpire: number of remote players currently at spire top
  tick(dt: number, px: number, py: number, pz: number, remoteAtSpire = 0) {
    const localAtTop = py > TRIGGER_Y && (px * px + pz * pz) < TRIGGER_R2
    const party = localAtTop && remoteAtSpire > 0

    // Pulse — fast party mode when 2+ players at top together
    const pulseRate = party ? 10 : 2.2
    const pulseAmp  = party ? 0.15 : 0.08
    this.bobPhase += dt * pulseRate
    this.ring.scaling.setAll(1 + Math.sin(this.bobPhase) * pulseAmp)

    // Party moment — ring goes bright warm gold, screen flashes gold
    if (party && !this._wasParty) {
      this.mat.emissiveColor = new Color3(1.0, 0.92, 0.3)
      this.flash('rgba(255,230,80,0.45)')
    } else if (!party && this.triggered) {
      this.mat.emissiveColor = this.alreadyReached
        ? new Color3(0.6, 0.5, 0.15)
        : new Color3(1.0, 1.0, 0.6)
    }
    this._wasParty = party

    // All-gems rainbow ring
    if (this._allGemsTimer > 0) {
      this._allGemsTimer -= dt
      const h = Date.now() * 0.002
      this.mat.emissiveColor.set(
        0.5 + 0.5 * Math.sin(h),
        0.5 + 0.5 * Math.sin(h + Math.PI * 2/3),
        0.5 + 0.5 * Math.sin(h + Math.PI * 4/3),
      )
    }

    // First-arrival trigger — local player reaches top for first time this session
    if (!this.triggered && localAtTop) {
      this.triggered = true
      this.flash('rgba(255,255,255,0.9)')
      if (!this.alreadyReached) {
        localStorage.setItem(STORAGE_KEY, '1')
        this.alreadyReached = true
      }
      this.mat.emissiveColor = new Color3(1.0, 1.0, 0.6)
    }
  }

  triggerAllGems() {
    this._allGemsTimer = 10
  }

  private flash(color: string) {
    const el = document.getElementById('flash')
    if (!el) return
    el.style.background = color
    el.style.opacity = '1'
    setTimeout(() => { el.style.opacity = '0'; el.style.background = '#fff' }, 120)
  }
}
