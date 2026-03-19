import { Scene, Vector3, Camera, UniversalCamera } from '@babylonjs/core'
import type { FlightState } from '../types'
import { CAMERA } from '../config'

export class SpringCamera {
  private cam: UniversalCamera
  private vel = Vector3.Zero()
  private armLength: number
  private fov: number

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.armLength = CAMERA.ARM_LENGTH
    this.fov = CAMERA.DEFAULT_FOV

    this.cam = new UniversalCamera('springCam', new Vector3(0, 20, -15), scene)
    this.cam.minZ = 0.5
    this.cam.maxZ = 500
    this.cam.fov = (CAMERA.DEFAULT_FOV * Math.PI) / 180
    this.cam.attachControl(canvas, false)
    // Disable default movement — we control it manually
    this.cam.inputs.clear()
  }

  getCamera(): Camera {
    return this.cam
  }

  update(flight: FlightState, dt: number) {
    const { position, yaw, pitch, bank } = flight
    const C = CAMERA

    // Diving: extend arm, widen FOV
    const diveRatio = Math.max(0, -pitch / C.DEFAULT_FOV)
    const targetArmLength = C.ARM_LENGTH + diveRatio * C.DIVE_ARM_EXTEND
    const targetFov = C.DEFAULT_FOV + diveRatio * (C.DIVE_FOV - C.DEFAULT_FOV)
    this.armLength += (targetArmLength - this.armLength) * 6 * dt
    this.fov       += (targetFov - this.fov) * 4 * dt
    this.cam.fov    = (this.fov * Math.PI) / 180

    // Ideal camera position: behind + above bird, shifted for bank anticipation
    const sinYaw = Math.sin(yaw)
    const cosYaw = Math.cos(yaw)

    const idealX = position.x - sinYaw * this.armLength + (-bank * C.ANTICIPATION_STRENGTH) * cosYaw
    const idealY = position.y + C.ARM_HEIGHT
    const idealZ = position.z - cosYaw * this.armLength + (-bank * C.ANTICIPATION_STRENGTH) * -sinYaw

    const ideal = new Vector3(idealX, idealY, idealZ)

    // Spring toward ideal
    const C2 = CAMERA
    const springForce = ideal.subtract(this.cam.position).scale(C2.SPRING_STIFFNESS)
    this.vel.addInPlace(springForce.scale(dt))
    this.vel.scaleInPlace(C2.SPRING_DAMPING)
    this.cam.position.addInPlace(this.vel.scale(dt))

    // Look target: ahead of bird, adjusted for pitch
    const lookX = position.x + sinYaw * C.LOOK_AHEAD
    const lookY = position.y + pitch * C.LOOK_AHEAD_PITCH_SCALE
    const lookZ = position.z + cosYaw * C.LOOK_AHEAD

    this.cam.setTarget(new Vector3(lookX, lookY, lookZ))
  }
}
