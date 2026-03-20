import { Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import { terrainY } from '../world/WorldBuilder'
import { PHYSICS, WEAPONS } from '../config'
import type { WebSocketClient } from '../network/WebSocketClient'

let _eggId = 0

interface Egg {
  mesh: ReturnType<typeof MeshBuilder.CreateSphere>
  mat: StandardMaterial
  vx: number; vy: number; vz: number
  age: number
  fromId: string
}

export class EggManager {
  private eggs: Egg[] = []
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
    this.cooldown = WEAPONS.EGG_COOLDOWN

    const cosPitch = Math.cos(pitch)
    const vx = Math.sin(yaw) * cosPitch * WEAPONS.EGG_SPEED
    const vy = -Math.sin(pitch) * WEAPONS.EGG_SPEED + 3  // upward bias — eggs arc
    const vz = Math.cos(yaw) * cosPitch * WEAPONS.EGG_SPEED

    this.spawnEgg(px, py + 0.5, pz, vx, vy, vz, 'local')
    this.net.send({ type: 'egg', fromId: this.myId, x: px, y: py + 0.5, z: pz, vx, vy, vz })
  }

  addRemote(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromId: string) {
    this.spawnEgg(x, y, z, vx, vy, vz, fromId)
  }

  private spawnEgg(x: number, y: number, z: number, vx: number, vy: number, vz: number, fromId: string) {
    const id = _eggId++
    const mesh = MeshBuilder.CreateSphere(`egg${id}`, { diameter: 0.7, segments: 4 }, this.scene)
    mesh.position.set(x, y, z)
    mesh.isPickable = false

    const mat = new StandardMaterial(`eggMat${id}`, this.scene)
    mat.emissiveColor = new Color3(1.0, 0.95, 0.65)
    mat.disableLighting = true
    mesh.material = mat

    this.eggs.push({ mesh, mat, vx, vy, vz, age: 0, fromId })
  }

  tick(dt: number, px: number, py: number, pz: number, onHit: () => void) {
    this.cooldown = Math.max(0, this.cooldown - dt)

    for (let i = this.eggs.length - 1; i >= 0; i--) {
      const e = this.eggs[i]
      e.age += dt

      // Ballistic physics — gravity, no drag
      e.vy -= PHYSICS.GRAVITY * dt
      e.mesh.position.x += e.vx * dt
      e.mesh.position.y += e.vy * dt
      e.mesh.position.z += e.vz * dt

      // Spin for visual read
      e.mesh.rotation.z += dt * 5

      // Terrain hit or lifetime exceeded
      const ground = terrainY(e.mesh.position.x, e.mesh.position.z)
      if (e.mesh.position.y < ground || e.age > 4) {
        e.mat.dispose()
        e.mesh.dispose()
        this.eggs.splice(i, 1)
        continue
      }

      // Hit detection — only remote eggs can hit local player
      if (e.fromId !== 'local') {
        const dx = px - e.mesh.position.x
        const dy = py - e.mesh.position.y
        const dz = pz - e.mesh.position.z
        if (dx * dx + dy * dy + dz * dz < 2.5 * 2.5) {
          e.mat.dispose()
          e.mesh.dispose()
          this.eggs.splice(i, 1)
          onHit()
          this.net.send({ type: 'hit', fromId: e.fromId, fromName: '' })
          continue
        }
      }
    }
  }

  get canFire() { return this.cooldown <= 0 }
}
