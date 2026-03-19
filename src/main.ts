import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight,
  Color3, Color4, Quaternion,
} from '@babylonjs/core'
import { InputManager } from './engine/InputManager'
import { SpringCamera } from './camera/SpringCamera'
import { createFlightState, tickFlight } from './physics/FlightPhysics'
import { WorldBuilder, terrainY } from './world/WorldBuilder'
import { createBirdMesh, getWings } from './world/BirdMesh'
import { RemotePlayers } from './network/RemotePlayers'
import { WebSocketClient } from './network/WebSocketClient'
import { CAMERA } from './config'

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

  // Player bird mesh — N64-style chunky bird, warm gold
  const birdRoot = createBirdMesh(scene, new Color3(0.9, 0.75, 0.2), 'bird')
  const [wingL, wingR] = getWings(birdRoot)

  // Camera
  const springCam = new SpringCamera(scene, canvas)
  scene.activeCamera = springCam.getCamera()

  // Input
  const input = new InputManager()

  // Flight state — spawn above center
  const flight = createFlightState(0, 30, -20)

  // Squash/stretch state for landing
  let squashTimer = 0

  // Remote players
  const remotePlayers = new RemotePlayers(scene)

  // Network
  const net = new WebSocketClient()

  net.on('welcome', (msg: any) => {
    if (msg.players) {
      for (const p of msg.players) {
        remotePlayers.add(p.id, p.name || 'bird', p.color || '#aaaaaa')
        remotePlayers.update(p.id, p.x ?? 0, p.y ?? 20, p.z ?? 0, p.rotY ?? 0)
      }
    }
  })

  net.on('join', (msg: any) => {
    remotePlayers.add(msg.id, msg.name || 'bird', msg.color || '#aaaaaa')
  })

  net.on('update', (msg: any) => {
    remotePlayers.update(msg.id, msg.x, msg.y, msg.z, msg.rotY)
  })

  net.on('leave', (msg: any) => {
    remotePlayers.remove(msg.id)
  })

  net.connect()

  // Game loop
  let last = performance.now()
  engine.runRenderLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    const inp = input.get()
    const camYaw = springCam.getCamYaw()
    tickFlight(flight, inp, dt, terrainY, camYaw)
    springCam.update(flight, dt)

    // FOV speed feedback: lerp between 65 (normal) and 75 (max speed)
    const { MAX_SPEED } = { MAX_SPEED: 28 }
    const speedFrac = Math.min(flight.speed / MAX_SPEED, 1)
    const targetFov = CAMERA.DEFAULT_FOV + (75 - CAMERA.DEFAULT_FOV) * speedFrac
    const currentFovDeg = (springCam.getCamera() as any).fov * 180 / Math.PI
    const newFovDeg = currentFovDeg + (targetFov - currentFovDeg) * Math.min(3 * dt, 1)
    springCam.setFov(newFovDeg)

    // Wing flap animation
    if (wingL && wingR) {
      const flapAnim = flight.timeSinceLastFlap < 0.15
        ? Math.sin(now * 0.05) * 0.5
        : 0
      wingL.rotation.z =  0.18 + flapAnim
      wingR.rotation.z = -0.18 - flapAnim
    }

    // Flight bob — organic oscillation at cruise, scales with speed
    const bobFreq = 2.0 + flight.speed * 0.05
    const bobAmp  = flight.landed ? 0 : Math.min(flight.speed / 14, 1) * 0.18
    const bob = Math.sin(now * 0.001 * bobFreq * Math.PI * 2) * bobAmp

    // Landing squash — detect touchdown, play squash/stretch
    const wasLanded = flight.landed
    if (wasLanded && squashTimer <= 0) squashTimer = 0
    if (!wasLanded && flight.landed) squashTimer = 0.25   // just landed
    squashTimer = Math.max(0, squashTimer - dt)
    const squashT = squashTimer / 0.25
    const squashY = 1 - squashT * 0.35        // compress Y
    const squashXZ = 1 + squashT * 0.2        // expand XZ

    // Sync bird mesh
    birdRoot.position.set(
      flight.position.x,
      flight.position.y + bob,
      flight.position.z,
    )
    birdRoot.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      flight.yaw,
      flight.pitch * 0.6,
      -flight.bank * 0.5,
    )
    birdRoot.scaling.set(squashXZ, squashY, squashXZ)

    // Remote players
    remotePlayers.tick(dt)

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
