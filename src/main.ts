import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight,
  Color3, Color4, Quaternion, ParticleSystem, DynamicTexture,
  ShadowGenerator,
} from '@babylonjs/core'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline'
import { InputManager } from './engine/InputManager'
import { SpringCamera } from './camera/SpringCamera'
import { createFlightState, tickFlight, triggerTumble } from './physics/FlightPhysics'
import { WorldBuilder, terrainY } from './world/WorldBuilder'
import { loadNatureAssets } from './world/AssetLoader'
import { createBirdMesh, getWings } from './world/BirdMesh'
import { NpcFlock } from './world/NpcFlock'
import { TraceManager } from './world/TraceManager'
import { RemotePlayers } from './network/RemotePlayers'
import { WebSocketClient } from './network/WebSocketClient'
import { ChatInput } from './ui/ChatInput'
import { askName } from './ui/NameInput'
import { DayNightCycle } from './world/DayNightCycle'
import { SpireReward } from './world/SpireReward'
import { GemManager, GEM_TOTAL } from './world/GemManager'
import { EggManager } from './weapons/EggManager'
import { RocketManager } from './weapons/RocketManager'
import { CAMERA, PHYSICS, WORLD } from './config'

async function main() {
  const glideMode = new URLSearchParams(window.location.search).has('glide')
  const myName = await askName()

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

  // Day/night cycle — starts at t=0.35 (midday)
  const dayNight = new DayNightCycle(scene, sun, amb)

  // Shadow map — soft exponential, 1024px
  // N64 faked shadows with blob decals; we get real per-pixel shadows for free
  const shadowGen = new ShadowGenerator(1024, sun)
  shadowGen.useBlurExponentialShadowMap = true
  shadowGen.blurKernel = 16
  shadowGen.darkness = 0.35  // soft, not pitch black

  // World (sync structure first, Kenney assets async after)
  const world = new WorldBuilder(scene)
  world.build()
  loadNatureAssets(scene)
    .then(assets => world.buildNature(assets))
    .catch(e => console.warn('Asset load failed:', e))

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
  input.bindMobileButton('btn-flap',   'flap')
  input.bindMobileButton('btn-egg',    'egg')
  input.bindMobileButton('btn-rocket', 'rocket')

  // Flight state — spawn above center
  const flight = createFlightState(0, 30, -20)
  let autoFlapTimer = 0
  springCam.snap(flight)  // instant correct height — prevents first-frame upward-look (terrain backface culled)

  // Squash/stretch state for landing
  let squashTimer = 0
  let bobPhase = 0

  // Body inertia roll — underdamped spring, overshoots opposite direction on bank
  let visualRoll = 0
  let rollVel    = 0
  const ROLL_SPRING  = 18   // stiffness
  const ROLL_DAMPING = 5    // < 2*sqrt(18)≈8.5 → underdamped → overshoot

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

  // NPC flock — 8 birds, home zones + scatter on flythrough
  const npcFlock = new NpcFlock(scene, 8)

  // Spire top reward — pulsing ring + first-arrival flash
  const spireReward = new SpireReward(scene)

  // Gems — 5 hidden collectibles, localStorage persistence
  const gemManager = new GemManager(scene)
  gemManager.onCollect = (idx) => {
    net.send({ type: 'gem', fromId: '', fromName: myName, idx })
  }

  // Pre-computed FOV constants — work in radians, skip deg↔rad every frame
  const FOV_DEFAULT_RAD = CAMERA.DEFAULT_FOV * Math.PI / 180
  const FOV_MAX_RAD     = CAMERA.DIVE_FOV * Math.PI / 180

  // Cache bird child meshes — avoid getChildMeshes() allocation every frame
  const birdChildMeshes = birdRoot.getChildMeshes()
  let   birdWasVisible  = true

  // Pre-init rotation quaternion on bird root — RotationYawPitchRollToRef writes in-place
  birdRoot.rotationQuaternion = new Quaternion()

  // Reusable network move object — avoids alloc when below send interval
  const _moveMsg = { x: 0, y: 0, z: 0, rotY: 0, name: myName, role: 'bird' as const, speed: 0 }

  // Remote players + traces
  const remotePlayers = new RemotePlayers(scene)
  const traceManager = new TraceManager(scene)

  // Network
  const net = new WebSocketClient()

  // Weapons
  const eggManager = new EggManager(scene, net)
  const rocketManager = new RocketManager(scene, net)
  let myColor = '#88aaff'

  net.on('welcome', (msg: any) => {
    if (msg.color) myColor = msg.color
    if (msg.id) { eggManager.setMyId(msg.id); rocketManager.setMyId(msg.id) }
    if (msg.players) {
      for (const p of msg.players) {
        remotePlayers.add(p.id, p.name || 'bird', p.color || '#aaaaaa')
        remotePlayers.update(p.id, p.x ?? 0, p.y ?? 20, p.z ?? 0, p.rotY ?? 0)
      }
    }
    if (msg.recent_traces) {
      for (const t of msg.recent_traces) {
        traceManager.drop(t.x, t.y, t.z, t.text, t.color || '#88aaff', t.name || 'bird')
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

  net.on('trace', (msg: any) => {
    traceManager.drop(msg.x, msg.y, msg.z, msg.text, msg.color, msg.name)
  })

  net.on('egg', (msg: any) => {
    eggManager.addRemote(msg.x, msg.y, msg.z, msg.vx, msg.vy, msg.vz, msg.fromId)
  })

  net.on('rocket', (msg: any) => {
    rocketManager.addRemote(msg.x, msg.y, msg.z, msg.vx, msg.vy, msg.vz, msg.fromId)
  })

  net.on('gem', (_msg: any) => {
    // Another player collected a gem — brief flash + HUD hint
    const el = document.getElementById('flash')
    if (el) {
      el.style.background = 'rgba(255,255,200,0.3)'
      el.style.opacity = '0.4'
      setTimeout(() => { el.style.opacity = '0'; el.style.background = '#fff' }, 300)
    }
  })

  // Chat — T to open, Enter to drop trace at current position
  const chatInput = new ChatInput(input, (text) => {
    const { x, y, z } = flight.position
    traceManager.drop(x, y, z, text, myColor, myName)
    net.send({ type: 'trace', x, y, z, text, color: myColor, name: myName })
  })

  window.addEventListener('keydown', e => {
    if (e.code === 'KeyT' && !chatInput.active) { e.preventDefault(); chatInput.open() }
    if (e.code === 'Escape' && chatInput.active) chatInput.close()
  })

  net.connect()

  const hud = document.getElementById('hud')!
  let hudFrame = 0

  function timeLabel(t: number): string {
    if (t >= 0.87 && t < 0.94) return 'night'
    if (t >= 0.94) return 'dawn'
    if (t < 0.70) return 'day'
    if (t < 0.80) return 'afternoon'
    return 'dusk'
  }

  let hintTimer = glideMode ? 10 : 0

  // Game loop
  let last = performance.now()
  engine.runRenderLoop(() => {
    const now = performance.now()
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now

    const inp = chatInput.active
      ? { pitchUp:false, pitchDown:false, bankLeft:false, bankRight:false, flap:false, egg:false, rocket:false, chat:false, joyX:0, joyY:0 }
      : input.get()

    if (glideMode && hintTimer > 0) hintTimer -= dt

    // Glide mode — auto-flap so daughter only needs to steer
    if (glideMode) {
      autoFlapTimer -= dt
      if (autoFlapTimer <= 0) {
        inp.flap = true
        autoFlapTimer = 0.55
      }
    }

    // Weapon fire
    if (inp.egg && !chatInput.active) {
      eggManager.fire(flight.position.x, flight.position.y, flight.position.z, flight.yaw, flight.pitch)
    }
    if (inp.rocket && !chatInput.active) {
      rocketManager.fire(flight.position.x, flight.position.y, flight.position.z, flight.yaw, flight.pitch)
    }

    const camYaw = springCam.getCamYaw()
    const wasLanded = flight.landed
    tickFlight(flight, inp, dt, terrainY, camYaw)
    // While typing: gentle float so bird doesn't nosedive into floor
    if (chatInput.active && !flight.landed && flight.velocity.y < 0) {
      flight.velocity.y += PHYSICS.GRAVITY * 0.7 * dt
    }
    if (!wasLanded && flight.landed) {
      squashTimer = 0.25
      // Dust burst on landing
      ;(dustSystem.emitter as Vector3).copyFromFloats(flight.position.x, flight.position.y, flight.position.z)
      dustSystem.reset()
      dustSystem.start()
    }
    springCam.update(flight, dt)

    // FOV speed feedback — radians throughout, no deg↔rad conversions
    const speedFrac   = Math.min(flight.speed / PHYSICS.MAX_SPEED, 1)
    const targetFovRad = FOV_DEFAULT_RAD + (FOV_MAX_RAD - FOV_DEFAULT_RAD) * speedFrac
    springCam.setFovRad(springCam.getFovRad() + (targetFovRad - springCam.getFovRad()) * Math.min(3 * dt, 1))

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

    // N64 crash flicker — skip loop when not tumbling (common case)
    if (flight.tumbling) {
      const flickerOn = Math.floor(now / 70) % 2 === 0
      if (flickerOn !== birdWasVisible) {
        for (const m of birdChildMeshes) m.isVisible = flickerOn
        birdWasVisible = flickerOn
      }
    } else if (!birdWasVisible) {
      for (const m of birdChildMeshes) m.isVisible = true
      birdWasVisible = true
    }

    // Sync bird mesh
    birdRoot.position.set(
      flight.position.x,
      flight.position.y + bob,
      flight.position.z,
    )
    // Body inertia spring — overshoots opposite bank direction on input change
    const targetRoll = -flight.bank * 0.5
    const rollForce  = (targetRoll - visualRoll) * ROLL_SPRING - rollVel * ROLL_DAMPING
    rollVel    += rollForce * dt
    visualRoll += rollVel * dt

    Quaternion.RotationYawPitchRollToRef(
      flight.yaw, flight.pitch * 0.6, visualRoll,
      birdRoot.rotationQuaternion!,
    )
    birdRoot.scaling.set(squashXZ, squashY, squashXZ)

    // Day/night cycle
    dayNight.tick(dt)

    // Traces
    traceManager.tick(dt)

    // NPC flock — pass scalars, no Vector3 alloc
    npcFlock.tick(dt, flight.position.x, flight.position.y, flight.position.z, flight.yaw, now)

    // Spire reward — pass how many remote players are also at the top
    const remoteAtSpire = remotePlayers.countNear(WORLD.SPIRE_X, WORLD.SPIRE_Z, 225, WORLD.SPIRE_HEIGHT - 6)
    spireReward.tick(dt, flight.position.x, flight.position.y, flight.position.z, remoteAtSpire)

    // Gems
    gemManager.tick(dt, flight.position.x, flight.position.y, flight.position.z)

    // Eggs — onHit triggers local tumble
    eggManager.tick(dt, flight.position.x, flight.position.y, flight.position.z, () => {
      triggerTumble(flight)
    })

    // Rockets — AOE on terrain impact + direct hit both trigger tumble
    rocketManager.tick(dt, flight.position.x, flight.position.y, flight.position.z, () => {
      triggerTumble(flight)
    })

    // Remote players
    remotePlayers.tick(dt)

    // Network — reuse object, WebSocketClient throttles internally
    _moveMsg.x = flight.position.x; _moveMsg.y = flight.position.y; _moveMsg.z = flight.position.z
    _moveMsg.rotY = flight.yaw; _moveMsg.speed = flight.speed
    net.sendMove(_moveMsg, now)

    // HUD — throttled to every 10 frames, no 60fps DOM writes
    if (++hudFrame % 10 === 0) {
      const lines: string[] = []
      if (!flight.landed && flight.speed > 2)
        lines.push(`spd ${Math.round(flight.speed)}`)
      if (flight.position.y > 8)
        lines.push(`alt ${Math.floor(flight.position.y)}`)
      lines.push(timeLabel(dayNight.getT()))
      const gems = gemManager.getCount()
      if (gems > 0) lines.push(`gems ${gems}/${GEM_TOTAL}`)
      if (glideMode && hintTimer > 0) lines.push('fly to the glowing beams!')
      if (glideMode) lines.push('glide')
      hud.textContent = lines.join('\n')
    }

    scene.render()
  })

  window.addEventListener('resize', () => engine.resize())
}

main()
