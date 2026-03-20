import { Scene, TransformNode, Color3, DynamicTexture, MeshBuilder, StandardMaterial, Mesh } from '@babylonjs/core'
import { createBirdMesh } from '../world/BirdMesh'

interface RPlayer {
  mesh: TransformNode
  label: Mesh
  tx: number; ty: number; tz: number; tRotY: number
  color: Color3
  name: string
}

export class RemotePlayers {
  private players = new Map<string, RPlayer>()
  private scene: Scene

  constructor(scene: Scene) { this.scene = scene }

  add(id: string, name: string, colorHex: string) {
    if (this.players.has(id)) return
    const color = hexToColor3(colorHex)
    const mesh = createBirdMesh(this.scene, color, `remote_${id}`)
    const label = this.makeLabel(name, color)
    label.parent = mesh
    label.position.y = 2.5
    this.players.set(id, { mesh, label, tx:0, ty:20, tz:0, tRotY:0, color, name })
  }

  update(id: string, x: number, y: number, z: number, rotY: number) {
    const p = this.players.get(id)
    if (!p) return
    p.tx = x; p.ty = y; p.tz = z; p.tRotY = rotY
  }

  remove(id: string) {
    const p = this.players.get(id)
    if (!p) return
    p.mesh.dispose()
    this.players.delete(id)
  }

  countNear(cx: number, cz: number, r2: number, minY: number): number {
    let n = 0
    this.players.forEach(p => {
      const pos = p.mesh.position
      const dx = pos.x - cx, dz = pos.z - cz
      if (pos.y > minY && dx * dx + dz * dz < r2) n++
    })
    return n
  }

  tick(dt: number) {
    this.players.forEach(p => {
      const pos = p.mesh.position
      const lr = Math.min(8 * dt, 1)
      pos.x += (p.tx - pos.x) * lr
      pos.y += (p.ty - pos.y) * lr
      pos.z += (p.tz - pos.z) * lr
      // Smooth yaw
      let dy = p.tRotY - p.mesh.rotation.y
      while (dy > Math.PI) dy -= 2 * Math.PI
      while (dy < -Math.PI) dy += 2 * Math.PI
      p.mesh.rotation.y += dy * lr
    })
  }

  private makeLabel(name: string, color: Color3): Mesh {
    const tex = new DynamicTexture(`label_${name}`, { width: 256, height: 64 }, this.scene, false)
    tex.drawText(name, null, 48, 'bold 36px Arial', color.toHexString(), 'transparent')
    const plane = MeshBuilder.CreatePlane(`labelPlane_${name}`, { width: 2.5, height: 0.6 }, this.scene)
    const mat = new StandardMaterial(`labelMat_${name}`, this.scene)
    mat.diffuseTexture = tex
    mat.opacityTexture = tex
    mat.backFaceCulling = false
    mat.disableLighting = true
    plane.material = mat
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    return plane
  }
}

function hexToColor3(hex: string): Color3 {
  if (!hex || hex.length < 7) return new Color3(0.5, 0.5, 0.5)
  const r = parseInt(hex.slice(1,3), 16) / 255
  const g = parseInt(hex.slice(3,5), 16) / 255
  const b = parseInt(hex.slice(5,7), 16) / 255
  if (isNaN(r) || isNaN(g) || isNaN(b)) return new Color3(0.5, 0.5, 0.5)
  return new Color3(r, g, b)
}
