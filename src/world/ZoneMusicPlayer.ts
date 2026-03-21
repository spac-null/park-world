// Zone ambient music — Web Audio only, no audio files
// All oscillators created once, never stopped — only gain is modulated
// Lazy AudioContext init on first tick (browser autoplay policy)

type ZoneId = 'center' | 'hollows' | 'canopy' | 'scrapyard' | 'mountain' | 'spire'

interface ZoneDef {
  notes: number[]       // arpeggio frequencies (Hz)
  rate: number          // notes per second
  type: OscillatorType
  lpfHz?: number        // optional LPF cutoff (scrapyard industrial tone)
}

// Intervals
const MAJ  = [1, 1.2599, 1.4983, 2]    // major: root, M3, P5, Oct
const MIN3 = [1, 1.1892, 1.4983]        // minor triad: root, m3, P5

const ZONE_DEFS: Record<ZoneId, ZoneDef> = {
  center:    { notes: MAJ.map(r  => 261.63 * r), rate: 1.6, type: 'sine'     },
  hollows:   { notes: MIN3.map(r => 174.61 * r), rate: 0.8, type: 'sine'     },
  canopy:    { notes: MAJ.map(r  => 293.66 * r), rate: 2.0, type: 'triangle' },
  scrapyard: { notes: MIN3.map(r => 220.0  * r), rate: 1.2, type: 'sawtooth', lpfHz: 800 },
  mountain:  { notes: MAJ.slice(0,3).map(r => 196.0 * r), rate: 0.6, type: 'sine' },
  spire:     { notes: MAJ.map(r  => 392.0  * r), rate: 2.4, type: 'sine'     },
}

interface Channel {
  osc: OscillatorNode
  gain: GainNode
  step: number
  stepTimer: number
}

const BASE_GAIN = 0.08
const FADE_TAU  = 0.23   // setTargetAtTime τ — 3τ ≈ 0.7s crossfade

export class ZoneMusicPlayer {
  private _ctx: AudioContext | null = null
  private _channels: Map<ZoneId, Channel> | null = null
  private _ctxFailed = false
  private _activeZone: ZoneId = 'center'
  private _glideMode: boolean

  constructor(glideMode = false) {
    this._glideMode = glideMode
  }

  private _setup() {
    if (!this._ctx || this._channels) return
    this._channels = new Map()

    for (const [id, def] of Object.entries(ZONE_DEFS) as [ZoneId, ZoneDef][]) {
      const ctx  = this._ctx
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = def.type
      osc.frequency.value = def.notes[0]
      gain.gain.value = 0

      if (def.lpfHz) {
        const lpf = ctx.createBiquadFilter()
        lpf.type = 'lowpass'
        lpf.frequency.value = def.lpfHz
        osc.connect(gain); gain.connect(lpf); lpf.connect(ctx.destination)
      } else {
        osc.connect(gain); gain.connect(ctx.destination)
      }

      osc.start()
      this._channels.set(id, { osc, gain, step: 0, stepTimer: 0 })
    }

    // Start active zone immediately
    const startCh = this._channels.get(this._activeZone)!
    startCh.gain.gain.value = this._glideMode ? BASE_GAIN * 1.5 : BASE_GAIN
  }

  tick(dt: number, zoneId: string) {
    if (this._ctxFailed) return
    if (!this._ctx) {
      try { this._ctx = new AudioContext() } catch (_) { this._ctxFailed = true; return }
    }
    if (!this._channels) this._setup()
    if (!this._channels) return
    if (this._ctx.state === 'suspended') void this._ctx.resume().catch(() => {})

    const target = (ZONE_DEFS[zoneId as ZoneId] ? zoneId : 'center') as ZoneId
    const ctx = this._ctx
    const targetGain = this._glideMode ? BASE_GAIN * 1.5 : BASE_GAIN

    // Zone crossfade
    if (target !== this._activeZone) {
      const oldCh = this._channels.get(this._activeZone)!
      const newCh = this._channels.get(target)!
      const newDef = ZONE_DEFS[target]
      newCh.step = 0
      newCh.stepTimer = 0
      newCh.osc.frequency.setTargetAtTime(newDef.notes[0], ctx.currentTime, 0.02)
      oldCh.gain.gain.setTargetAtTime(0,          ctx.currentTime, FADE_TAU)
      newCh.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, FADE_TAU)
      this._activeZone = target
    }

    // Arpeggio step for active zone
    const ch  = this._channels.get(this._activeZone)!
    const def = ZONE_DEFS[this._activeZone]
    const rate = this._glideMode ? def.rate * 1.3 : def.rate
    ch.stepTimer += dt
    if (ch.stepTimer >= 1 / rate) {
      ch.stepTimer -= 1 / rate
      ch.step = (ch.step + 1) % def.notes.length
      ch.osc.frequency.setTargetAtTime(def.notes[ch.step], ctx.currentTime, 0.02)
    }
  }
}
