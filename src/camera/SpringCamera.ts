import { Scene, Vector3, UniversalCamera, type Camera } from '@babylonjs/core'
import type { FlightState } from '../types'
import { CAMERA } from '../config'

export class SpringCamera {
  private cam: UniversalCamera
  private camYaw = 0
  private camHeight = 0
  private birdYaw = 0
  private _lookTarget = new Vector3()  // reused every frame — no alloc

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

  setFovRad(rad: number) {
    this.cam.fov = rad
  }

  getFovRad(): number {
    return this.cam.fov
  }

  update(flight: FlightState, dt: number) {
    const { position, yaw, pitch, velocity } = flight
    this.birdYaw = yaw
    const C = CAMERA

    // --- Banjo-style: camera has its own yaw that lazily follows bird yaw ---
    let dyaw = yaw - this.camYaw
    while (dyaw >  Math.PI) dyaw -= Math.PI * 2
    while (dyaw < -Math.PI) dyaw += Math.PI * 2
    this.camYaw += dyaw * Math.min(2.5 * dt, 1)

    // --- Fixed arm, no spring on distance ---
    const sinCam = Math.sin(this.camYaw)
    const cosCam = Math.cos(this.camYaw)

    // Camera height: snap faster when diving (velocity.y < 0) so camera doesn't lag behind
    const vSpeed = velocity.y
    const heightLerpRate = vSpeed < -2 ? 12 : 5 + Math.abs(vSpeed) * 0.5
    const targetHeight = position.y + C.ARM_HEIGHT + pitch * 2  // lean down when pitching down
    this.camHeight += (targetHeight - this.camHeight) * heightLerpRate * dt

    // Camera position — arm behind bird
    this.cam.position.set(
      position.x - sinCam * C.ARM_LENGTH,
      this.camHeight,
      position.z - cosCam * C.ARM_LENGTH,
    )

    // Look target: ahead of bird in full 3D facing direction
    const cosPitch = Math.cos(pitch)
    const sinPitch = Math.sin(pitch)
    const sinBird  = Math.sin(yaw)
    const cosBird  = Math.cos(yaw)
    this._lookTarget.set(
      position.x + sinBird * cosPitch * C.LOOK_AHEAD,
      position.y - sinPitch * C.LOOK_AHEAD,
      position.z + cosBird * cosPitch * C.LOOK_AHEAD,
    )
    this.cam.setTarget(this._lookTarget)
  }

  snapBehind(birdYaw: number) {
    this.camYaw = birdYaw
  }

  private setupOrbit(canvas: HTMLCanvasElement) {
    let dragging = false
    let lastX = 0
    canvas.addEventListener('mousedown', e => {
      if (e.button === 2) { dragging = true; lastX = e.clientX }
    })
    window.addEventListener('mouseup', () => { dragging = false })
    window.addEventListener('mousemove', e => {
      if (!dragging) return
      this.camYaw += (e.clientX - lastX) * 0.005
      lastX = e.clientX
    })
    canvas.addEventListener('contextmenu', e => e.preventDefault())
    // Camera reset: R key snaps behind bird
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyR') this.snapBehind(this.birdYaw)
    })
  }
}
