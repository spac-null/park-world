import { Scene, Vector3, UniversalCamera, type Camera } from '@babylonjs/core'
import type { FlightState } from '../types'
import { CAMERA } from '../config'

export class SpringCamera {
  private cam: UniversalCamera
  private camYaw = 0
  private camHeight = 0

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.cam = new UniversalCamera('cam', new Vector3(0, 20, -15), scene)
    this.cam.minZ = 0.5
    this.cam.maxZ = 600
    this.cam.fov = (CAMERA.DEFAULT_FOV * Math.PI) / 180
    this.cam.inputs.clear()
    this.setupOrbit(canvas)
  }

  getCamera(): Camera {
    return this.cam
  }

  getCamYaw(): number {
    return this.camYaw
  }

  setFov(deg: number) {
    this.cam.fov = (deg * Math.PI) / 180
  }

  update(flight: FlightState, dt: number) {
    const { position, yaw, pitch, velocity } = flight
    const C = CAMERA

    // --- Banjo-style: camera has its own yaw that lazily follows bird yaw ---
    let dyaw = yaw - this.camYaw
    while (dyaw >  Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    this.camYaw += dyaw * Math.min(2.5 * dt, 1)

    // --- Fixed arm, no spring on distance ---
    const sinCam = Math.sin(this.camYaw)
    const cosCam = Math.cos(this.camYaw)

    // Vertical auto-adjust: faster height lerp when bird moves fast vertically
    const vSpeed = Math.abs(velocity.y)
    const heightLerpRate = 5 + vSpeed * 0.5
    const targetHeight = position.y + C.ARM_HEIGHT
    this.camHeight += (targetHeight - this.camHeight) * heightLerpRate * dt

    // Camera position — arm behind bird, slightly elevated
    this.cam.position.set(
      position.x - sinCam * C.ARM_LENGTH,
      this.camHeight,
      position.z - cosCam * C.ARM_LENGTH,
    )

    // --- Look target: slightly ahead of bird, pitch-adjusted, with 15° downward tilt ---
    const sinBird = Math.sin(yaw)
    const cosBird = Math.cos(yaw)
    const lookAheadX = position.x + sinBird * C.LOOK_AHEAD
    const lookAheadZ = position.z + cosBird * C.LOOK_AHEAD
    const lookAheadY = position.y + pitch * C.LOOK_AHEAD_PITCH_SCALE - C.ARM_LENGTH * Math.tan(15 * Math.PI / 180)
    this.cam.setTarget(new Vector3(lookAheadX, lookAheadY, lookAheadZ))
  }

  private setupOrbit(canvas: HTMLCanvasElement) {
    let dragging = false
    let lastX = 0
    canvas.addEventListener('mousedown', e => {
      if (e.button === 2) {
        dragging = true
        lastX = e.clientX
      }
    })
    window.addEventListener('mouseup', () => { dragging = false })
    window.addEventListener('mousemove', e => {
      if (!dragging) return
      this.camYaw += (e.clientX - lastX) * 0.005
      lastX = e.clientX
    })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
  }
}
