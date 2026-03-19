import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight,
  Color3, Color4, MeshBuilder, StandardMaterial,
} from '@babylonjs/core'
import { InputManager } from './engine/InputManager'
import { SpringCamera } from './camera/SpringCamera'
import { createFlightState, tickFlight } from './physics/FlightPhysics'
import { WorldBuilder, terrainY } from './world/WorldBuilder'
import { WebSocketClient } from './network/WebSocketClient'

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
  })
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio * 0.75, 1.5))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.27, 0.53, 0.87, 1)
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.006
  scene.fogColor = new Color3(0.27, 0.53, 0.87)

  // Lights
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.98, 0.90)
  const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene)
  amb.intensity = 0.7
  amb.diffuse = new Color3(0.55, 0.60, 0.65)

  // World
  const world = new WorldBuilder(scene)
  world.build()

  // Player bird mesh (box placeholder — proper mesh comes later)
  const birdBody = MeshBuilder.CreateBox('birdBody', { width: 1.2, height: 0.6, depth: 1.8 }, scene)
  const wingL = MeshBuilder.CreateBox('wingL', { width: 2.0, height: 0.15, depth: 0.8 }, scene)
  const wingR = MeshBuilder.CreateBox('wingR', { width: 2.0, height: 0.15, depth: 0.8 }, scene)
  wingL.position.x = -1.6
  wingR.position.x =  1.6
  wingL.parent = birdBody
  wingR.parent = birdBody

  const birdMat = new StandardMaterial('birdMat', scene)
  birdMat.diffuseColor = new Color3(0.9, 0.75, 0.2)
  birdMat.specularColor = new Color3(0.1, 0.1, 0.1)
  birdBody.material = birdMat
  wingL.material = birdMat
  wingR.material = birdMat

  // Camera
  const springCam = new SpringCamera(scene, canvas)
  scene.activeCamera = springCam.getCamera()

  // Input
  const input = new InputManager()

  // Flight state — spawn above center
  const flight = createFlightState(0, 30, -20)

  // Network
  const net = new WebSocketClient()
  net.connect()

  // Game loop
  let last = performance.now()
  engine.runRenderLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    const inp = input.get()
    tickFlight(flight, inp, dt, terrainY)
    springCam.update(flight, dt)

    // Wing flap animation
    const flapAnim = flight.timeSinceLastFlap < 0.15
      ? Math.sin(now * 0.05) * 0.5
      : 0
    wingL.rotation.z =  0.2 + flapAnim
    wingR.rotation.z = -0.2 - flapAnim

    // Sync bird mesh
    birdBody.position.set(flight.position.x, flight.position.y, flight.position.z)
    birdBody.rotation.y = flight.yaw
    birdBody.rotation.x = flight.pitch * 0.6
    birdBody.rotation.z = -flight.bank * 0.5

    // Network
    net.sendMove({
      x: flight.position.x,
      y: flight.position.y,
      z: flight.position.z,
      rotY: flight.yaw,
      name: 'player',
      role: 'bird',
      speed: flight.speed,
    }, now)

    scene.render()
  })

  window.addEventListener('resize', () => engine.resize())
}

main()
