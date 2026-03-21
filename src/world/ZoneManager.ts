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

export class ZoneManager {
  private _scene: Scene
  // current fog/ambient as floats (avoid Color3 alloc every frame)
  private cfr = 0.54; private cfg = 0.74; private cfb = 0.91
  private car = 0.82; private cag = 0.75; private cab = 0.60
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
      const d = Math.sqrt(dx*dx + dz*dz)
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

    if (tw > 0) {
      const inv = 1 / tw
      const t = Math.min(LERP_RATE * dt, 1)
      this.cfr += (tfr*inv - this.cfr) * t
      this.cfg += (tfg*inv - this.cfg) * t
      this.cfb += (tfb*inv - this.cfb) * t
      this.car += (tar*inv - this.car) * t
      this.cag += (tag*inv - this.cag) * t
      this.cab += (tab*inv - this.cab) * t
      this._zoneId = bestId
    }

    this._scene.fogColor.set(this.cfr, this.cfg, this.cfb)
    this._scene.clearColor.set(this.cfr, this.cfg, this.cfb, 1)
    this._scene.ambientColor.set(this.car, this.cag, this.cab)
  }

  getCurrentZoneId(): string { return this._zoneId }
}
