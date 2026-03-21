import {
  Engine, Scene, Vector3, HemisphericLight, DirectionalLight,
  Color3, Color4, Quaternion, ParticleSystem, DynamicTexture,
  ShadowGenerator, ColorCurves,
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
import { NoteManager, NOTE_TOTAL } from './world/NoteManager'
import { ZoneManager } from './world/ZoneManager'
import { ZoneMusicPlayer } from './world/ZoneMusicPlayer'
import { EggManager } from './weapons/EggManager'
import { RocketManager } from './weapons/RocketManager'
import { GEM_COLORS } from './world/GemManager'
import { CAMERA, PHYSICS, WORLD } from './config'

async function main() {
  const glideMode = new URLSearchParams(window.location.search).has('glide')
  // Glide mode always starts fresh — child gets all beams every session
  if (glideMode) localStorage.removeItem('park-world-gems')
  const myName = await askName()

  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
  })
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio * 0.75, 1.5))

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.54, 0.74, 0.91, 1)
  // Linear fog — zero fog inside 130 units, fully fogged at 200
  // EXP2 grays out nearby objects; LINEAR keeps them vivid
  scene.fogMode = Scene.FOGMODE_LINEAR
  scene.fogStart = 130
  scene.fogEnd = 200
  scene.fogColor = new Color3(0.54, 0.74, 0.91)
  // Warm fill for PBR materials (Kenney GLBs) — multiplied with mat.ambientColor
  scene.ambientColor = new Color3(0.82, 0.75, 0.60)

  // Lights
  const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.5), scene)
  sun.intensity = 1.4
  sun.diffuse = new Color3(1, 0.94, 0.78)   // warm golden sun
  sun.position = new Vector3(100, 200, 100)
  const amb = new HemisphericLight('amb', new Vector3(0, 1, 0), scene)
  amb.intensity = 0.55
  amb.diffuse = new Color3(0.78, 0.70, 0.52)  // warm golden ambient, not cold gray

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
  pipeline.imageProcessing.contrast = 1.2
  pipeline.imageProcessing.exposure = 1.1
  pipeline.imageProcessing.colorCurvesEnabled = true
  const curves = new ColorCurves()
  curves.globalSaturation = 28   // punch up colors — world should feel vivid
  pipeline.imageProcessing.colorCurves = curves
  pipeline.imageProcessing.vignetteEnabled = true
  pipeline.imageProcessing.vignetteWeight = 1.5
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

  // Collect spin animation — triggered by gem or note grab
  let collectSpinTimer = 0

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

  // Rainbow burst — all-gems payoff, 200 particles
  const rainbowBurst = new ParticleSystem('rainbow', 200, scene)
  rainbowBurst.particleTexture = dustTex   // reuse radial gradient
  rainbowBurst.emitter = new Vector3(0, 0, 0)
  rainbowBurst.minSize = 0.3; rainbowBurst.maxSize = 1.2
  rainbowBurst.minLifeTime = 0.8; rainbowBurst.maxLifeTime = 1.5
  rainbowBurst.emitRate = 2000
  rainbowBurst.targetStopDuration = 0.1
  rainbowBurst.disposeOnStop = false
  rainbowBurst.minEmitPower = 8; rainbowBurst.maxEmitPower = 20
  rainbowBurst.direction1 = new Vector3(-1, 1, -1)
  rainbowBurst.direction2 = new Vector3(1, 2, 1)
  rainbowBurst.gravity = new Vector3(0, -5, 0)
  rainbowBurst.addColorGradient(0,   new Color4(1, 0.2, 0.2, 1))
  rainbowBurst.addColorGradient(0.2, new Color4(1, 0.8, 0,   1))
  rainbowBurst.addColorGradient(0.4, new Color4(0.2, 1, 0.2, 1))
  rainbowBurst.addColorGradient(0.6, new Color4(0.2, 0.5, 1, 1))
  rainbowBurst.addColorGradient(0.8, new Color4(0.8, 0.2, 1, 1))
  rainbowBurst.addColorGradient(1,   new Color4(1, 0.3, 0.3, 0))

  // NPC flock — 8 birds, home zones + scatter on flythrough
  const npcFlock = new NpcFlock(scene, 8)

  // Spire top reward — pulsing ring + first-arrival flash
  const spireReward = new SpireReward(scene)

  // Gems — 5 hidden collectibles, localStorage persistence
  const gemManager = new GemManager(scene)

  // Notes — 60 spinning collectibles, 10 per zone
  const noteManager = new NoteManager(scene, glideMode)

  // Zone color identity + ambient music
  const zoneManager = new ZoneManager(scene)
  const zoneMusicPlayer = new ZoneMusicPlayer(glideMode)
  let gemMessage = ''
  let gemMessageTimer = 0
  const gemPopup = document.getElementById('gem-popup')!
  const flash = document.getElementById('flash')!

  // Web Audio — rising 3-note arpeggio, no audio files needed
  let audioCtx: AudioContext | null = null
  function playCollectSound(idx: number) {
    try {
      if (!audioCtx) audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') audioCtx.resume()
      const ctx = audioCtx
      // Major arpeggio G5→C6→E6, pitch shifts slightly per gem
      const root = 784 * (1 + idx * 0.04)
      const notes = [root, root * 1.336, root * 1.682]
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        const t = ctx.currentTime + i * 0.12
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.4, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
        osc.start(t); osc.stop(t + 0.55)
      })
    } catch (_) {}
  }

  function playFanfare() {
    try {
      if (!audioCtx) audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') audioCtx.resume()
      const ctx = audioCtx
      const chord = [523.25, 659.25, 783.99, 1046.5]  // C5 E5 G5 C6
      // Simultaneous chord
      chord.forEach(freq => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.value = freq
        const t = ctx.currentTime
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.2, t + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5)
        osc.start(t); osc.stop(t + 1.5)
      })
      // Arpeggio after
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'; osc.frequency.value = freq
        const t = ctx.currentTime + 0.2 + i * 0.1
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.3, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
        osc.start(t); osc.stop(t + 0.6)
      })
    } catch (_) {}
  }

  gemManager.onCollect = (idx) => {
    collectSpinTimer = 0.3
    net.send({ type: 'gem', fromId: '', fromName: myName, idx })
    const count = gemManager.getCount()
    playCollectSound(idx)

    if (count === GEM_TOTAL) {
      // All 5 gems — fanfare
      playFanfare()
      gemMessage = `all ${GEM_TOTAL} gems!`
      gemMessageTimer = 4
      gemPopup.textContent = `all ${GEM_TOTAL} gems!`
      gemPopup.style.color = '#ffd700'
      gemPopup.style.opacity = '1'
      gemPopup.style.display = 'block'
      setTimeout(() => { gemPopup.style.opacity = '0' }, 3000)
      setTimeout(() => { gemPopup.style.display = 'none'; gemPopup.style.opacity = '1' }, 3800)
      // Two screen flashes
      flash.style.background = '#fff'; flash.style.opacity = '0.8'
      setTimeout(() => {
        flash.style.opacity = '0'
        setTimeout(() => {
          flash.style.background = 'rgba(255,200,0,0.6)'; flash.style.opacity = '0.8'
          setTimeout(() => { flash.style.opacity = '0'; flash.style.background = '#fff' }, 300)
        }, 200)
      }, 200)
      // Rainbow burst
      ;(rainbowBurst.emitter as Vector3).copyFromFloats(flight.position.x, flight.position.y, flight.position.z)
      rainbowBurst.reset(); rainbowBurst.start()
      spireReward.triggerAllGems()
    } else {
      // Color3.toHexString() already includes '#'
      const color = GEM_COLORS[idx % GEM_COLORS.length].toHexString()
      gemMessage = `gem ${count} of ${GEM_TOTAL}!`
      gemMessageTimer = 3
      gemPopup.textContent = `gem ${count} of ${GEM_TOTAL}!`
      gemPopup.style.color = color
      gemPopup.style.opacity = '1'
      gemPopup.style.display = 'block'
      setTimeout(() => { gemPopup.style.opacity = '0' }, 1200)
      setTimeout(() => { gemPopup.style.display = 'none'; gemPopup.style.opacity = '1' }, 2000)
      flash.style.background = color; flash.style.opacity = '0.5'
      setTimeout(() => { flash.style.opacity = '0'; flash.style.background = '#fff' }, 500)
    }
  }

  noteManager.onCollect = (_idx) => {
    collectSpinTimer = 0.3
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
    if (gemMessageTimer > 0) gemMessageTimer -= dt

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

    // Collect spin — 2 full rotations + 1.4× scale pulse over 0.3s
    collectSpinTimer = Math.max(0, collectSpinTimer - dt)
    const cst = collectSpinTimer / 0.3
    const collectSpinYaw = (1 - cst) * Math.PI * 4
    const collectScale = collectSpinTimer > 0 ? 1 + 0.4 * Math.sin((1 - cst) * Math.PI) : 1

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
      flight.yaw + collectSpinYaw, flight.pitch * 0.6, visualRoll,
      birdRoot.rotationQuaternion!,
    )
    birdRoot.scaling.set(squashXZ * collectScale, squashY * collectScale, squashXZ * collectScale)

    // Day/night cycle
    dayNight.tick(dt)

    // Zone color identity — MUST run after dayNight.tick()
    zoneManager.tick(dt, flight.position.x, flight.position.y, flight.position.z)
    zoneMusicPlayer.tick(dt, zoneManager.getCurrentZoneId())

    // Notes
    noteManager.tick(dt, flight.position.x, flight.position.y, flight.position.z)

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
      const notes = noteManager.getCount()
      if (notes > 0) lines.push(`notes ${notes}/${NOTE_TOTAL}`)
      if (gemMessageTimer > 0) lines.push(gemMessage)
      else if (glideMode && hintTimer > 0) lines.push('fly to the glowing beams!')
      if (glideMode) lines.push('glide')
      hud.textContent = lines.join('\n')
    }

    scene.render()
  })

  window.addEventListener('resize', () => engine.resize())
}

main()
