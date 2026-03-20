import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from '../world/WorldBuilder'
import { PHYSICS, WEAPONS } from '../config'
import type { WebSocketClient } from '../network/WebSocketClient'

let _rocketId = 0

interface Rocket {
  mesh: ReturnType<typeof MeshBuilder.CreateSphere>
  mat: StandardMaterial
  vx: number; vy: number; vz: number
  age: number
  fromId: string
}

export class RocketManager {
  private rockets: Rocket[] = []
  private scene: Scene
  private net: WebSocketClient
  private myId = ''
  private cooldown = 0

  constructor(scene: Scene, net: WebSocketClient) {
    this.scene = scene
    this.net = net
  }

  setMyId(id: string) { this.myId = id }

  fire(px: number, py: number, pz: number, yaw: number, pitch: number) {
    if (this.cooldown > 0 || !this.myId) return
    this.cooldown = WEAPONS.ROCKET_COOLDOWN

    const cosPitch = Math.cos(pitch)
    // Slight wobble — rockets drift unpredictably (goofy, not tactical)
    const wobble = WEAPONS.ROCKET_SPEED * 0.07
    const vx = Math.sin(yaw) * cosPitch * WEAPONS.ROCKET_SPEED + (Math.random() - 0.5) * wobble
    const vy = -Math.sin(pitch) * WEAPONS.ROCKET_SPEED
    const vz = Math.cos(yaw) * cosPitch * WEAPONS.ROCKET_SPEED + (Math.random() - 0.5) * wobble

    this.spawnRocket(px, py + 0.5, pz, vx, vy, vz, 'local')
    this.net.send({ type: 'rocket', fromId: this.myId, x: px, y: py + 0.5, z: pz, vx, vy, vz })
  }

  addRemote(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromId: string) {
    this.spawnRocket(x, y, z, vx, vy, vz, fromId)
  }

  private spawnRocket(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromId: string) {
    const id = _rocketId++
    const mesh = MeshBuilder.CreateSphere(`rocket${id}`, { diameter: 0.9, segments: 4 }, this.scene)
    mesh.position.set(x, y, z)
    mesh.isPickable = false

    const mat = new StandardMaterial(`rocketMat${id}`, this.scene)
    mat.emissiveColor = new Color3(1.0, 0.35, 0.0)  // hot orange — visually distinct from yellow eggs
    mat.disableLighting = true
    mesh.material = mat

    this.rockets.push({ mesh, mat, vx, vy, vz, age: 0, fromId })
  }

  tick(dt: number, px: number, py: number, pz: number, onHit: () => void) {
    this.cooldown = Math.max(0, this.cooldown - dt)

    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]
      r.age += dt

      // Rockets drift down noticeably — you can see it coming and dodge
      r.vy -= PHYSICS.GRAVITY * 0.28 * dt
      r.mesh.position.x += r.vx * dt
      r.mesh.position.y += r.vy * dt
      r.mesh.position.z += r.vz * dt

      // Spin for visual read (different axis from egg)
      r.mesh.rotation.x += dt * 7

      const ground = terrainY(r.mesh.position.x, r.mesh.position.z)
      const expired = r.mesh.position.y < ground || r.age > 6

      if (expired) {
        // AOE — knock local player if within blast radius
        const dx = px - r.mesh.position.x
        const dy = py - r.mesh.position.y
        const dz = pz - r.mesh.position.z
        if (dx * dx + dy * dy + dz * dz < WEAPONS.ROCKET_AOE * WEAPONS.ROCKET_AOE) {
          onHit()
        }
        r.mat.dispose()
        r.mesh.dispose()
        this.rockets.splice(i, 1)
        continue
      }

      // Direct hit — remote rockets only
      if (r.fromId !== 'local') {
        const dx = px - r.mesh.position.x
        const dy = py - r.mesh.position.y
        const dz = pz - r.mesh.position.z
        if (dx * dx + dy * dy + dz * dz < 2.5 * 2.5) {
          onHit()
          this.net.send({ type: 'hit', fromId: r.fromId, fromName: '' })
          r.mat.dispose()
          r.mesh.dispose()
          this.rockets.splice(i, 1)
          continue
        }
      }
    }
  }

  get canFire() { return this.cooldown <= 0 }
}
