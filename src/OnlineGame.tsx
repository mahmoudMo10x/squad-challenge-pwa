import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, OnlineSnapshot, ServerToClientEvents } from './online/protocol'
import type { Formation, Player, Tactic } from './game/types'
import { activeCardCount } from './game/cards'
import { positionLabel } from './game/players'

const formations: Formation[] = ['2-2-2', '3-2-1', '2-3-1', '1-3-2']
const tactics: Tactic[] = ['متوازن', 'هجومي', 'دفاعي', 'ضغط عالٍ', 'مرتدات']
const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2)

function MiniCard({ player, protectedLabel = false }: { player: Player; protectedLabel?: boolean }) {
  return <div className="online-player"><b>{player.rating}</b><span>{initials(player.name)}</span><strong>{player.name}</strong><small>{player.position}{protectedLabel && player.protected ? ' • 🛡️ محمي' : ''}</small></div>
}

export default function OnlineGame({ onExit }: { onExit: () => void }) {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [snapshot, setSnapshot] = useState<OnlineSnapshot | null>(null)
  const [error, setError] = useState('')
  const [peekMode, setPeekMode] = useState(false)
  const [peeked, setPeeked] = useState<Record<string, Player>>({})
  const [cardMode, setCardMode] = useState<'سرقة' | 'تبديل' | null>(null)
  const [formation, setFormation] = useState<Formation>('2-2-2')
  const [tactic, setTactic] = useState<Tactic>('متوازن')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const existing = sessionStorage.getItem('sc-player-token')
    const token = existing || crypto.randomUUID()
    sessionStorage.setItem('sc-player-token', token)
    const serverUrl = import.meta.env.VITE_SERVER_URL || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin)
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, { transports: ['websocket'], reconnection: true })
    socketRef.current = socket
    socket.on('connect', () => { setConnection('connected'); setError(''); socket.emit('queue:join', { token, name: `لاعب ${token.slice(0, 4)}` }) })
    socket.on('disconnect', () => setConnection('connecting'))
    socket.on('connect_error', () => { setConnection('offline'); setError('تعذر الاتصال بخادم المباراة. شغّل الخادم ثم أعد المحاولة.') })
    socket.on('match:state', (state) => { setSnapshot(state); setPeekMode(false); setCardMode(null) })
    socket.on('card:peek', ({ boxId, player }) => { setPeeked((current) => ({ ...current, [boxId]: player })); setPeekMode(false) })
    socket.on('action:error', ({ message }) => setError(message))
    return () => { socket.emit('queue:leave'); socket.disconnect() }
  }, [])

  useEffect(() => {
    if (!snapshot?.deadline) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [snapshot?.deadline])

  const emit = <K extends keyof ClientToServerEvents>(event: K, payload: Parameters<ClientToServerEvents[K]>[0]) => {
    const socket = socketRef.current
    if (socket?.connected) (socket.emit as (...args: unknown[]) => void)(event, payload)
  }
  const base = snapshot ? { matchId: snapshot.matchId, version: snapshot.version } : null
  const me = snapshot?.players[snapshot.you]
  const opponent = snapshot?.players[(snapshot.you === 0 ? 1 : 0)]
  const myTurn = snapshot?.activePlayer === snapshot?.you
  const remaining = snapshot?.deadline ? Math.max(0, Math.ceil((snapshot.deadline - now) / 1000)) : 0
  const opened = snapshot?.boxes.find((box) => box.opened && !box.rejected)
  const elapsed = snapshot?.phase === 'simulation' && snapshot.deadline ? Math.min(60, Math.max(0, 60 - Math.ceil((snapshot.deadline - now) / 1000))) : snapshot?.phase === 'result' ? 60 : 0
  const currentEvent = useMemo(() => snapshot?.result?.events.filter((event) => event.minute <= elapsed).at(-1), [snapshot?.result, elapsed])
  const liveMyScore = snapshot?.you === 0 ? currentEvent?.homeScore : currentEvent?.awayScore
  const liveOpponentScore = snapshot?.you === 0 ? currentEvent?.awayScore : currentEvent?.homeScore

  const boxClick = (boxId: string) => {
    if (!base || !myTurn) return
    if (peekMode) emit('card:reveal', { ...base, boxId })
    else emit('draft:open', { ...base, boxId })
  }
  const cardAction = (targetId?: string) => {
    if (!base || !cardMode) return
    emit('card:action', { ...base, type: cardMode, targetId })
  }

  if (!snapshot) return <section className="online-queue screen-enter"><button className="exit-button" onClick={onExit}>×</button><div className="radar"><span className="radar-avatar">أ</span><i/><i/><i/></div><h2>{connection === 'offline' ? 'الخادم غير متصل' : 'جاري البحث عن لاعب حقيقي'}</h2><p>{error || 'ابقَ في الشاشة حتى نجد المنافس المناسب...'}</p>{connection === 'offline' && <button className="primary-button" onClick={() => window.location.reload()}>إعادة الاتصال</button>}</section>

  if (snapshot.phase === 'abandoned') return <section className="online-queue"><h2>انتهت المباراة</h2><p>{snapshot.message}</p><button className="primary-button" onClick={onExit}>العودة للرئيسية</button></section>

  return <section className="online-game screen-enter">
    <header className="online-header"><div><span className={`connection-dot ${connection}`}/>{connection === 'connected' ? 'متصل' : 'إعادة الاتصال'}</div><strong>{remaining ? `${remaining}ث` : 'LIVE'}</strong><button onClick={onExit}>خروج</button></header>
    {error && <div className="online-error" onClick={() => setError('')}>{error}</div>}
    {snapshot.phase === 'draft' && <>
      <div className={`online-team ${!myTurn ? 'active' : ''}`}><span className="avatar">{initials(opponent!.name)}</span><div><b>{opponent!.name}</b><small>{opponent!.squad.length}/7</small></div><div className="ratings">{opponent!.squad.map((p) => <i key={p.id}>{p.rating}</i>)}</div></div>
      <div className="online-draft"><p className="eyebrow">الجولة {snapshot.turnIndex + 1} من 14 • {snapshot.slot ? positionLabel[snapshot.slot] : ''}</p><h3>{myTurn ? snapshot.mandatory ? 'اختر الصندوق الثاني الإجباري' : opened ? 'اقبل اللاعب أو جازف' : peekMode ? 'اختر صندوقًا للكشف السري' : 'اختر صندوقًا' : `في انتظار ${opponent!.name}`}</h3>
        {myTurn && !snapshot.mandatory && !opened && activeCardCount(me!.squad, 'كشف') > 0 && <button className={`reveal-action ${peekMode ? 'selected' : ''}`} onClick={() => setPeekMode((value) => !value)}>👁️ كشف ({activeCardCount(me!.squad, 'كشف')})</button>}
        <div className="online-boxes">{snapshot.boxes.map((box, index) => { const player = box.player || peeked[box.id]; return <button key={box.id} disabled={!myTurn || Boolean(opened) || box.rejected} className={`${box.opened ? 'opened' : ''} ${peeked[box.id] && !box.opened ? 'peeked' : ''} ${box.rejected ? 'rejected' : ''}`} onClick={() => boxClick(box.id)}>{player ? <MiniCard player={player}/> : <><b>؟</b><small>الصندوق {index + 1}</small></>}</button>})}</div>
        {myTurn && opened && <div className="decision-bar"><button className="accept" onClick={() => emit('draft:decision', { ...base!, accept: true })}>قبول</button><button className="reject" onClick={() => emit('draft:decision', { ...base!, accept: false })}>رفض</button></div>}
      </div>
      <div className={`online-team mine ${myTurn ? 'active' : ''}`}><span className="avatar gold">أنت</span><div><b>{me!.name}</b><small>{me!.squad.length}/7</small></div><div className="ratings">{me!.squad.map((p) => <i key={p.id}>{p.rating}</i>)}</div></div>
    </>}
    {snapshot.phase === 'cards' && <div className="online-stage"><p className="eyebrow">مرحلة البطاقات</p><h2>{myTurn ? 'استخدم بطاقة أو تخطَّ' : 'المنافس يقرر...'}</h2>{snapshot.message && <p className="server-message">{snapshot.message}</p>}{myTurn && <><div className="card-inventory"><button disabled={!activeCardCount(me!.squad, 'سرقة')} className={cardMode === 'سرقة' ? 'selected' : ''} onClick={() => setCardMode('سرقة')}>🗡️ سرقة ({activeCardCount(me!.squad, 'سرقة')})</button><button disabled={!activeCardCount(me!.squad, 'تبديل')} className={cardMode === 'تبديل' ? 'selected' : ''} onClick={() => setCardMode('تبديل')}>🔄 تبديل ({activeCardCount(me!.squad, 'تبديل')})</button></div><div className="card-targets">{(cardMode === 'سرقة' ? opponent!.squad : me!.squad).map((player) => <button key={player.id} disabled={!cardMode || (cardMode === 'سرقة' && player.protected)} onClick={() => cardAction(player.id)}><MiniCard player={player} protectedLabel/></button>)}</div><button className="ghost-button" onClick={() => emit('card:action', { ...base!, type: 'تخطي' })}>تخطي</button></>}</div>}
    {snapshot.phase === 'setup' && <div className="online-stage"><p className="eyebrow">التشكيل والتكتيك</p><h2>{myTurn ? 'جهّز فريقك' : 'في انتظار المنافس'}</h2>{myTurn && <><div className="option-group"><label>التشكيل</label><div>{formations.map((item) => <button key={item} className={formation === item ? 'selected' : ''} onClick={() => setFormation(item)}>{item}</button>)}</div></div><div className="option-group"><label>التكتيك</label><div>{tactics.map((item) => <button key={item} className={tactic === item ? 'selected' : ''} onClick={() => setTactic(item)}>{item}</button>)}</div></div><button className="primary-button" onClick={() => emit('setup:lock', { ...base!, formation, tactic })}>تثبيت والاستعداد</button></>}</div>}
    {(snapshot.phase === 'simulation' || snapshot.phase === 'result') && snapshot.result && <div className="online-stage match-online"><div className="scoreboard"><div>{opponent!.name}</div><strong>{liveOpponentScore ?? (snapshot.you === 0 ? snapshot.result.awayScore : snapshot.result.homeScore)} – {liveMyScore ?? (snapshot.you === 0 ? snapshot.result.homeScore : snapshot.result.awayScore)}</strong><div>أنت</div></div><div className="clock"><span style={{ width: `${elapsed / 60 * 100}%` }}/><b>{elapsed}'</b></div><div className="match-pitch simple"><div className={`ball team-${currentEvent?.team || 'home'}`}>⚽</div><div className="center-circle"/><div className="half-line"/></div>{snapshot.phase === 'result' && <div className="online-result"><h2>{snapshot.result.winner === (snapshot.you === 0 ? 'home' : 'away') ? 'فزت بالمباراة!' : 'انتهت بالخسارة'}</h2><p>{snapshot.result.reason}</p>{snapshot.result.homePenalties !== undefined && <b>{snapshot.result.homePenalties} – {snapshot.result.awayPenalties} ترجيحًا</b>}<button className="primary-button" onClick={onExit}>العودة للرئيسية</button></div>}</div>}
  </section>
}
