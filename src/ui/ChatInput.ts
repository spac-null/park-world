import type { InputManager } from '../engine/InputManager'

export class ChatInput {
  private bar: HTMLElement
  private input: HTMLInputElement
  private _active = false
  private onSubmit: (text: string) => void
  private inputMgr: InputManager

  constructor(inputMgr: InputManager, onSubmit: (text: string) => void) {
    this.inputMgr = inputMgr
    this.onSubmit = onSubmit
    this.bar   = document.getElementById('chat-bar')!
    this.input = document.getElementById('chat-input') as HTMLInputElement

    this.input.addEventListener('keydown', e => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        const text = this.input.value.trim()
        if (text) this.onSubmit(text)
        this.close()
      } else if (e.key === 'Escape') {
        this.close()
      }
    })
  }

  open() {
    if (this._active) return
    this._active = true
    this.inputMgr.lock()
    this.input.value = ''
    this.bar.style.display = 'flex'
    setTimeout(() => this.input.focus(), 0)
  }

  close() {
    this._active = false
    this.inputMgr.unlock()
    this.bar.style.display = 'none'
    this.input.blur()
  }

  get active() { return this._active }
}
