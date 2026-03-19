import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, TransformNode } from '@babylonjs/core'

// Shared materials for parts identical across all birds — saves 18 material objects
let _beakMat: StandardMaterial | null = null
let _eyeMat:  StandardMaterial | null = null

export function createBirdMesh(scene: Scene, color: Color3, name = 'bird'): TransformNode {
  const root = new TransformNode(name, scene)

  // Body — elongated box, tapered
  const body = MeshBuilder.CreateBox(`${name}_body`, { width: 1.2, height: 0.7, depth: 2.0 }, scene)
  body.parent = root

  // Head — slightly forward and up
  const head = MeshBuilder.CreateBox(`${name}_head`, { width: 0.9, height: 0.85, depth: 0.9 }, scene)
  head.position.set(0, 0.35, 0.9)
  head.parent = root

  // Beak
  const beak = MeshBuilder.CreateBox(`${name}_beak`, { width: 0.25, height: 0.2, depth: 0.45 }, scene)
  beak.position.set(0, 0.2, 1.5)
  beak.parent = root

  // Left wing
  const wingL = MeshBuilder.CreateBox(`${name}_wingL`, { width: 2.4, height: 0.12, depth: 0.85 }, scene)
  wingL.position.set(-1.8, 0.1, 0)
  wingL.rotation.z = 0.18
  wingL.parent = root

  // Secondary feather strip — thin dark band at wing trailing edge
  const featherL = MeshBuilder.CreateBox(`${name}_featherL`, { width: 2.1, height: 0.07, depth: 0.28 }, scene)
  featherL.position.set(-1.8, 0.06, -0.35)
  featherL.rotation.z = 0.18
  featherL.parent = root

  // Right wing
  const wingR = MeshBuilder.CreateBox(`${name}_wingR`, { width: 2.4, height: 0.12, depth: 0.85 }, scene)
  wingR.position.set(1.8, 0.1, 0)
  wingR.rotation.z = -0.18
  wingR.parent = root

  const featherR = MeshBuilder.CreateBox(`${name}_featherR`, { width: 2.1, height: 0.07, depth: 0.28 }, scene)
  featherR.position.set(1.8, 0.06, -0.35)
  featherR.rotation.z = -0.18
  featherR.parent = root

  // Tail fan — three feathers spreading outward
  const tail = MeshBuilder.CreateBox(`${name}_tail`, { width: 0.7, height: 0.1, depth: 0.55 }, scene)
  tail.position.set(0, 0.12, -1.18)
  tail.rotation.x = -0.3
  tail.parent = root

  const tailL = MeshBuilder.CreateBox(`${name}_tailL`, { width: 0.45, height: 0.08, depth: 0.5 }, scene)
  tailL.position.set(-0.52, 0.08, -1.22)
  tailL.rotation.set(-0.25, 0.28, 0)
  tailL.parent = root

  const tailR = MeshBuilder.CreateBox(`${name}_tailR`, { width: 0.45, height: 0.08, depth: 0.5 }, scene)
  tailR.position.set(0.52, 0.08, -1.22)
  tailR.rotation.set(-0.25, -0.28, 0)
  tailR.parent = root

  // Chest patch — slightly lighter colour under the body
  const chest = MeshBuilder.CreateBox(`${name}_chest`, { width: 0.9, height: 0.5, depth: 1.2 }, scene)
  chest.position.set(0, -0.22, 0.3)
  chest.parent = root

  // Crown (small tuft on head)
  const crown = MeshBuilder.CreateBox(`${name}_crown`, { width: 0.2, height: 0.35, depth: 0.2 }, scene)
  crown.position.set(0, 0.85, 0.7)
  crown.parent = root

  // Eyes
  const eyeL = MeshBuilder.CreateSphere(`${name}_eyeL`, { diameter: 0.2, segments: 4 }, scene)
  eyeL.position.set(-0.38, 0.45, 1.28)
  eyeL.parent = root
  const eyeR = MeshBuilder.CreateSphere(`${name}_eyeR`, { diameter: 0.2, segments: 4 }, scene)
  eyeR.position.set(0.38, 0.45, 1.28)
  eyeR.parent = root

  // Materials
  const bodyMat = new StandardMaterial(`${name}_mat`, scene)
  bodyMat.diffuseColor = color
  bodyMat.specularColor = new Color3(0.1, 0.1, 0.1)

  if (!_beakMat) {
    _beakMat = new StandardMaterial('shared_beakMat', scene)
    _beakMat.diffuseColor = new Color3(0.9, 0.65, 0.1)
    _beakMat.specularColor = new Color3(0, 0, 0)
  }
  if (!_eyeMat) {
    _eyeMat = new StandardMaterial('shared_eyeMat', scene)
    _eyeMat.diffuseColor = new Color3(0.05, 0.05, 0.05)
    _eyeMat.specularColor = new Color3(0.8, 0.8, 0.8)
    _eyeMat.specularPower = 64
  }
  const beakMat = _beakMat
  const eyeMat  = _eyeMat

  const wingMat = new StandardMaterial(`${name}_wingMat`, scene)
  wingMat.diffuseColor = color.scale(0.75)
  wingMat.specularColor = new Color3(0, 0, 0)

  const featherMat = new StandardMaterial(`${name}_featherMat`, scene)
  featherMat.diffuseColor = color.scale(0.55)   // darker tip strip
  featherMat.specularColor = new Color3(0, 0, 0)

  const chestMat = new StandardMaterial(`${name}_chestMat`, scene)
  chestMat.diffuseColor = new Color3(
    Math.min(color.r * 1.15, 1),
    Math.min(color.g * 1.1, 1),
    Math.min(color.b * 1.2, 1),
  )
  chestMat.specularColor = new Color3(0, 0, 0)

  body.material = bodyMat
  head.material = bodyMat
  crown.material = bodyMat
  chest.material = chestMat
  tail.material = wingMat
  tailL.material = wingMat
  tailR.material = wingMat
  wingL.material = wingMat
  wingR.material = wingMat
  featherL.material = featherMat
  featherR.material = featherMat
  beak.material = beakMat
  eyeL.material = eyeMat
  eyeR.material = eyeMat

  return root
}

export function getWings(root: TransformNode): [Mesh, Mesh] {
  const scene = root.getScene()
  return [
    scene.getMeshByName(`${root.name}_wingL`) as Mesh,
    scene.getMeshByName(`${root.name}_wingR`) as Mesh,
  ]
}
