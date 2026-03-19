import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight,
  Color3, Color4, Quaternion, ParticleSystem, DynamicTexture,
  ShadowGenerator,
} from '@babylonjs/core'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { InputManager } from './engine/InputManager'
import { SpringCamera } from './camera/SpringCamera'
import { createFlightState, tickFlight } from './physics/FlightPhysics'
import { WorldBuilder, terrainY } from './world/WorldBuilder'
import { createBirdMesh, getWings } from './world/BirdMesh'
import { RemotePlayers } from './network/RemotePlayers'
import { WebSocketClient } from './network/WebSocketClient'
import { CAMERA, PHYSICS } from './config'

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
  })
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio * 0.75, 1.5))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.54, 0.74, 0.91, 1)  // matches sky horizon
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.005
  scene.fogColor = new Color3(0.54, 0.74, 0.91)

  // Lights
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene)
  sun.intensity = 1.2
  sun.diffuse = new Color3(1, 0.98, 0.90)
  sun.position = new Vector3(100, 200, 100)  // needed for shadow frustum
  const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene)
  amb.intensity = 0.7
  amb.diffuse = new Color3(0.55, 0.60, 0.65)

  // Shadow map — soft exponential, 1024px
  // N64 faked shadows with blob decals; we get real per-pixel shadows for free
  const shadowGen = new ShadowGenerator(1024, sun)
  shadowGen.useBlurExponentialShadowMap = true
  shadowGen.blurKernel = 16
  shadowGen.darkness = 0.35  // soft, not pitch black

  // World
  const world = new WorldBuilder(scene)
  world.build()

  // Mark key structures as shadow casters, terrain as receiver
  const casterNames = ['spire', 'rimN', 'rimE', 'rimS', 'rimW',
    'pillar0', 'pillar1', 'pillar2', 'pillar3',
    'arch0', 'arch1', 'arch2']
  for (const name of casterNames) {
    const m = scene.getMeshByName(name)
    if (m) shadowGen.addShadowCaster(m)
  }
  const terrain = scene.getMeshByName('terrain')
  if (terrain) terrain.receiveShadows = true

  // Player bird mesh — N64-style chunky bird, warm gold
  const birdRoot = createBirdMesh(scene, new Color3(0.9, 0.75, 0.2), 'bird')
  for (const m of birdRoot.getChildMeshes()) shadowGen.addShadowCaster(m)
  const [wingL, wingR] = getWings(birdRoot)

  // Camera
  const springCam = new SpringCamera(scene, canvas)
  scene.activeCamera = springCam.getCamera()

  // Post-processing — bloom + FXAA + warm color grade
  // Hardware equivalent of this didn't exist until PS3/Xbox 360 era
  const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [springCam.getCamera()])
  pipeline.fxaaEnabled = true
  pipeline.bloomEnabled = true
  pipeline.bloomThreshold = 0.55
  pipeline.bloomWeight = 0.25
  pipeline.bloomKernel = 48
  pipeline.bloomScale = 0.5
  pipeline.imageProcessingEnabled = true
  pipeline.imageProcessing.contrast = 1.08
  pipeline.imageProcessing.exposure = 1.05
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 2.0
  pipeline.imageProcessing.vignetteCameraFov = 0.6

  // Input
  const input = new InputManager()

  // Flight state — spawn above center
  const flight = createFlightState(0, 30, -20)

  // Squash/stretch state for landing
  let squashTimer = 0
  let bobPhase = 0

  // Landing dust particles
  const dustTex = new DynamicTexture('dustTex', { width: 16, height: 16 }, scene, false)
  const dtx = dustTex.getContext()
  const grd = dtx.createRadialGradient(8, 8, 0, 8, 8, 8)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  dtx.fillStyle = grd
  dtx.fillRect(0, 0, 16, 16)
  dustTex.update()

  const dustSystem = new ParticleSystem('dust', 40, scene)
  dustSystem.particleTexture = dustTex
  dustSystem.emitter = new Vector3(0, 0, 0)
  dustSystem.minSize = 0.2
  dustSystem.maxSize = 0.7
  dustSystem.minLifeTime = 0.25
  dustSystem.maxLifeTime = 0.5
  dustSystem.emitRate = 800
  dustSystem.targetStopDuration = 0.05
  dustSystem.disposeOnStop = false
  dustSystem.minEmitPower = 2
  dustSystem.maxEmitPower = 5
  dustSystem.direction1 = new Vector3(-1, 0.5, -1)
  dustSystem.direction2 = new Vector3(1, 1.5, 1)
  dustSystem.color1 = new Color4(0.85, 0.70, 0.45, 1)
  dustSystem.color2 = new Color4(0.65, 0.52, 0.32, 0.8)
  dustSystem.colorDead = new Color4(0.5, 0.4, 0.3, 0)
  dustSystem.gravity = new Vector3(0, -6, 0)

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
    const wasLanded = flight.landed
    tickFlight(flight, inp, dt, terrainY, camYaw)
    if (!wasLanded && flight.landed) {
      squashTimer = 0.25
      // Dust burst on landing
      ;(dustSystem.emitter as Vector3).copyFromFloats(flight.position.x, flight.position.y, flight.position.z)
      dustSystem.reset()
      dustSystem.start()
    }
    springCam.update(flight, dt)

    // FOV speed feedback: lerp between 65 (normal) and 75 (max speed)
    const { MAX_SPEED } = PHYSICS
    const speedFrac = Math.min(flight.speed / MAX_SPEED, 1)
    const targetFov = CAMERA.DEFAULT_FOV + (75 - CAMERA.DEFAULT_FOV) * speedFrac
    const currentFovDeg = (springCam.getCamera() as any).fov * 180 / Math.PI
    const newFovDeg = currentFovDeg + (targetFov - currentFovDeg) * Math.min(3 * dt, 1)
    springCam.setFov(newFovDeg)

    // Wing flap animation
    if (wingL && wingR) {
      const flapAnim = flight.timeSinceLastFlap < 0.15
        ? Math.sin((flight.timeSinceLastFlap / 0.15) * Math.PI) * 0.5
        : 0
      wingL.rotation.z =  0.18 + flapAnim
      wingR.rotation.z = -0.18 - flapAnim
    }

    // Flight bob — fades out after last flap so movement doesn't echo
    const bobFreq = 2.0 + flight.speed * 0.05
    bobPhase += bobFreq * dt * Math.PI * 2
    const bobFade = Math.max(0, 1 - Math.max(0, flight.timeSinceLastFlap - 0.3) / 0.4)
    const bobAmp  = flight.landed ? 0 : Math.min(flight.speed / 14, 1) * 0.18 * bobFade
    const bob = Math.sin(bobPhase) * bobAmp

    squashTimer = Math.max(0, squashTimer - dt)
    const squashT = squashTimer / 0.25
    const squashY = 1 - squashT * 0.35        // compress Y
    const squashXZ = 1 + squashT * 0.2        // expand XZ

    // N64 crash flicker — rapid visibility toggle while stunned (root is TransformNode, toggle children)
    const flickerOn = !flight.tumbling || Math.floor(now / 70) % 2 === 0
    for (const m of birdRoot.getChildMeshes()) m.isVisible = flickerOn

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
