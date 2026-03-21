import { Scene } from '@babylonjs/core'

// CRITICAL: call tick() AFTER DayNightCycle.tick() each frame

interface ZoneDef {
  id: string
  cx: number; cz: number; r: number
  minY?: number
  // fog color
  fr: number; fg: number; fb: number
  // ambient color
  ar: number; ag: number; ab: number
}

const ZONES: ZoneDef[] = [
  { id:'center',    cx:0,   cz:0,   r:30,             fr:0.54,fg:0.74,fb:0.91, ar:0.82,ag:0.75,ab:0.60 },
  { id:'hollows',   cx:-40, cz:-75, r:50,             fr:0.30,fg:0.22,fb:0.52, ar:0.55,ag:0.42,ab:0.72 },
  { id:'canopy',    cx:85,  cz:-30, r:55,             fr:0.42,fg:0.62,fb:0.28, ar:0.72,ag:0.68,ab:0.32 },
  { id:'scrapyard', cx:-75, cz:15,  r:50,             fr:0.68,fg:0.52,fb:0.30, ar:0.75,ag:0.60,ab:0.35 },
  { id:'mountain',  cx:0,   cz:-88, r:45,             fr:0.55,fg:0.62,fb:0.75, ar:0.60,ag:0.65,ab:0.80 },
  { id:'spire',     cx:0,   cz:0,   r:20,  minY:40,   fr:0.70,fg:0.85,fb:0.98, ar:0.88,ag:0.88,ab:0.95 },
]

const LERP_RATE = 2.5
const DEFAULT_FOG = [0.54, 0.74, 0.91] as const
const DEFAULT_AMB = [0.82, 0.75, 0.60] as const

export class ZoneManager {
  private _scene: Scene
  // current fog/ambient as floats (avoid Color3 alloc every frame)
  private cfr = DEFAULT_FOG[0]; private cfg = DEFAULT_FOG[1]; private cfb = DEFAULT_FOG[2]
  private car = DEFAULT_AMB[0]; private cag = DEFAULT_AMB[1]; private cab = DEFAULT_AMB[2]
  private _zoneId = 'center'

  constructor(scene: Scene) { this._scene = scene }

  tick(dt: number, px: number, py: number, pz: number) {
    let tw = 0
    let tfr = 0, tfg = 0, tfb = 0
    let tar = 0, tag = 0, tab = 0
    let bestId = 'center', bestW = 0

    for (const z of ZONES) {
      if (z.minY !== undefined && py < z.minY - 15) continue
      const dx = px - z.cx, dz = pz - z.cz
      const d2 = dx*dx + dz*dz
      if (d2 > z.r * z.r) continue
      const d = Math.sqrt(d2)
      let w = Math.max(0, 1 - d / z.r)
      if (z.minY !== undefined && py < z.minY) {
        w *= Math.min(1, (py - (z.minY - 15)) / 15)
      }
      if (w <= 0) continue
      tw += w
      tfr += z.fr * w; tfg += z.fg * w; tfb += z.fb * w
      tar += z.ar * w; tag += z.ag * w; tab += z.ab * w
      if (w > bestW) { bestW = w; bestId = z.id }
    }

    const t = Math.min(LERP_RATE * dt, 1)
    const inv = tw > 0 ? 1 / tw : 0
    const fogR = tw > 0 ? tfr * inv : DEFAULT_FOG[0]
    const fogG = tw > 0 ? tfg * inv : DEFAULT_FOG[1]
    const fogB = tw > 0 ? tfb * inv : DEFAULT_FOG[2]
    const ambR = tw > 0 ? tar * inv : DEFAULT_AMB[0]
    const ambG = tw > 0 ? tag * inv : DEFAULT_AMB[1]
    const ambB = tw > 0 ? tab * inv : DEFAULT_AMB[2]

    this.cfr += (fogR - this.cfr) * t
    this.cfg += (fogG - this.cfg) * t
    this.cfb += (fogB - this.cfb) * t
    this.car += (ambR - this.car) * t
    this.cag += (ambG - this.cag) * t
    this.cab += (ambB - this.cab) * t
    this._zoneId = tw > 0 ? bestId : 'center'

    this._scene.fogColor.set(this.cfr, this.cfg, this.cfb)
    this._scene.clearColor.set(this.cfr, this.cfg, this.cfb, 1)
    this._scene.ambientColor.set(this.car, this.cag, this.cab)
  }

  getCurrentZoneId(): string { return this._zoneId }
}
