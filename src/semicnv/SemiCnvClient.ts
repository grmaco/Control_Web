import {
  SEMICNV_HEARTBEAT_TIMEOUT_MS,
  SEMICNV_RECONNECT_INITIAL_MS,
  SEMICNV_RECONNECT_MAX_MS,
} from '../constants/semicnv'
import type { SemiCnvConnectionState, SemiCnvMessage } from '../types/semicnv'

export interface SemiCnvClientHandlers {
  onMessage: (message: SemiCnvMessage) => void
  onStateChange: (state: SemiCnvConnectionState) => void
}

export class SemiCnvClient {
  private ws: WebSocket | null = null
  private url = ''
  private reconnectDelay = SEMICNV_RECONNECT_INITIAL_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private handlers: SemiCnvClientHandlers
  public currentState: SemiCnvConnectionState = 'disconnected'

  constructor(handlers: SemiCnvClientHandlers) {
    this.handlers = handlers
  }

  connect(url: string): void {
    this.url = url
    this.intentionalClose = false
    this.clearReconnect()
    this.openSocket()
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearReconnect()
    this.clearHeartbeatTimer()
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.handlers.onStateChange('disconnected')
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  sendCommand(payload: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: 'COMMAND', ...payload }))
  }

  private openSocket(): void {
    if (!this.url) return

    this.handlers.onStateChange('connecting')

    try {
      const ws = new WebSocket(this.url)
      this.ws = ws

      ws.onopen = () => {
        this.reconnectDelay = SEMICNV_RECONNECT_INITIAL_MS
        this.currentState = 'connected'
        this.handlers.onStateChange('connected')
        this.resetHeartbeatTimer()
      }

      ws.onmessage = (event) => {
        this.resetHeartbeatTimer()
        try {
          const message = JSON.parse(String(event.data)) as SemiCnvMessage
          if (message?.type && message.siteId) {
            this.handlers.onMessage(message)
          }
        } catch {
          // ignore malformed payloads
        }
      }

      ws.onerror = () => {
        this.currentState = 'error'
        this.handlers.onStateChange('error')
      }

      ws.onclose = () => {
        this.ws = null
        this.clearHeartbeatTimer()
        this.currentState = 'disconnected'
        if (this.intentionalClose) {
          this.handlers.onStateChange('disconnected')
          return
        }
        this.handlers.onStateChange('disconnected')
        this.scheduleReconnect()
      }
    } catch {
      this.handlers.onStateChange('error')
      this.scheduleReconnect()
    }
  }

  // 마지막 메시지로부터 HEARTBEAT_TIMEOUT_MS 이상 무소식이면 강제 재연결
  private resetHeartbeatTimer(): void {
    this.clearHeartbeatTimer()
    this.heartbeatTimer = setTimeout(() => {
      if (this.intentionalClose) return
      // 소켓이 살아있어도 강제 닫기 후 재연결
      if (this.ws) {
        this.ws.onclose = null
        this.ws.close()
        this.ws = null
      }
      this.clearHeartbeatTimer()
      this.handlers.onStateChange('disconnected')
      this.scheduleReconnect()
    }, SEMICNV_HEARTBEAT_TIMEOUT_MS)
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || !this.url) return

    this.clearReconnect()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, SEMICNV_RECONNECT_MAX_MS)
      this.openSocket()
    }, this.reconnectDelay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
