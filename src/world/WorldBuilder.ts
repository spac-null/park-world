import {
  Scene, MeshBuilder, StandardMaterial, Color3,
} from '@babylonjs/core'
import { WORLD } from '../config'

// Terrain height function — authored shape, not pure noise
export function terrainY(x: number, z: number): number {
  // Caldera bowl: rises toward edges
  const r = Math.sqrt(x * x + z * z)
  const rimBowl = Math.max(0, (r / WORLD.RADIUS) ** 2) * 60

  // Interior undulation — gentle hills
  const hills =
    Math.sin(x * 0.04) * 3 +
    Math.cos(z * 0.035) * 2.5 +
    Math.sin(x * 0.09 + z * 0.07) * 1.5

  // Hard floor
  return Math.max(0, rimBowl + hills)
}

export class WorldBuilder {
  private scene: Scene

  constructor(scene: Scene) {
    this.scene = scene
  }

  build() {
    this.buildTerrain()
    this.buildSpire()
    this.buildRim()
    this.buildHollows()
    this.buildCanopy()
    this.buildScrapYard()
  }

  private buildTerrain() {
    const size = WORLD.RADIUS * 2
    const subdivisions = 80

    const terrain = MeshBuilder.CreateGround('terrain', {
      width: size, height: size,
      subdivisions,
      updatable: false,
    }, this.scene)

    // Apply height function to vertices
    const positions = terrain.getVerticesData('position') as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]
      positions[i + 1] = terrainY(x, z)
    }
    terrain.updateVerticesData('position', positions)
    terrain.createNormals(false)

    const mat = new StandardMaterial('terrainMat', this.scene)
    mat.diffuseColor = new Color3(0.35, 0.48, 0.22)
    mat.specularColor = new Color3(0, 0, 0)
    terrain.material = mat
    terrain.checkCollisions = true
  }

  private buildSpire() {
    // Central stone column — THE landmark
    const spire = MeshBuilder.CreateCylinder('spire', {
      height: WORLD.SPIRE_HEIGHT,
      diameterTop: 4,
      diameterBottom: 14,
      tessellation: 7,
    }, this.scene)
    spire.position.y = WORLD.SPIRE_HEIGHT / 2

    const mat = new StandardMaterial('spireMat', this.scene)
    mat.diffuseColor = new Color3(0.55, 0.50, 0.44)
    mat.specularColor = new Color3(0.1, 0.1, 0.1)
    spire.material = mat
    spire.checkCollisions = true

    // Three flyable rings at different heights
    const ringHeights = [15, 35, 55]
    ringHeights.forEach((h, i) => {
      const ring = MeshBuilder.CreateTorus(`spireRing${i}`, {
        diameter: 24,
        thickness: 2.5,
        tessellation: 16,
      }, this.scene)
      ring.position.y = h
      ring.rotation.x = Math.PI / 2
      const rmat = new StandardMaterial(`ringMat${i}`, this.scene)
      rmat.diffuseColor = new Color3(0.50, 0.44, 0.38)
      rmat.specularColor = new Color3(0, 0, 0)
      ring.material = rmat
      ring.checkCollisions = true
    })
  }

  private buildRim() {
    // Rim wall — caldera edge. Four colored sectors.
    const rimColors: [Color3, number, string][] = [
      [new Color3(0.72, 0.55, 0.28), 0,            'rimN'],   // amber (north/Hollows)
      [new Color3(0.42, 0.52, 0.38), Math.PI/2,    'rimE'],   // grey-green (east/Canopy)
      [new Color3(0.62, 0.32, 0.22), Math.PI,      'rimS'],   // red-oxide (south/Thermals)
      [new Color3(0.28, 0.30, 0.35), -Math.PI/2,   'rimW'],   // dark steel (west/ScrapYard)
    ]

    rimColors.forEach(([color, angle, name]) => {
      const seg = MeshBuilder.CreateCylinder(name, {
        height: WORLD.RIM_HEIGHT,
        diameter: 30,
        tessellation: 6,
      }, this.scene)
      seg.position.x = Math.sin(angle) * (WORLD.RADIUS - 10)
      seg.position.y = WORLD.RIM_HEIGHT / 2
      seg.position.z = Math.cos(angle) * (WORLD.RADIUS - 10)
      seg.scaling.x = 5
      seg.scaling.z = 5
      const mat = new StandardMaterial(name + 'Mat', this.scene)
      mat.diffuseColor = color
      mat.specularColor = new Color3(0, 0, 0)
      seg.material = mat
      seg.checkCollisions = true
    })
  }

  private buildHollows() {
    // North sector — stone arches and tunnels
    const archPositions = [
      { x: -30, z: -60 }, { x: 10, z: -80 }, { x: -50, z: -90 },
    ]
    archPositions.forEach((pos, i) => {
      const arch = MeshBuilder.CreateTorus(`arch${i}`, {
        diameter: 18,
        thickness: 2,
        tessellation: 12,
      }, this.scene)
      arch.position.set(pos.x, 9, pos.z)
      arch.rotation.z = Math.PI / 2
      const mat = new StandardMaterial(`archMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.68, 0.60, 0.45)
      mat.specularColor = new Color3(0, 0, 0)
      arch.material = mat
      arch.checkCollisions = true
    })
  }

  private buildCanopy() {
    // East sector — floating stone pillars with flat tops
    const pillarPositions = [
      { x: 60, z: -30, h: 25 }, { x: 90, z: -10, h: 18 },
      { x: 75, z: -55, h: 30 }, { x: 110, z: -40, h: 22 },
    ]
    pillarPositions.forEach((p, i) => {
      const pillar = MeshBuilder.CreateCylinder(`pillar${i}`, {
        height: p.h,
        diameterTop: 12,
        diameterBottom: 8,
        tessellation: 6,
      }, this.scene)
      pillar.position.set(p.x, p.h / 2, p.z)
      const mat = new StandardMaterial(`pillarMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.50, 0.55, 0.42)
      mat.specularColor = new Color3(0, 0, 0)
      pillar.material = mat
      pillar.checkCollisions = true
    })
  }

  private buildScrapYard() {
    // West sector — geometric debris
    const debris = [
      { x: -60, z: 30, sx: 8, sy: 6, sz: 4 },
      { x: -90, z: 10, sx: 4, sy: 3, sz: 10 },
      { x: -70, z: 60, sx: 6, sy: 8, sz: 5 },
      { x: -100, z: 45, sx: 12, sy: 4, sz: 6 },
      { x: -50, z: 80, sx: 5, sy: 5, sz: 5 },
    ]
    debris.forEach((d, i) => {
      const box = MeshBuilder.CreateBox(`debris${i}`, {
        width: d.sx, height: d.sy, depth: d.sz,
      }, this.scene)
      box.position.set(d.x, terrainY(d.x, d.z) + d.sy / 2, d.z)
      box.rotation.y = Math.random() * Math.PI
      const mat = new StandardMaterial(`debrisMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.42, 0.36, 0.30)
      mat.specularColor = new Color3(0, 0, 0)
      box.material = mat
      box.checkCollisions = true
    })
  }
}
