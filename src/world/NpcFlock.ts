import { Scene, Vector3, TransformNode, Color3, Quaternion } from '@babylonjs/core'
import { createBirdMesh } from './BirdMesh'
import { terrainY } from './WorldBuilder'
import { PHYSICS } from '../config'

const COLORS = [
  new Color3(0.70, 0.28, 0.18),
  new Color3(0.28, 0.55, 0.80),
  new Color3(0.20, 0.65, 0.35),
  new Color3(0.80, 0.48, 0.15),
  new Color3(0.55, 0.28, 0.72),
  new Color3(0.75, 0.72, 0.20),
  new Color3(0.22, 0.65, 0.55),
  new Color3(0.88, 0.35, 0.50),
]

type Role = 'sideline' | 'scout' | 'flock'

interface NpcBird {
  pos: Vector3
  vel: Vector3
  facingYaw: number
  mesh: TransformNode
  childMeshes: ReturnType<TransformNode['getChildMeshes']>
  bobPhase: number
  role: Role
  side: number
}

const SPEED      = 9
const MAX_SPEED  = 14
const MAX_SPEED2 = MAX_SPEED * MAX_SPEED
const STEER      = 4.5
const RIM        = 180
const RIM2       = RIM * RIM

export class NpcFlock {
  private birds: NpcBird[] = []
  // Reusable target vector — no allocation in hot path
  private _tx = 0; private _ty = 0; private _tz = 0

  constructor(scene: Scene, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r     = 25 + Math.random() * 20
      const pos   = new Vector3(Math.cos(angle) * r, 18 + Math.random() * 8, Math.sin(angle) * r)
      const role: Role = i < 2 ? 'sideline' : i < 4 ? 'scout' : 'flock'
      const mesh  = createBirdMesh(scene, COLORS[i % COLORS.length], `npc${i}`)

      this.birds.push({
        pos, vel: new Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4),
        facingYaw: angle, mesh,
        childMeshes: mesh.getChildMeshes(),  // cached once — avoid per-frame alloc
        bobPhase: Math.random() * Math.PI * 2,
        role, side: i % 2 === 0 ? 1 : -1,
      })
      // Pre-create rotation quaternion so RotationYawPitchRollToRef never allocates
      mesh.rotationQuaternion = new Quaternion()
    }
  }

  tick(dt: number, px: number, py: number, pz: number, playerYaw: number, now: number) {
    const t = now * 0.001
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      this.getTarget(b, i, t, px, py, pz, playerYaw)
      this.steer(b, dt)
      this.syncMesh(b, dt, px, py, pz)
    }
  }

  // Writes target into this._tx/y/z — zero allocation
  private getTarget(b: NpcBird, idx: number, t: number, px: number, py: number, pz: number, pYaw: number) {
    const fwdX = Math.sin(pYaw), fwdZ = Math.cos(pYaw)
    const rgtX = Math.cos(pYaw), rgtZ = -Math.sin(pYaw)

    if (b.role === 'sideline') {
      const s = Math.sin(t * 0.4 + idx) * 4
      this._tx = px + rgtX * b.side * 11 + fwdX * s
      this._ty = py + 1.5 + Math.sin(t * 0.6 + idx) * 2
      this._tz = pz + rgtZ * b.side * 11 + fwdZ * s
      return
    }
    if (b.role === 'scout') {
      const dist = b.side > 0 ? 22 : -16
      this._tx = px + fwdX * dist
      this._ty = py + 4 + Math.sin(t * 0.5 + idx) * 3
      this._tz = pz + fwdZ * dist
      return
    }
    // Flock: loose orbit
    const orbitAngle = (idx / this.birds.length) * Math.PI * 2 + t * 0.18
    const orbitR = 22 + Math.sin(t * 0.3 + idx * 1.4) * 8
    this._tx = px + Math.cos(orbitAngle) * orbitR
    this._ty = py + 6 + Math.sin(orbitAngle * 0.7 + idx) * 5
    this._tz = pz + Math.sin(orbitAngle) * orbitR
  }

  // Zero Vector3 allocations — pure scalar math
  private steer(b: NpcBird, dt: number) {
    const dx = this._tx - b.pos.x
    const dy = this._ty - b.pos.y
    const dz = this._tz - b.pos.z
    const distSq = dx * dx + dy * dy + dz * dz

    if (distSq > 0.25) {
      const invDist = 1 / Math.sqrt(distSq)
      const desX = dx * invDist * SPEED - b.vel.x
      const desY = dy * invDist * SPEED - b.vel.y
      const desZ = dz * invDist * SPEED - b.vel.z
      const magSq = desX * desX + desY * desY + desZ * desZ
      if (magSq > 0) {
        const s = Math.min(Math.sqrt(magSq), STEER) * dt * 3 / Math.sqrt(magSq)
        b.vel.x += desX * s
        b.vel.y += desY * s
        b.vel.z += desZ * s
      }
    }

    // Gravity + lift
    b.vel.y -= PHYSICS.GRAVITY * 0.55 * dt
    const hspd = Math.sqrt(b.vel.x * b.vel.x + b.vel.z * b.vel.z)
    b.vel.y += Math.min(hspd / 10, 1.2) * PHYSICS.GRAVITY * 0.52 * dt

    // Drag
    const dh = 1 - 0.4 * dt, dv = 1 - 0.15 * dt
    b.vel.x *= dh; b.vel.z *= dh; b.vel.y *= dv

    // Speed cap — use squared distance to avoid sqrt in common case
    const spdSq = b.vel.x * b.vel.x + b.vel.y * b.vel.y + b.vel.z * b.vel.z
    if (spdSq > MAX_SPEED2) {
      const s = MAX_SPEED / Math.sqrt(spdSq)
      b.vel.x *= s; b.vel.y *= s; b.vel.z *= s
    }

    // Integrate — no .scale(dt) alloc
    b.pos.x += b.vel.x * dt
    b.pos.y += b.vel.y * dt
    b.pos.z += b.vel.z * dt

    // Terrain + rim — skip sqrt until actually needed
    const floor = terrainY(b.pos.x, b.pos.z) + 2
    if (b.pos.y < floor) { b.pos.y = floor; b.vel.y = Math.abs(b.vel.y) * 0.4 }

    const drSq = b.pos.x * b.pos.x + b.pos.z * b.pos.z
    if (drSq > RIM2) {
      const s = RIM / Math.sqrt(drSq)
      b.pos.x *= s; b.pos.z *= s
      b.vel.x *= -0.5; b.vel.z *= -0.5
    }
  }

  private syncMesh(b: NpcBird, dt: number, px: number, _py: number, pz: number) {
    const vx = b.vel.x, vy = b.vel.y, vz = b.vel.z
    const spdSq = vx * vx + vy * vy + vz * vz
    const spd   = Math.sqrt(spdSq)

    let targetYaw: number
    if (b.role === 'scout' && b.side > 0) {
      targetYaw = Math.atan2(px - b.pos.x, pz - b.pos.z)
    } else {
      targetYaw = spd > 0.5 ? Math.atan2(vx, vz) : b.facingYaw
    }

    let dyaw = targetYaw - b.facingYaw
    if (dyaw >= Math.PI)  dyaw -= Math.PI * 2
    if (dyaw <= -Math.PI) dyaw += Math.PI * 2
    b.facingYaw += dyaw * Math.min(4 * dt, 1)

    const pitch    = spd > 0.5 ? Math.asin(Math.max(-1, Math.min(1, -vy / spd))) * 0.45 : 0
    const turnRate = dyaw / Math.max(dt, 0.001)
    const bank     = Math.max(-0.7, Math.min(0.7, -turnRate * 0.08))

    b.bobPhase += (2 + spd * 0.05) * dt * Math.PI * 2
    const bob = Math.sin(b.bobPhase) * Math.min(spd / 10, 1) * 0.15

    b.mesh.position.set(b.pos.x, b.pos.y + bob, b.pos.z)
    // RotationYawPitchRollToRef — writes into existing quaternion, no allocation
    Quaternion.RotationYawPitchRollToRef(b.facingYaw, pitch, bank, b.mesh.rotationQuaternion!)
  }

  dispose() {
    for (const b of this.birds) b.mesh.dispose()
  }
}
