import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../src/online/protocol.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>
const url = process.env.TEST_SERVER_URL ?? 'http://localhost:3101'
const tokenA = `reconnect-a-${Date.now()}`
const tokenB = `reconnect-b-${Date.now()}`
let originalMatch = ''
let originalSeat: 0 | 1 = 0
let replaced = false
const sockets: TestSocket[] = []

function finish(code: number, message: string) {
  sockets.forEach((socket) => socket.disconnect())
  console[code ? 'error' : 'log'](message)
  process.exit(code)
}
function connect(token: string, name: string) {
  const socket: TestSocket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.push(socket)
  socket.on('connect', () => socket.emit('queue:join', { token, name }))
  socket.on('connect_error', (error) => finish(1, error.message))
  return socket
}

const first = connect(tokenA, 'إعادة اتصال أ')
connect(tokenB, 'إعادة اتصال ب')
first.on('match:state', (state) => {
  if (!originalMatch) {
    originalMatch = state.matchId; originalSeat = state.you
    first.disconnect()
    setTimeout(() => {
      const replacement = connect(tokenA, 'إعادة اتصال أ')
      replacement.on('match:state', (resumed) => {
        if (replaced) return
        replaced = true
        if (resumed.matchId !== originalMatch || resumed.you !== originalSeat) finish(1, 'فشل استعادة المقعد أو المباراة')
        if (!resumed.players[originalSeat].connected) finish(1, 'المقعد لم يعد متصلًا')
        finish(0, 'نجح Reconnect واستعادة المقعد والحالة')
      })
    }, 150)
  }
})
setTimeout(() => finish(1, 'انتهت مهلة اختبار Reconnect'), 8_000)
