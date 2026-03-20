import { Scene, DirectionalLight, HemisphericLight, Color3, Color4, Vector3, StandardMaterial } from '@babylonjs/core'
import { DAY_NIGHT, WORLD } from '../config'

interface Keyframe {
  t: number
  sky: [number, number, number]
  fog: [number, number, number]
  sun: [number, number, number]
  amb: [number, number, number]
  sunIntensity: number
  ambIntensity: number
  fogDensity: number
}

const KF: Keyframe[] = [
  { t: 0.00, sky:[0.10,0.08,0.18], fog:[0.10,0.08,0.18], sun:[0.60,0.55,0.80], amb:[0.15,0.12,0.25], sunIntensity:0.3, ambIntensity:0.4, fogDensity:WORLD.FOG_DENSITY_NIGHT },
  { t: 0.20, sky:[0.72,0.40,0.20], fog:[0.72,0.40,0.20], sun:[1.00,0.75,0.45], amb:[0.60,0.40,0.25], sunIntensity:0.7, ambIntensity:0.6, fogDensity:0.008 },
  { t: 0.35, sky:[0.27,0.53,0.87], fog:[0.27,0.53,0.87], sun:[1.00,0.98,0.90], amb:[0.55,0.60,0.65], sunIntensity:1.2, ambIntensity:0.7, fogDensity:WORLD.FOG_DENSITY_DAY },
  { t: 0.65, sky:[0.27,0.53,0.87], fog:[0.27,0.53,0.87], sun:[1.00,0.98,0.90], amb:[0.55,0.60,0.65], sunIntensity:1.2, ambIntensity:0.7, fogDensity:WORLD.FOG_DENSITY_DAY },
  { t: 0.80, sky:[0.60,0.28,0.12], fog:[0.60,0.28,0.12], sun:[1.00,0.60,0.30], amb:[0.50,0.30,0.18], sunIntensity:0.6, ambIntensity:0.5, fogDensity:0.009 },
  { t: 1.00, sky:[0.10,0.08,0.18], fog:[0.10,0.08,0.18], sun:[0.60,0.55,0.80], amb:[0.15,0.12,0.25], sunIntensity:0.3, ambIntensity:0.4, fogDensity:WORLD.FOG_DENSITY_NIGHT },
]

export class DayNightCycle {
  private t = 0.35
  private scene: Scene
  private sun: DirectionalLight
  private amb: HemisphericLight

  // Pre-allocated — no per-frame GC
  private _sky       = new Color4(0, 0, 0, 1)
  private _fog       = new Color3(0, 0, 0)
  private _sunCol    = new Color3(0, 0, 0)
  private _ambCol    = new Color3(0, 0, 0)
  private _skyTint   = new Color3(0, 0, 0)  // drives sky sphere emissiveColor
  private _dir       = new Vector3(0, -1, 0)

  // Lazy-resolved material refs — null until first apply()
  private _skyMat:  StandardMaterial | null = null
  private _starMat: StandardMaterial | null = null

  constructor(scene: Scene, sun: DirectionalLight, amb: HemisphericLight) {
    this.scene = scene
    this.sun = sun
    this.amb = amb
  }

  tick(dt: number) {
    this.t = (this.t + dt / DAY_NIGHT.CYCLE_DURATION) % 1
    this.apply()
  }

  private apply() {
    const k = this.interp(this.t)

    this._sky.set(k.sky[0], k.sky[1], k.sky[2], 1)
    this._fog.set(k.fog[0], k.fog[1], k.fog[2])
    this._sunCol.set(k.sun[0], k.sun[1], k.sun[2])
    this._ambCol.set(k.amb[0], k.amb[1], k.amb[2])
    this._skyTint.set(k.sky[0], k.sky[1], k.sky[2])

    this.scene.clearColor = this._sky
    this.scene.fogColor   = this._fog
    this.scene.fogDensity = k.fogDensity
    this.sun.diffuse      = this._sunCol
    this.sun.intensity    = k.sunIntensity
    this.amb.diffuse      = this._ambCol
    this.amb.intensity    = k.ambIntensity

    // Sky sphere: tint emissiveColor so gradient shifts with time of day
    // Babylon multiplies emissiveColor × emissiveTexture per pixel
    if (!this._skyMat) {
      this._skyMat = (this.scene.getMeshByName('sky')?.material as StandardMaterial) ?? null
    }
    if (this._skyMat) this._skyMat.emissiveColor = this._skyTint

    // Star sphere: fade in at dusk, full at night, fade out at dawn
    if (!this._starMat) {
      this._starMat = (this.scene.getMeshByName('stars')?.material as StandardMaterial) ?? null
    }
    if (this._starMat) this._starMat.alpha = this.starAlpha(this.t)

    const angle = this.t * Math.PI * 2
    this._dir.set(-Math.sin(angle), -(Math.abs(Math.cos(angle)) + 0.3), -Math.cos(angle))
    this.sun.direction = this._dir
  }

  // Stars: invisible during day, fade in at dusk (t≈0.78), full at night, fade out at dawn (t≈0.22)
  private starAlpha(t: number): number {
    if (t < 0.10 || t > 0.90) return 1
    if (t >= 0.10 && t < 0.22) return 1 - (t - 0.10) / 0.12
    if (t > 0.78 && t <= 0.90) return (t - 0.78) / 0.12
    return 0
  }

  private interp(t: number) {
    let a = KF[KF.length - 2], b = KF[KF.length - 1]
    for (let i = 0; i < KF.length - 1; i++) {
      if (t >= KF[i].t && t < KF[i+1].t) { a = KF[i]; b = KF[i+1]; break }
    }
    const f = (t - a.t) / (b.t - a.t || 1)
    const l = (x: number, y: number) => x + (y - x) * f
    const la = (x: [number,number,number], y: [number,number,number]): [number,number,number] =>
      [l(x[0],y[0]), l(x[1],y[1]), l(x[2],y[2])]
    return {
      sky: la(a.sky, b.sky), fog: la(a.fog, b.fog),
      sun: la(a.sun, b.sun), amb: la(a.amb, b.amb),
      sunIntensity: l(a.sunIntensity, b.sunIntensity),
      ambIntensity:  l(a.ambIntensity,  b.ambIntensity),
      fogDensity:    l(a.fogDensity,    b.fogDensity),
    }
  }
}
