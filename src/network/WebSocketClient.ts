import type { NetworkMessage, PlayerState } from '../types'
import { NETWORK } from '../config'

type Handler = (msg: any) => void

export class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Handler[]>()
  private sendTimer = 0
  private reconnectDelay = 2000

  connect() {
    try {
      this.ws = new WebSocket(NETWORK.WS_URL)
      this.ws.onmessage = e => {
        try {
          const msg: NetworkMessage = JSON.parse(e.data)
          const handlers = this.handlers.get(msg.type) || []
          handlers.forEach(h => h(msg))
        } catch {}
      }
      this.ws.onclose = () => {
        setTimeout(() => this.connect(), this.reconnectDelay)
      }
      this.ws.onerror = () => this.ws?.close()
    } catch {
      setTimeout(() => this.connect(), this.reconnectDelay)
    }
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, [])
    this.handlers.get(type)!.push(handler)
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  sendMove(state: PlayerState, now: number) {
    if (now - this.sendTimer < NETWORK.SEND_INTERVAL) return
    this.sendTimer = now
    this.send({ type: 'move', ...state })
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
