import { Scene, Vector3, TransformNode, Color3, Quaternion } from '@babylonjs/core'
import { createBirdMesh } from './BirdMesh'
import { terrainY } from './WorldBuilder'

const COLORS = [
  new Color3(0.70, 0.28, 0.18),  // rust
  new Color3(0.28, 0.55, 0.80),  // sky blue
  new Color3(0.20, 0.65, 0.35),  // green
  new Color3(0.80, 0.48, 0.15),  // orange
  new Color3(0.55, 0.28, 0.72),  // purple
  new Color3(0.75, 0.72, 0.20),  // yellow
  new Color3(0.22, 0.65, 0.55),  // teal
  new Color3(0.88, 0.35, 0.50),  // pink
]

type Role = 'sideline' | 'scout' | 'flock'

interface NpcBird {
  pos: Vector3
  vel: Vector3
  facingYaw: number   // separate from velocity — lets body face a different direction
  mesh: TransformNode
  bobPhase: number
  role: Role
  side: number        // +1 left, -1 right (for sideline)
}

const SPEED     = 9
const MAX_SPEED = 14
const STEER     = 4.5

export class NpcFlock {
  private birds: NpcBird[] = []

  constructor(scene: Scene, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const r     = 25 + Math.random() * 20
      const pos   = new Vector3(Math.cos(angle) * r, 18 + Math.random() * 8, Math.sin(angle) * r)
      const role: Role = i < 2 ? 'sideline' : i < 4 ? 'scout' : 'flock'
      const mesh  = createBirdMesh(scene, COLORS[i % COLORS.length], `npc${i}`)

      this.birds.push({
        pos,
        vel: new Vector3((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4),
        facingYaw: angle,
        mesh,
        bobPhase: Math.random() * Math.PI * 2,
        role,
        side: i % 2 === 0 ? 1 : -1,
      })
    }
  }

  tick(dt: number, playerPos: Vector3, playerYaw: number) {
    const t = performance.now() * 0.001
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      const target = this.getTarget(b, i, t, playerPos, playerYaw)
      this.steer(b, dt, target)
      this.syncMesh(b, dt, playerPos)
    }
  }

  private getTarget(b: NpcBird, idx: number, t: number, pPos: Vector3, pYaw: number): Vector3 {
    const fwdX = Math.sin(pYaw)
    const fwdZ = Math.cos(pYaw)
    const rgtX = Math.cos(pYaw)   // right vector perpendicular to forward
    const rgtZ = -Math.sin(pYaw)

    if (b.role === 'sideline') {
      // Fly tight alongside player on their left/right flank
      // Bird velocity points any direction → they can overtake, hang back, match speed
      return new Vector3(
        pPos.x + rgtX * b.side * 11 + fwdX * Math.sin(t * 0.4 + idx) * 4,
        pPos.y + 1.5 + Math.sin(t * 0.6 + idx) * 2,
        pPos.z + rgtZ * b.side * 11 + fwdZ * Math.sin(t * 0.4 + idx) * 4,
      )
    }

    if (b.role === 'scout') {
      // One flies ahead (nose to nose with player = "backward" from player's view)
      // One flies behind and slightly above
      const dist = b.side > 0 ? 22 : -16
      return new Vector3(
        pPos.x + fwdX * dist,
        pPos.y + 4 + Math.sin(t * 0.5 + idx) * 3,
        pPos.z + fwdZ * dist,
      )
    }

    // Flock: loose figure-8 orbit around player
    const orbitAngle = (idx / this.birds.length) * Math.PI * 2 + t * 0.18
    const orbitR = 22 + Math.sin(t * 0.3 + idx * 1.4) * 8
    return new Vector3(
      pPos.x + Math.cos(orbitAngle) * orbitR,
      pPos.y + 6 + Math.sin(orbitAngle * 0.7 + idx) * 5,
      pPos.z + Math.sin(orbitAngle) * orbitR,
    )
  }

  private steer(b: NpcBird, dt: number, target: Vector3) {
    const toTarget = target.subtract(b.pos)
    const dist = toTarget.length()

    // Desired velocity toward target at cruise speed
    if (dist > 0.5) {
      const desired = toTarget.normalize().scale(SPEED)
      const steer   = desired.subtract(b.vel)
      const mag     = steer.length()
      if (mag > 0) b.vel.addInPlace(steer.normalize().scale(Math.min(mag, STEER) * dt * 3))
    }

    // Gravity + lift (lighter than player — NPCs are buoyant)
    b.vel.y -= 9.8 * 0.55 * dt
    const hspd = Math.sqrt(b.vel.x ** 2 + b.vel.z ** 2)
    b.vel.y += Math.min(hspd / 10, 1.2) * 9.8 * 0.52 * dt

    // Drag
    b.vel.x *= 1 - 0.4 * dt
    b.vel.z *= 1 - 0.4 * dt
    b.vel.y *= 1 - 0.15 * dt

    // Speed cap
    const spd = b.vel.length()
    if (spd > MAX_SPEED) b.vel.scaleInPlace(MAX_SPEED / spd)

    // Integrate
    b.pos.addInPlace(b.vel.scale(dt))

    // Terrain floor
    const floor = terrainY(b.pos.x, b.pos.z) + 2
    if (b.pos.y < floor) {
      b.pos.y = floor
      b.vel.y = Math.abs(b.vel.y) * 0.4
    }

    // World rim
    const rim = 180
    const dr  = Math.sqrt(b.pos.x ** 2 + b.pos.z ** 2)
    if (dr > rim) {
      b.pos.x *= rim / dr
      b.pos.z *= rim / dr
      b.vel.x *= -0.5
      b.vel.z *= -0.5
    }
  }

  private syncMesh(b: NpcBird, dt: number, playerPos: Vector3) {
    const spd = b.vel.length()

    // --- Yaw: velocity-derived so birds face where they actually move ---
    // This is what allows sideways + backward flight to look natural
    let targetYaw: number
    if (b.role === 'scout' && b.side > 0) {
      // Scout ahead: face TOWARD player (body looks backward relative to player's travel)
      const dx = playerPos.x - b.pos.x
      const dz = playerPos.z - b.pos.z
      targetYaw = Math.atan2(dx, dz)
    } else {
      // Everyone else: face the direction they're actually flying
      targetYaw = spd > 0.5 ? Math.atan2(b.vel.x, b.vel.z) : b.facingYaw
    }

    // Smooth yaw rotation (avoid snapping through ±π)
    let dyaw = targetYaw - b.facingYaw
    if (dyaw >= Math.PI)  dyaw -= Math.PI * 2
    if (dyaw <= -Math.PI) dyaw += Math.PI * 2
    b.facingYaw += dyaw * Math.min(4 * dt, 1)

    // Pitch from vertical velocity
    const pitch = spd > 0.5 ? Math.asin(Math.max(-1, Math.min(1, -b.vel.y / spd))) * 0.45 : 0

    // Bank from turn rate (cross product of vel with up, simplified)
    const turnRate = dyaw / Math.max(dt, 0.001)
    const bank = Math.max(-0.7, Math.min(0.7, -turnRate * 0.08))

    // Bob
    b.bobPhase += (2 + spd * 0.05) * dt * Math.PI * 2
    const bob = Math.sin(b.bobPhase) * Math.min(spd / 10, 1) * 0.15

    b.mesh.position.set(b.pos.x, b.pos.y + bob, b.pos.z)
    b.mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(b.facingYaw, pitch, bank)
  }

  dispose() {
    for (const b of this.birds) b.mesh.dispose()
  }
}
