import {
  Scene, MeshBuilder, StandardMaterial, Color3, Mesh, DynamicTexture,
} from '@babylonjs/core'
import { WORLD } from '../config'
import { type NatureAssets, place } from './AssetLoader'

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
  const mountain = Math.max(0, 1 - mr / 32) ** 1.6 * 52

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
    this.buildMountain()
  }

  // Called after Kenney assets are loaded
  buildNature(assets: NatureAssets) {
    const rand  = seededRand(42)
    const rand2 = seededRand(99)
    const randB = seededRand(55)
    const randF = seededRand(33)

    // --- Trees (80) ---
    for (let i = 0; i < 80; i++) {
      const angle = rand2() * Math.PI * 2
      const r     = 20 + rand2() * 140
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 12) continue
      const y     = terrainY(x, z)
      // tree_blocks + tree_fat most for Banjo feel, mix in others
      const pick  = Math.floor(rand2() * 10)
      const treeIdx = pick < 4 ? 0 : pick < 7 ? 1 : pick < 8 ? 3 : pick < 9 ? 4 : 2
      const scale = 18 + rand2() * 14
      place(assets.trees[treeIdx], x, y, z, scale, rand2() * Math.PI * 2)
    }

    // --- Rocks (60) ---
    for (let i = 0; i < 60; i++) {
      const angle = rand() * Math.PI * 2
      const r     = 15 + rand() * 155
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue
      const y     = terrainY(x, z)
      const pick  = Math.floor(rand() * 5)
      const scale = 8 + rand() * 10
      place(assets.rocks[pick], x, y, z, scale, rand() * Math.PI * 2)
    }

    // --- Extras: mushrooms, stumps, logs, flowers, grass (80) ---
    for (let i = 0; i < 80; i++) {
      const angle = randB() * Math.PI * 2
      const r     = 12 + randB() * 150
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue
      const y     = terrainY(x, z)
      const pick  = Math.floor(randB() * 7)
      const scales = [8, 10, 6, 4, 4, 7, 9]  // mushrooms, stumps, flowers, grass, log
      place(assets.extras[pick], x, y, z, scales[pick], randB() * Math.PI * 2)
    }

    // --- Flower patches (40, tight clusters) ---
    for (let i = 0; i < 40; i++) {
      const angle = randF() * Math.PI * 2
      const r     = 8 + randF() * 140
      const cx    = Math.cos(angle) * r
      const cz    = Math.sin(angle) * r
      const isRed = i % 2 === 0
      for (let j = 0; j < 3; j++) {
        const x = cx + (randF() * 4 - 2)
        const z = cz + (randF() * 4 - 2)
        const y = terrainY(x, z)
        place(assets.extras[isRed ? 3 : 4], x, y, z, 5, randF() * Math.PI * 2)
      }
    }

    // --- Statues on Canopy pillar tops ---
    const pillarTops = [
      { x: 60,  z: -30, h: 25 }, { x: 90,  z: -10, h: 18 },
      { x: 75,  z: -55, h: 30 }, { x: 110, z: -40, h: 22 },
    ]
    pillarTops.forEach((p, i) => {
      const y = terrainY(p.x, p.z) + p.h
      const asset = i % 2 === 0 ? assets.statues[1] : assets.statues[0]  // obelisk / column
      place(asset, p.x, y, p.z, 12, i * 0.8)
    })

    // --- Campfires scattered (8 — near hollows, scrapyard, open areas) ---
    const randC = seededRand(77)
    for (let i = 0; i < 8; i++) {
      const angle = randC() * Math.PI * 2
      const r     = 25 + randC() * 120
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      const y     = terrainY(x, z)
      place(assets.deco[0], x, y, z, 10, randC() * Math.PI * 2)
    }

    // --- Bushes as ground cover (50) ---
    const randSh = seededRand(66)
    for (let i = 0; i < 50; i++) {
      const angle = randSh() * Math.PI * 2
      const r     = 10 + randSh() * 160
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue
      const y     = terrainY(x, z)
      const big   = randSh() > 0.6
      place(big ? assets.deco[2] : assets.deco[1], x, y, z, 10 + randSh() * 8, randSh() * Math.PI * 2)
    }

    // --- Hanging moss at cave entrance ---
    const mx = MOUNTAIN_X, mz = MOUNTAIN_Z
    const caveY = terrainY(mx, mz - 14) + 12
    for (let i = 0; i < 5; i++) {
      place(assets.deco[3], mx + (i - 2) * 3, caveY, mz - 13, 8, i * 0.4)
    }

    // --- Waterfall assets replacing procedural slabs ---
    const peakY = terrainY(mx, mz)
    for (let s = 0; s < 4; s++) {
      const t  = s / 3
      const wy = peakY - 8 - t * (peakY - 8 - caveY + 2)
      const asset = t < 0.5 ? assets.waterfall[1] : assets.waterfall[0]
      place(asset, mx, wy, mz + 10 + t * 1.5, 10, 0)
    }

    // --- Tents near campfires (4) ---
    const randT = seededRand(88)
    for (let i = 0; i < 4; i++) {
      const angle = randT() * Math.PI * 2
      const r     = 30 + randT() * 100
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      const y     = terrainY(x, z)
      place(assets.deco[4], x, y, z, 14, randT() * Math.PI * 2)
    }

    // --- Log stacks in ScrapYard (west) ---
    const scrapPositions = [
      { x: -62, z: 28 }, { x: -88, z: 14 }, { x: -72, z: 58 },
    ]
    scrapPositions.forEach((p, i) => {
      const y = terrainY(p.x, p.z)
      place(i % 2 === 0 ? assets.deco[6] : assets.deco[5], p.x, y, p.z, 12, i * 1.1)
    })

    // --- Stone path to Spire base (ring of path tiles) ---
    const spireY = terrainY(0, 0)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const pr = 12
      const px = Math.cos(a) * pr
      const pz = Math.sin(a) * pr
      place(assets.path[0], px, spireY, pz, 8, a)
    }
    // Stone circle at Spire base center
    place(assets.path[1], 0, spireY, 0, 12, 0)

    // --- Canoe near waterfall base ---
    place(assets.path[2], mx + 4, terrainY(mx + 4, mz + 18), mz + 18, 10, 0.4)

    // --- Statue head — hidden Easter egg on Spire top ring ---
    place(assets.statues[2], 2, 57, 2, 8, 0.7)

    // --- Statue rings replacing Spire torus rings ---
    ;[15, 35, 55].forEach((h, i) => {
      place(assets.statues[3], 0, h, 0, 18, i * 0.5)
    })

    // --- Tall mushrooms mixed in with extras ---
    const randM = seededRand(44)
    for (let i = 0; i < 20; i++) {
      const angle = randM() * Math.PI * 2
      const r     = 15 + randM() * 140
      const x     = Math.cos(angle) * r
      const z     = Math.sin(angle) * r
      if (Math.sqrt(x*x + z*z) < 10) continue
      const y = terrainY(x, z)
      place(assets.extras[2], x, y, z, 10 + randM() * 6, randM() * Math.PI * 2)
    }
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
    terrain.refreshBoundingInfo()  // stale bbox causes frustum culling to drop terrain
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
      box.rotation.y = (i * 1.7 + 0.5) % Math.PI
      const mat = new StandardMaterial(`debrisMat${i}`, this.scene)
      mat.diffuseColor = new Color3(0.42, 0.36, 0.30)
      mat.specularColor = new Color3(0, 0, 0)
      box.material = mat
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
