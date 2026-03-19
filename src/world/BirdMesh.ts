import { Scene, MeshBuilder, StandardMaterial, Color3, Mesh, TransformNode } from '@babylonjs/core'

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

  // Right wing
  const wingR = MeshBuilder.CreateBox(`${name}_wingR`, { width: 2.4, height: 0.12, depth: 0.85 }, scene)
  wingR.position.set(1.8, 0.1, 0)
  wingR.rotation.z = -0.18
  wingR.parent = root

  // Tail fan
  const tail = MeshBuilder.CreateBox(`${name}_tail`, { width: 0.9, height: 0.12, depth: 0.6 }, scene)
  tail.position.set(0, 0.1, -1.15)
  tail.rotation.x = -0.3
  tail.parent = root

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

  const beakMat = new StandardMaterial(`${name}_beakMat`, scene)
  beakMat.diffuseColor = new Color3(0.9, 0.65, 0.1)
  beakMat.specularColor = new Color3(0, 0, 0)

  const eyeMat = new StandardMaterial(`${name}_eyeMat`, scene)
  eyeMat.diffuseColor = new Color3(0.05, 0.05, 0.05)
  eyeMat.specularColor = new Color3(0.8, 0.8, 0.8)
  eyeMat.specularPower = 64

  const wingMat = new StandardMaterial(`${name}_wingMat`, scene)
  wingMat.diffuseColor = color.scale(0.75)
  wingMat.specularColor = new Color3(0, 0, 0)

  body.material = bodyMat
  head.material = bodyMat
  crown.material = bodyMat
  tail.material = wingMat
  wingL.material = wingMat
  wingR.material = wingMat
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
