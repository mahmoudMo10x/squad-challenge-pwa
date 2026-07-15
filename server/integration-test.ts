import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, OnlineSnapshot, ServerToClientEvents } from '../src/online/protocol.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>
const url = process.env.TEST_SERVER_URL ?? 'http://localhost:3101'
const sockets: TestSocket[] = []
const acted = new Set<string>()
let completed = false

function close(code: number, message: string) {
  if (completed) return
  completed = true
  sockets.forEach((socket) => socket.disconnect())
  if (code === 0) console.log(message)
  else console.error(message)
  process.exit(code)
}

function act(socket: TestSocket, state: OnlineSnapshot) {
  if (state.activePlayer !== state.you) return
  const key = `${state.matchId}:${state.version}:${state.you}:${state.phase}`
  if (acted.has(key)) return
  acted.add(key)
  const base = { matchId: state.matchId, version: state.version }
  if (state.phase === 'draft') {
    const opened = state.boxes.find((box) => box.opened && !box.rejected)
    if (opened) socket.emit('draft:decision', { ...base, accept: true })
    else socket.emit('draft:open', { ...base, boxId: state.boxes.find((box) => !box.rejected)!.id })
  } else if (state.phase === 'cards') socket.emit('card:action', { ...base, type: 'تخطي' })
  else if (state.phase === 'setup') socket.emit('setup:lock', { ...base, formation: '2-2-2', tactic: 'متوازن' })
}

for (let index = 0; index < 2; index += 1) {
  const socket: TestSocket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false })
  sockets.push(socket)
  socket.on('connect', () => socket.emit('queue:join', { token: `integration-${Date.now()}-${index}`, name: `مختبر ${index + 1}` }))
  socket.on('match:state', (state) => {
    if (state.phase === 'draft' && state.version === 1 && state.boxes.some((box) => box.player)) return close(1, 'فشل: تسريب محتوى صندوق مغلق')
    if (state.phase === 'simulation') {
      if (state.players[0].squad.length !== 7 || state.players[1].squad.length !== 7) close(1, 'فشل: قائمة غير مكتملة')
      const result = state.result
      if (!result || !['home', 'away'].includes(result.winner)) return close(1, 'فشل: لا توجد نتيجة موقعة')
      close(0, `نجح المسار الأونلاين: 14 دورًا، فريقان، والنتيجة ${result.homeScore}-${result.awayScore}`)
      return
    }
    queueMicrotask(() => act(socket, state))
  })
  socket.on('action:error', ({ code, message }) => close(1, `فشل ${code}: ${message}`))
  socket.on('connect_error', (error) => close(1, `تعذر الاتصال: ${error.message}`))
}

setTimeout(() => close(1, 'انتهت مهلة اختبار الأونلاين'), 20_000)
