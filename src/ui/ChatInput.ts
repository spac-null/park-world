export class ChatInput {
  private bar: HTMLElement
  private input: HTMLInputElement
  private _active = false
  private onSubmit: (text: string) => void

  constructor(onSubmit: (text: string) => void) {
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
    this.input.value = ''
    this.bar.style.display = 'flex'
    setTimeout(() => this.input.focus(), 0)
  }

  close() {
    this._active = false
    this.bar.style.display = 'none'
    this.input.blur()
  }

  get active() { return this._active }
}
