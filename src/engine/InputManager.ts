import type { InputState } from '../types'
import nipplejs from 'nipplejs'

export class InputManager {
  private state: InputState = {
    pitchUp: false, pitchDown: false,
    bankLeft: false, bankRight: false,
    flap: false, egg: false, rocket: false, chat: false,
    joyX: 0, joyY: 0,
  }

  private keys = new Set<string>()
  private isMobile: boolean
  private locked = false

  constructor() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    this.bindKeyboard()
    if (this.isMobile) this.bindJoystick()
  }

  lock()   { this.locked = true;  this.keys.clear() }
  unlock() { this.locked = false; this.keys.clear() }

  private bindKeyboard() {
    window.addEventListener('keydown', e => {
      if (this.locked) return
      this.keys.add(e.code)
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))
  }

  private bindJoystick() {
    const zone = document.getElementById('joy-zone')
    if (!zone) return
    const manager = nipplejs.create({
      zone,
      mode: 'static',
      position: { left: '60px', bottom: '60px' },
      size: 120,
      color: 'white',
    })
    manager.on('move', (_, data) => {
      if (!data.vector) return
      this.state.joyX = data.vector.x
      this.state.joyY = -data.vector.y   // invert Y: up = climb
    })
    manager.on('end', () => {
      this.state.joyX = 0
      this.state.joyY = 0
    })
  }

  bindMobileButton(id: string, action: keyof InputState) {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('touchstart', e => { e.preventDefault(); (this.state as any)[action] = true })
    el.addEventListener('touchend', e => { e.preventDefault(); (this.state as any)[action] = false })
  }

  get(): InputState {
    if (this.locked) {
      this.state.pitchUp = false; this.state.pitchDown = false
      this.state.bankLeft = false; this.state.bankRight = false
      this.state.flap = false; this.state.egg = false; this.state.rocket = false
      this.state.chat = false; this.state.joyX = 0; this.state.joyY = 0
      return { ...this.state }
    }
    if (!this.isMobile) {
      this.state.pitchUp    = this.keys.has('KeyW') || this.keys.has('ArrowUp')
      this.state.pitchDown  = this.keys.has('KeyS') || this.keys.has('ArrowDown')
      this.state.bankLeft   = this.keys.has('KeyA') || this.keys.has('ArrowLeft')
      this.state.bankRight  = this.keys.has('KeyD') || this.keys.has('ArrowRight')
      this.state.flap       = this.keys.has('Space')
      this.state.egg        = this.keys.has('KeyE')
      this.state.rocket     = this.keys.has('KeyR')
      this.state.chat       = this.keys.has('KeyT')
    } else {
      // Map joystick to flight axes
      this.state.pitchUp   = this.state.joyY > 0.3
      this.state.pitchDown = this.state.joyY < -0.3
      this.state.bankLeft  = this.state.joyX < -0.3
      this.state.bankRight = this.state.joyX > 0.3
    }
    return { ...this.state }
  }
}
