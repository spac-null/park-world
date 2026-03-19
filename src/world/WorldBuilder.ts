import {
  Scene, MeshBuilder, StandardMaterial, Color3, Mesh, DynamicTexture,
} from '@babylonjs/core'
import { WORLD } from '../config'

// Seeded pseudo-random — consistent layout across reloads
function seededRand(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

// Mountain center — south zone, flyable cave through it
export const MOUNTAIN_X = 0
export const MOUNTAIN_Z = -88

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

  // Mountain — sharp peak in south zone
  const mx = x - MOUNTAIN_X, mz = z - MOUNTAIN_Z
  const mr = Math.sqrt(mx * mx + mz * mz)
  const mountain = Math.max(0, (1 - mr / 32) ** 1.6) * 52

  return Math.max(0, rimBowl + hills + mountain)
}

export class WorldBuilder {
  private scene: Scene

  constructor(scene: Scene) {
    this.scene = scene
  }

  build() {
    this.buildSky()
    this.buildTerrain()
    this.buildSpire()
    this.buildRim()
    this.buildHollows()
    this.buildCanopy()
    this.buildScrapYard()
    this.buildVegetation()
    this.buildMountain()
  }

  private buildSky() {
    const sky = MeshBuilder.CreateSphere('sky', {
      diameter: WORLD.RADIUS * 4.5,
      segments: 12,
      sideOrientation: Mesh.BACKSIDE,
    }, this.scene)
    sky.isPickable = false

    // Gradient texture: deep blue top → hazy light blue horizon
    const skyTex = new DynamicTexture('skyGrad', { width: 16, height: 512 }, this.scene, false)
    const ctx = skyTex.getContext()
    const grad = ctx.createLinearGradient(0, 0, 0, 512)
    grad.addColorStop(0,   '#1a4fc8')
    grad.addColorStop(0.5, '#3d78d4')
    grad.addColorStop(1,   '#8abce8')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 2, 512)
    skyTex.update()

    const mat = new StandardMaterial('skyMat', this.scene)
    mat.emissiveTexture = skyTex
    mat.backFaceCulling = false
    mat.specularColor = new Color3(0, 0, 0)
    sky.material = mat
  }

  private buildTerrain() {
    const size = WORLD.RADIUS * 2
    const subdivisions = 80

    const terrain = MeshBuilder.CreateGround('terrain', {
      width: size, height: size,
      subdivisions,
      updatable: true,
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

    // Vertex colors — blend grass / dry-grass / rock by slope and height
    const colors = new Float32Array((positions.length / 3) * 4)
    const d = 3  // sample distance for slope
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2]
      const dydx = (terrainY(x + d, z) - terrainY(x - d, z)) / (2 * d)
      const dydz = (terrainY(x, z + d) - terrainY(x, z - d)) / (2 * d)
      const slopeT  = Math.min(Math.sqrt(dydx * dydx + dydz * dydz) / 1.2, 1)
      const heightT = Math.min(Math.max(0, y - 4) / 48, 1)

      // Palette: lush grass → dry grass (height) → rock (slope)
      const r0 = 0.26 + 0.18 * heightT  // grass R → dry grass R
      const g0 = 0.50 + 0.02 * heightT
      const b0 = 0.15 - 0.02 * heightT
      const vi = (i / 3) * 4
      colors[vi + 0] = r0 + (0.54 - r0) * slopeT
      colors[vi + 1] = g0 + (0.48 - g0) * slopeT
      colors[vi + 2] = b0 + (0.38 - b0) * slopeT
      colors[vi + 3] = 1
    }
    terrain.setVerticesData('color', colors)

    const mat = new StandardMaterial('terrainMat', this.scene)
    mat.diffuseColor = new Color3(1, 1, 1)   // white so vertex colors show through
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
    spire.position.y = terrainY(0, 0) + WORLD.SPIRE_HEIGHT / 2

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
      arch.position.set(pos.x, terrainY(pos.x, pos.z) + 9, pos.z)
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
      pillar.position.set(p.x, terrainY(p.x, p.z) + p.h / 2, p.z)
      const mat = new StandardMaterial(`pillarMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.50, 0.55, 0.42)
      mat.specularColor = new Color3(0, 0, 0)
      pillar.material = mat
      pillar.checkCollisions = true
    })
  }

  private buildVegetation() {
    const rand = seededRand(42)

    // --- Rocks (60 instances) ---
    const rockBase = MeshBuilder.CreateSphere('rockBase', { diameter: 1, segments: 3 }, this.scene)
    rockBase.isVisible = false
    const rockMat = new StandardMaterial('rockMat', this.scene)
    rockMat.diffuseColor = new Color3(0.52, 0.48, 0.42)
    rockMat.specularColor = new Color3(0, 0, 0)
    rockBase.material = rockMat

    for (let i = 0; i < 60; i++) {
      const angle = rand() * Math.PI * 2
      const r     = 15 + rand() * 155        // avoid center spire area
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue  // clear spire base
      const y = terrainY(x, z)
      const sx = 1.2 + rand() * 2.5
      const sy = 0.8 + rand() * 1.8
      const sz = 1.0 + rand() * 2.2
      const inst = rockBase.createInstance(`rock${i}`)
      inst.position.set(x, y + sy * 0.4, z)
      inst.scaling.set(sx, sy, sz)
      inst.rotation.y = rand() * Math.PI * 2
    }

    // --- Trees: trunk + canopy (45 instances each) ---
    const trunkBase = MeshBuilder.CreateCylinder('trunkBase', {
      height: 1, diameterTop: 0.3, diameterBottom: 0.6, tessellation: 6,
    }, this.scene)
    trunkBase.isVisible = false
    const trunkMat = new StandardMaterial('trunkMat', this.scene)
    trunkMat.diffuseColor = new Color3(0.38, 0.26, 0.16)
    trunkMat.specularColor = new Color3(0, 0, 0)
    trunkBase.material = trunkMat

    const canopyBase = MeshBuilder.CreateSphere('canopyBase', { diameter: 1, segments: 4 }, this.scene)
    canopyBase.isVisible = false
    const canopyMat = new StandardMaterial('canopyMat', this.scene)
    canopyMat.diffuseColor = new Color3(0.22, 0.48, 0.18)
    canopyMat.specularColor = new Color3(0, 0, 0)
    canopyBase.material = canopyMat

    // --- Bushes (60 instances) ---
    const bushBase = MeshBuilder.CreateSphere('bushBase', { diameter: 1, segments: 3 }, this.scene)
    bushBase.isVisible = false
    const bushMat = new StandardMaterial('bushMat', this.scene)
    bushMat.diffuseColor = new Color3(0.18, 0.40, 0.12)
    bushMat.specularColor = new Color3(0, 0, 0)
    bushBase.material = bushMat

    const randB = seededRand(55)
    for (let i = 0; i < 60; i++) {
      const angle = randB() * Math.PI * 2
      const r     = 12 + randB() * 150
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue
      const y  = terrainY(x, z)
      const sw = 1.5 + randB() * 2.5
      const sh = 0.8 + randB() * 1.2
      const inst = bushBase.createInstance(`bush${i}`)
      inst.position.set(x, y + sh * 0.5, z)
      inst.scaling.set(sw, sh, sw)
      inst.rotation.y = randB() * Math.PI * 2
    }

    // --- Flower patches (80 tiny spheres) ---
    const flowerBase = MeshBuilder.CreateSphere('flowerBase', { diameter: 0.3, segments: 2 }, this.scene)
    flowerBase.isVisible = false
    const flowerMat = new StandardMaterial('flowerMat', this.scene)
    flowerMat.diffuseColor = new Color3(0.95, 0.85, 0.25)
    flowerMat.specularColor = new Color3(0, 0, 0)
    flowerBase.material = flowerMat

    const flowerMat2 = new StandardMaterial('flowerMat2', this.scene)
    flowerMat2.diffuseColor = new Color3(0.9, 0.3, 0.4)
    flowerMat2.specularColor = new Color3(0, 0, 0)

    const randF = seededRand(33)
    for (let i = 0; i < 80; i++) {
      const angle = randF() * Math.PI * 2
      const r     = 8 + randF() * 140
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      const y     = terrainY(x, z)
      const inst  = flowerBase.createInstance(`flower${i}`)
      inst.position.set(x + randF() * 2 - 1, y + 0.3, z + randF() * 2 - 1)
      if (i % 3 === 0) inst.material = flowerMat2
    }

    // --- Trees: trunk + canopy ---
    const rand2 = seededRand(99)
    for (let i = 0; i < 80; i++) {
      const angle = rand2() * Math.PI * 2
      const r     = 20 + rand2() * 140
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 12) continue
      const y     = terrainY(x, z)
      const h     = 4 + rand2() * 6          // tree height
      const cw    = 2.5 + rand2() * 3        // canopy width

      const trunk = trunkBase.createInstance(`trunk${i}`)
      trunk.position.set(x, y + h / 2, z)
      trunk.scaling.set(1, h, 1)

      const canopy = canopyBase.createInstance(`canopy${i}`)
      canopy.position.set(x, y + h + cw * 0.35, z)
      canopy.scaling.set(cw, cw * 0.85, cw)
    }
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
      box.rotation.y = (i * 1.7 + 0.5) % Math.PI
      const mat = new StandardMaterial(`debrisMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.42, 0.36, 0.30)
      mat.specularColor = new Color3(0, 0, 0)
      box.material = mat
      box.checkCollisions = true
    })
  }

  private buildMountain() {
    const mx = MOUNTAIN_X
    const mz = MOUNTAIN_Z
    const peakY = terrainY(mx, mz)   // top of mountain (~52 + base)
    const caveY = terrainY(mx, mz - 14) + 7   // cave mouth height on south face

    const stoneMat = new StandardMaterial('mountainStoneMat', this.scene)
    stoneMat.diffuseColor = new Color3(0.50, 0.45, 0.38)
    stoneMat.specularColor = new Color3(0.05, 0.05, 0.05)

    const darkMat = new StandardMaterial('caveMat', this.scene)
    darkMat.diffuseColor = new Color3(0.12, 0.10, 0.09)
    darkMat.specularColor = new Color3(0, 0, 0)

    // --- Cave entrance arch (south face) ---
    const archS = MeshBuilder.CreateTorus('caveArchS', {
      diameter: 14, thickness: 2.5, tessellation: 14,
    }, this.scene)
    archS.position.set(mx, caveY, mz - 14)
    archS.rotation.z = Math.PI / 2
    archS.material = stoneMat

    // --- Cave exit arch (north face, hidden behind waterfall) ---
    const archN = MeshBuilder.CreateTorus('caveArchN', {
      diameter: 14, thickness: 2.5, tessellation: 14,
    }, this.scene)
    archN.position.set(mx, caveY, mz + 12)
    archN.rotation.z = Math.PI / 2
    archN.material = stoneMat

    // --- Cave tunnel interior (dark box through mountain) ---
    const tunnel = MeshBuilder.CreateBox('caveTunnel', {
      width: 10, height: 9, depth: 30,
    }, this.scene)
    tunnel.position.set(mx, caveY, mz - 1)
    tunnel.material = darkMat

    // --- Rocky ledge overhangs flanking the peak ---
    const ledges: [number, number][] = [[-14, -6], [14, -6], [-10, 8], [10, 8]]
    ledges.forEach(([ox, oz], i) => {
      const ledge = MeshBuilder.CreateBox(`ledge${i}`, {
        width: 10 + i * 2, height: 3, depth: 8,
      }, this.scene)
      ledge.position.set(mx + ox, terrainY(mx + ox, mz + oz) + 1.5, mz + oz)
      ledge.rotation.z = (ox > 0 ? 1 : -1) * 0.18
      ledge.material = stoneMat
    })

    // --- Waterfall — north face of mountain, hides cave exit ---
    const fallX = mx, fallZ = mz + 10
    const fallY = peakY - 8

    // Layered water slabs cascading down, blue-tinted + semi-transparent
    const waterMat = new StandardMaterial('waterMat', this.scene)
    waterMat.diffuseColor = new Color3(0.35, 0.60, 0.90)
    waterMat.specularColor = new Color3(0.8, 0.9, 1.0)
    waterMat.specularPower = 32
    waterMat.alpha = 0.72

    const steps = 7
    for (let s = 0; s < steps; s++) {
      const t  = s / (steps - 1)
      const sy = fallY - t * (fallY - caveY - 2)
      const sw = 6 + t * 3     // widens as it falls
      const sd = 0.8 - t * 0.3
      const slab = MeshBuilder.CreateBox(`wfall${s}`, {
        width: sw, height: 0.4, depth: sd,
      }, this.scene)
      slab.position.set(fallX, sy, fallZ + t * 1.5)
      slab.rotation.x = -0.15
      slab.material = waterMat
    }

    // Mist spray at base — small flat disc
    const mist = MeshBuilder.CreateDisc('mistDisc', { radius: 6, tessellation: 12 }, this.scene)
    mist.position.set(fallX, caveY - 1, fallZ + 2)
    mist.rotation.x = Math.PI / 2
    const mistMat = new StandardMaterial('mistMat', this.scene)
    mistMat.diffuseColor = new Color3(0.7, 0.85, 1.0)
    mistMat.alpha = 0.35
    mist.material = mistMat

    // --- Summit cap — flat rocky top ---
    const summit = MeshBuilder.CreateCylinder('mountainSummit', {
      height: 4, diameterTop: 6, diameterBottom: 10, tessellation: 7,
    }, this.scene)
    summit.position.set(mx, peakY + 2, mz)
    summit.material = stoneMat
  }
}
