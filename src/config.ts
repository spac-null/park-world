// All tuning constants — change here, affects everything

export const PHYSICS = {
  GRAVITY: 9.8,
  MAX_SPEED: 28,
  CRUISE_SPEED: 14,
  STALL_SPEED: 4,
  FLAP_IMPULSE: 8.0,
  FLAP_COOLDOWN: 0.22,
  GLIDE_DRAG: 0.35,
  POWERED_DRAG: 0.55,
  LIFT_COEFFICIENT: 0.65,
  TURN_RATE: 2.8,
  BANK_RATE: 3.5,
  PITCH_RATE: 2.2,
  MAX_BANK: 1.1,
  MAX_PITCH: 1.0,
  BANK_TO_YAW: 0.85,
  LAUNCH_BOOST: 1.5,      // flap impulse multiplier on takeoff
  BOUNCE_HARD_THRESHOLD: 14,
  BOUNCE_GENTLE_THRESHOLD: 3,
  BOUNCE_RESTITUTION: 0.3,
  WALL_RESTITUTION: 0.4,
  TUMBLE_DURATION: 0.8,
  COYOTE_TIME: 0.12,
}

export const CAMERA = {
  ARM_LENGTH: 12,
  ARM_HEIGHT: 4,
  LOOK_AHEAD: 6,
  SPRING_STIFFNESS: 8.0,
  SPRING_DAMPING: 0.85,
  DIVE_ARM_EXTEND: 3,
  DIVE_FOV: 72,
  DEFAULT_FOV: 65,
  MIN_ARM_LENGTH: 4,      // minimum when inside tight space
  ANTICIPATION_STRENGTH: 3.0,
  LOOK_AHEAD_PITCH_SCALE: 4.0,
}

export const WORLD = {
  RADIUS: 200,
  RIM_HEIGHT: 80,
  SKY_CEILING: 120,
  SPIRE_HEIGHT: 60,
  SPIRE_X: 0,
  SPIRE_Z: 0,
  FOG_DENSITY_DAY: 0.006,
  FOG_DENSITY_NIGHT: 0.012,
}

export const NETWORK = {
  WS_URL: 'wss://park.jaschablume.nl',
  SEND_INTERVAL: 100,     // ms between move sends
}

export const WEAPONS = {
  EGG_COOLDOWN: 1.5,
  ROCKET_COOLDOWN: 8.0,
  EGG_SPEED: 18,
  ROCKET_SPEED: 40,
  EGG_AOE: 6.0,
  ROCKET_AOE: 10.0,
  TUMBLE_ON_HIT: 0.5,
  KNOCKBACK_FORCE: 12,
}

export const DAY_NIGHT = {
  CYCLE_DURATION: 120,    // seconds per full cycle
}
