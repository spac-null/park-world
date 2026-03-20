export interface PlayerState {
  x: number
  y: number
  z: number
  rotY: number
  name: string
  role: 'bird'
  speed: number
  color?: string
}

export interface RemotePlayer {
  id: string
  name: string
  color: string
  state: PlayerState
  targetState: PlayerState
  mesh?: any
  labelMesh?: any
}

export type NetworkMessage =
  | { type: 'welcome'; id: string; color: string; players: any[]; recent_traces: any[] }
  | { type: 'join'; id: string; name: string; color: string; role: string }
  | { type: 'update'; id: string; x: number; y: number; z: number; rotY: number; color: string; name: string; role: string; speed: number }
  | { type: 'leave'; id: string }
  | { type: 'trace'; id: string; x: number; y: number; z: number; text: string; color: string; name: string }
  | { type: 'hit'; fromId: string; fromName: string }
  | { type: 'egg'; fromId: string; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { type: 'gem'; fromId: string; fromName: string; idx: number }

export interface FlightState {
  position: { x: number; y: number; z: number }
  velocity: { x: number; y: number; z: number }
  yaw: number
  pitch: number
  bank: number
  speed: number
  landed: boolean
  tumbling: boolean
  tumbleTimer: number
  timeSinceLastFlap: number
  isGliding: boolean
  coyoteTimer: number
}

export interface InputState {
  pitchUp: boolean
  pitchDown: boolean
  bankLeft: boolean
  bankRight: boolean
  flap: boolean
  egg: boolean
  rocket: boolean
  chat: boolean
  // joystick
  joyX: number
  joyY: number
}
