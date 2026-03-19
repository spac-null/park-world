import { Scene, Vector3, UniversalCamera, type Camera } from '@babylonjs/core'
import type { FlightState } from '../types'
import { CAMERA } from '../config'

export class SpringCamera {
  private cam: UniversalCamera
  private camYaw = 0          // camera's own yaw — lazily follows bird
  private camHeight = 0       // smoothed camera height

  constructor(scene: Scene, _canvas: HTMLCanvasElement) {
    this.cam = new UniversalCamera('cam', new Vector3(0, 20, -15), scene)
    this.cam.minZ = 0.5
    this.cam.maxZ = 600
    this.cam.fov = (CAMERA.DEFAULT_FOV * Math.PI) / 180
    this.cam.inputs.clear()
  }

  getCamera(): Camera {
    return this.cam
  }

  update(flight: FlightState, dt: number) {
    const { position, yaw, pitch } = flight
    const C = CAMERA

    // --- Banjo-style: camera has its own yaw that lazily follows bird yaw ---
    // Shortest-path yaw delta (handles wrap-around)
    let dyaw = yaw - this.camYaw
    while (dyaw >  Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    this.camYaw += dyaw * Math.min(2.5 * dt, 1)

    // --- Fixed arm, no spring on distance ---
    const sinCam = Math.sin(this.camYaw)
    const cosCam = Math.cos(this.camYaw)

    const targetHeight = position.y + C.ARM_HEIGHT
    this.camHeight += (targetHeight - this.camHeight) * 5 * dt

    this.cam.position.set(
      position.x - sinCam * C.ARM_LENGTH,
      this.camHeight,
      position.z - cosCam * C.ARM_LENGTH,
    )

    // --- Look target: slightly ahead of bird, pitch-adjusted ---
    const sinBird = Math.sin(yaw)
    const cosBird = Math.cos(yaw)
    this.cam.setTarget(new Vector3(
      position.x + sinBird * C.LOOK_AHEAD,
      position.y + pitch * C.LOOK_AHEAD_PITCH_SCALE,
      position.z + cosBird * C.LOOK_AHEAD,
    ))
  }
}
