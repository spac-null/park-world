import type { FlightState, InputState } from '../types'
import { PHYSICS } from '../config'

export function createFlightState(x = 0, y = 20, z = 0): FlightState {
  return {
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, bank: 0,
    speed: 0,
    landed: false,
    tumbling: false,
    tumbleTimer: 0,
    timeSinceLastFlap: 999,
    isGliding: false,
    coyoteTimer: 0,
  }
}

export function tickFlight(state: FlightState, input: InputState, dt: number, terrainY: (x: number, z: number) => number, _camYaw = 0): void {
  if (state.tumbling) {
    tickTumble(state, dt, terrainY)
    return
  }

  const p = PHYSICS

  // --- Orientation ---
  if (!state.landed) {
    const rawBankInput = input.bankLeft ? 1 : input.bankRight ? -1 : 0
    const rawPitchInput = input.pitchUp ? -1 : input.pitchDown ? 1 : 0

    // Direct bird-frame input — no camera mixing (prevents nose-up when banking)
    const joyBank  = Math.abs(input.joyX) > 0.3 ? input.joyX  : rawBankInput
    const joyPitch = Math.abs(input.joyY) > 0.3 ? -input.joyY : rawPitchInput

    state.bank  += joyBank  * p.BANK_RATE  * dt
    state.pitch += joyPitch * p.PITCH_RATE * dt
    state.bank  = clamp(state.bank,  -p.MAX_BANK,  p.MAX_BANK)
    state.pitch = clamp(state.pitch, -p.MAX_PITCH, p.MAX_PITCH)

    // Bank decays toward 0 when no input
    if (rawBankInput === 0 && Math.abs(input.joyX) < 0.1) {
      state.bank *= (1 - 4 * dt)
    }
    // Pitch decays toward 0 slowly
    if (rawPitchInput === 0 && Math.abs(input.joyY) < 0.1) {
      state.pitch *= (1 - 2 * dt)
    }

    // Yaw from bank
    state.yaw -= state.bank * p.BANK_TO_YAW * p.TURN_RATE * dt
  }

  // --- Forward vector ---
  const cosYaw   = Math.cos(state.yaw)
  const sinYaw   = Math.sin(state.yaw)
  const cosPitch = Math.cos(state.pitch)
  const sinPitch = Math.sin(state.pitch)

  const fwdX = sinYaw * cosPitch
  const fwdY = -sinPitch
  const fwdZ = cosYaw * cosPitch

  // --- Coyote time: window after leaving ground where flap still gets launch boost ---
  if (state.landed) {
    state.coyoteTimer = p.COYOTE_TIME
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt)
  }

  // --- Flap ---
  state.timeSinceLastFlap += dt
  if (input.flap && state.timeSinceLastFlap >= p.FLAP_COOLDOWN) {
    state.timeSinceLastFlap = 0
    const hasGroundBoost = state.landed || state.coyoteTimer > 0
    const impulse = hasGroundBoost ? p.FLAP_IMPULSE * p.LAUNCH_BOOST : p.FLAP_IMPULSE
    // Upward bias fades when diving — flap pushes in facing direction
    const diveBlend = Math.max(0, -fwdY)
    const upBias = 0.7 * (1 - diveBlend)
    state.velocity.x += fwdX * impulse
    state.velocity.y += (fwdY + upBias) * impulse
    state.velocity.z += fwdZ * impulse
    if (state.landed) state.landed = false
  }

  if (state.landed) return

  // --- Gravity ---
  state.velocity.y -= p.GRAVITY * dt

  // --- Lift ---
  const hSpeed = Math.sqrt(state.velocity.x ** 2 + state.velocity.z ** 2)
  const liftFactor = clamp(hSpeed / p.CRUISE_SPEED, 0, 1.2) ** 2
  const lift = p.GRAVITY * p.LIFT_COEFFICIENT * liftFactor
  state.velocity.y += lift * dt

  // --- Drag ---
  state.isGliding = state.timeSinceLastFlap > 0.5
  const drag = state.isGliding ? p.GLIDE_DRAG : p.POWERED_DRAG
  state.velocity.x *= (1 - drag * dt)
  state.velocity.z *= (1 - drag * dt)
  state.velocity.y *= (1 - drag * 0.3 * dt)

  // --- Velocity carving: horizontal ---
  const hSpeed2 = Math.sqrt(state.velocity.x ** 2 + state.velocity.z ** 2)
  if (hSpeed2 > 0.5) {
    const carveRate = state.isGliding ? 1.5 : 2.5
    state.velocity.x += (fwdX * hSpeed2 - state.velocity.x) * carveRate * dt
    state.velocity.z += (fwdZ * hSpeed2 - state.velocity.z) * carveRate * dt
  }

  // --- Pull-up carving: redirect speed upward when pitched up ---
  // Lets bird recover from dives — faster dive = stronger pull-up force
  if (fwdY > 0.1 && state.speed > 3) {
    state.velocity.y += (fwdY * state.speed - state.velocity.y) * 3.0 * dt
  }

  // --- Speed cap ---
  state.speed = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2 + state.velocity.z ** 2)
  if (state.speed > p.MAX_SPEED) {
    const scale = p.MAX_SPEED / state.speed
    state.velocity.x *= scale
    state.velocity.y *= scale
    state.velocity.z *= scale
    state.speed = p.MAX_SPEED
  }

  // --- Integrate position ---
  state.position.x += state.velocity.x * dt
  state.position.y += state.velocity.y * dt
  state.position.z += state.velocity.z * dt

  // --- Terrain collision ---
  const ground = terrainY(state.position.x, state.position.z) + 0.4
  if (state.position.y < ground) {
    state.position.y = ground
    const impactSpeed = -state.velocity.y

    if (impactSpeed > p.BOUNCE_HARD_THRESHOLD) {
      // Crash
      state.velocity.x *= 0.5
      state.velocity.y = impactSpeed * p.BOUNCE_RESTITUTION
      state.velocity.z *= 0.5
      triggerTumble(state)
    } else if (impactSpeed > p.BOUNCE_GENTLE_THRESHOLD) {
      // Hard land
      state.velocity.y = impactSpeed * p.BOUNCE_RESTITUTION * 0.5
      state.velocity.x *= 0.6
      state.velocity.z *= 0.6
    } else {
      // Gentle land
      state.landed = true
      state.velocity.x = 0
      state.velocity.y = 0
      state.velocity.z = 0
      state.pitch = 0
      state.bank = 0
      state.speed = 0
    }
  }

  // --- Spire collision (cylinder at origin, radius 7, height 60) ---
  const distToSpire = Math.sqrt(state.position.x ** 2 + state.position.z ** 2)
  const spireRadius = 7
  if (distToSpire < spireRadius && state.position.y < 60) {
    if (distToSpire > 0) {
      const nx = state.position.x / distToSpire
      const nz = state.position.z / distToSpire
      state.position.x = nx * spireRadius
      state.position.z = nz * spireRadius
      const vDotN = state.velocity.x * nx + state.velocity.z * nz
      if (vDotN < 0) {
        state.velocity.x -= vDotN * nx * (1 + p.WALL_RESTITUTION)
        state.velocity.z -= vDotN * nz * (1 + p.WALL_RESTITUTION)
      }
    }
  }

  // --- Rim wall boundary (soft push back inside radius 185) ---
  const rimLimit = 185
  const distFromCenter = Math.sqrt(state.position.x ** 2 + state.position.z ** 2)
  if (distFromCenter > rimLimit) {
    const nx = state.position.x / distFromCenter
    const nz = state.position.z / distFromCenter
    state.position.x = nx * rimLimit
    state.position.z = nz * rimLimit
    const vDotN = state.velocity.x * nx + state.velocity.z * nz
    if (vDotN > 0) {
      state.velocity.x -= vDotN * nx * (1 + p.WALL_RESTITUTION)
      state.velocity.z -= vDotN * nz * (1 + p.WALL_RESTITUTION)
    }
  }
}

function triggerTumble(state: FlightState) {
  state.tumbling = true
  state.tumbleTimer = PHYSICS.TUMBLE_DURATION
  // Freeze on crash — N64 stun
  state.velocity.x = 0
  state.velocity.y = 0
  state.velocity.z = 0
  state.pitch = 0
  state.bank  = 0
}

function tickTumble(state: FlightState, dt: number, terrainY: (x: number, z: number) => number) {
  state.tumbleTimer -= dt

  // Keep above terrain while stunned
  const ground = terrainY(state.position.x, state.position.z) + 0.4
  if (state.position.y < ground) state.position.y = ground

  if (state.tumbleTimer <= 0) {
    state.tumbling = false
    state.tumbleTimer = 0
    // Pop slightly above terrain on recovery so bird can take off
    state.position.y = terrainY(state.position.x, state.position.z) + 3
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
