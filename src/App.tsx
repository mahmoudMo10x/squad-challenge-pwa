import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { chooseAiPlayer, createOffers, createRng } from './game/draft'
import { positionLabel, slotOrder } from './game/players'
import { simulateMatch } from './game/simulation'
import { activeCardCount, chooseAiCardAction, consumeCard, stealPlayer, swapPlayer } from './game/cards'
import type { BoxOffer, Formation, MatchResult, Player, SquadSetup, Tactic } from './game/types'
import OnlineGame from './OnlineGame'

type Screen = 'home' | 'online' | 'searching' | 'draft' | 'cards' | 'formation' | 'simulation' | 'result'
const formations: Formation[] = ['2-2-2', '3-2-1', '2-3-1', '1-3-2']
const tactics: Tactic[] = ['متوازن', 'هجومي', 'دفاعي', 'ضغط عالٍ', 'مرتدات']
const cardIcon = (card: Player['card']) => card ? ({ حماية: '🛡️', سرقة: '🗡️', كشف: '👁️', تبديل: '🔄' } as const)[card] : ''
const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2)

function TeamStrip({ name, squad, active, side }: { name: string; squad: Player[]; active?: boolean; side: 'top' | 'bottom' }) {
  return <section className={`team-strip ${side} ${active ? 'active' : ''}`}>
    <div className="identity"><span className="avatar">{initials(name)}</span><div><strong>{name}</strong><small>{active ? 'الدور الآن' : `${squad.length} / 7`}</small></div></div>
    <div className="squad-dots">{slotOrder.map((position, index) => <span key={`${position}-${index}`} className={squad[index] ? 'filled' : ''}>{squad[index] ? squad[index].rating : position}</span>)}</div>
  </section>
}

function PlayerCard({ player, compact = false }: { player: Player; compact?: boolean }) {
  return <article className={`player-card ${compact ? 'compact' : ''}`}>
    <span className="rating">{player.rating}</span><span className="position">{player.position}</span><div className="portrait">{initials(player.name)}</div><strong>{player.name}</strong>
    {!compact && <div className="stats"><span>سرعة {player.pace}</span><span>هجوم {player.attack}</span><span>تمرير {player.passing}</span></div>}
    {player.card && <div className="card-badge">{cardIcon(player.card)} {player.card}</div>}
  </article>
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [countdown, setCountdown] = useState(3)
  const [turnIndex, setTurnIndex] = useState(0)
  const [humanSquad, setHumanSquad] = useState<Player[]>([])
  const [aiSquad, setAiSquad] = useState<Player[]>([])
  const [offers, setOffers] = useState<BoxOffer[]>([])
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const [mandatory, setMandatory] = useState(false)
  const [peekMode, setPeekMode] = useState(false)
  const [peekedIds, setPeekedIds] = useState<Set<string>>(new Set())
  const [cardMode, setCardMode] = useState<'سرقة' | 'تبديل' | null>(null)
  const [cardMessage, setCardMessage] = useState('')
  const [formation, setFormation] = useState<Formation>('2-2-2')
  const [tactic, setTactic] = useState<Tactic>('متوازن')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const usedIds = useRef(new Set<string>())
  const rng = useRef(createRng(Date.now()))
  const opponentName = 'فارس الملاعب'

  const reset = () => {
    usedIds.current = new Set(); rng.current = createRng(Date.now())
    setHumanSquad([]); setAiSquad([]); setTurnIndex(0); setOffers([]); setRevealedId(null); setMandatory(false); setPeekMode(false); setPeekedIds(new Set()); setCardMode(null); setCardMessage(''); setResult(null); setElapsed(0)
    setFormation('2-2-2'); setTactic('متوازن'); setCountdown(3); setScreen('home')
  }
  const startSearch = () => { reset(); setScreen('searching') }

  useEffect(() => {
    if (screen !== 'searching') return
    if (countdown <= 0) { setScreen('draft'); return }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 850)
    return () => window.clearTimeout(timer)
  }, [screen, countdown])

  useEffect(() => {
    if (screen !== 'draft') return
    if (turnIndex >= 14) { setScreen('cards'); return }
    const position = slotOrder[Math.floor(turnIndex / 2)]
    const nextOffers = createOffers(position, usedIds.current, rng.current)
    setOffers(nextOffers); setRevealedId(null); setMandatory(false); setPeekMode(false); setPeekedIds(new Set())
    if (turnIndex % 2 === 1) {
      const timer = window.setTimeout(() => {
        const player = chooseAiPlayer(nextOffers, rng.current)
        usedIds.current.add(player.id); setAiSquad((squad) => [...squad, player]); setTurnIndex((turn) => turn + 1)
      }, 1100)
      return () => window.clearTimeout(timer)
    }
  }, [screen, turnIndex])

  const commitHuman = (offer: BoxOffer) => {
    const player = { ...offer.player, protected: offer.player.card === 'حماية' }
    usedIds.current.add(player.id); setHumanSquad((squad) => [...squad, player]); setTurnIndex((turn) => turn + 1)
  }
  const openBox = (offer: BoxOffer) => {
    if (turnIndex % 2 === 1 || offer.rejected || offer.opened) return
    if (peekMode) {
      setPeekedIds((current) => new Set(current).add(offer.id))
      setHumanSquad((squad) => consumeCard(squad, 'كشف'))
      setPeekMode(false)
      return
    }
    setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, opened: true } : item))
    if (mandatory) window.setTimeout(() => commitHuman(offer), 650)
    else setRevealedId(offer.id)
  }
  const accept = () => { const offer = offers.find((item) => item.id === revealedId); if (offer) commitHuman(offer) }
  const reject = () => { setOffers((current) => current.map((item) => item.id === revealedId ? { ...item, rejected: true } : item)); setRevealedId(null); setMandatory(true) }

  const finishCardPhase = (nextHuman = humanSquad, nextAi = aiSquad, message = '') => {
    const ids = new Set([...nextHuman, ...nextAi].map((player) => player.id))
    const aiAction = chooseAiCardAction(nextAi, nextHuman, ids, rng.current)
    setHumanSquad(aiAction.human); setAiSquad(aiAction.ai)
    setCardMessage([message, aiAction.message].filter(Boolean).join(' — '))
    window.setTimeout(() => setScreen('formation'), 1500)
  }
  const handleSteal = (targetId: string) => {
    const result = stealPlayer(humanSquad, aiSquad, targetId)
    if (!result) return
    const nextHuman = consumeCard(result.own, 'سرقة')
    setHumanSquad(nextHuman); setAiSquad(result.opponent)
    finishCardPhase(nextHuman, result.opponent, `سرقت ${result.received.name} وأرسلت ${result.sent.name}`)
  }
  const handleSwap = (playerId: string) => {
    const ids = new Set([...humanSquad, ...aiSquad].map((player) => player.id))
    const result = swapPlayer(humanSquad, playerId, ids, rng.current)
    if (!result) return
    usedIds.current.add(result.replacement.id)
    const nextHuman = consumeCard(result.squad, 'تبديل')
    setHumanSquad(nextHuman)
    finishCardPhase(nextHuman, aiSquad, `استبدلت ${result.removed.name} وحصلت على ${result.replacement.name}`)
  }

  const startSimulation = () => {
    const homeSetup: SquadSetup = { formation, tactic }
    const awaySetup: SquadSetup = { formation: formations[Math.floor(rng.current() * formations.length)], tactic: tactics[Math.floor(rng.current() * tactics.length)] }
    setResult(simulateMatch(humanSquad, aiSquad, homeSetup, awaySetup, Math.floor(rng.current() * 1_000_000))); setElapsed(0); setScreen('simulation')
  }
  useEffect(() => {
    if (screen !== 'simulation' || !result) return
    if (elapsed >= 60) { const timer = window.setTimeout(() => setScreen('result'), 1300); return () => window.clearTimeout(timer) }
    const timer = window.setTimeout(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearTimeout(timer)
  }, [screen, result, elapsed])

  const currentEvent = useMemo(() => result?.events.filter((event) => event.minute <= elapsed).at(-1), [result, elapsed])
  const visibleEvents = useMemo(() => result?.events.filter((event) => event.minute <= elapsed).slice(-3).reverse() ?? [], [result, elapsed])
  const currentPosition = slotOrder[Math.floor(turnIndex / 2)]
  const humanTurn = turnIndex % 2 === 0
  const revealedOffer = offers.find((offer) => offer.id === revealedId)

  return <main className="app-shell" dir="rtl">
    {screen === 'home' && <section className="home-screen screen-enter"><div className="brand-mark">⚽</div><p className="eyebrow">اختياراتك تصنع الفوز</p><h1>تحدي<br/><span>التشكيلة</span></h1><p className="intro">اختر سبعة لاعبين، خاطِر بالصندوق الثاني، ثم شاهد فريقك يخوض المباراة.</p><button className="primary-button" onClick={() => setScreen('online')}>لعبة جديدة أونلاين <span>←</span></button><button className="ghost-button demo-button" onClick={startSearch}>تجربة ضد الكمبيوتر</button><div className="status-pill"><i/> MVP أونلاين</div></section>}
    {screen === 'online' && <OnlineGame onExit={reset}/>} 
    {screen === 'searching' && <section className="search-screen screen-enter"><p className="eyebrow">مباراة جديدة</p><h2>جاري البحث عن منافس</h2><div className="radar"><span className="radar-avatar">م</span><i/><i/><i/></div><strong className="countdown">{countdown || 'VS'}</strong><p>نجهّز الملعب والصناديق...</p></section>}
    {screen === 'draft' && <section className="draft-screen screen-enter"><TeamStrip name={opponentName} squad={aiSquad} active={!humanTurn} side="top"/><div className="draft-center"><div className="round-line"><span>الجولة {Math.min(turnIndex + 1, 14)} من 14</span><strong>{positionLabel[currentPosition]}</strong></div><div className="pitch-lines"><i/></div>
      {!humanTurn ? <div className="waiting-card"><span className="spinner"/> المنافس يختار {positionLabel[currentPosition]}...</div> : <><p className="instruction">{peekMode ? 'اختر صندوقًا لتكشفه سرًا دون استهلاك محاولة' : mandatory ? 'رفضت الاختيار الأول — اختر صندوقك الإجباري' : revealedOffer ? 'هل تثق بهذا اللاعب؟' : 'اختر صندوقًا من الأربعة'}</p>{!mandatory && !revealedOffer && activeCardCount(humanSquad, 'كشف') > 0 && <button className={`reveal-action ${peekMode ? 'selected' : ''}`} onClick={() => setPeekMode((value) => !value)}>👁️ استخدام بطاقة كشف ({activeCardCount(humanSquad, 'كشف')})</button>}<div className="boxes">{offers.map((offer, index) => { const visible = offer.opened || peekedIds.has(offer.id); return <button key={offer.id} className={`mystery-box ${offer.opened ? 'opened' : ''} ${peekedIds.has(offer.id) ? 'peeked' : ''} ${offer.rejected ? 'rejected' : ''}`} onClick={() => openBox(offer)} disabled={Boolean(revealedOffer) || offer.rejected}>{visible ? <><PlayerCard player={offer.player} compact/>{peekedIds.has(offer.id) && !offer.opened && <small className="peek-label">كشف سري — اضغط لاختياره</small>}</> : <><span>؟</span><small>الصندوق {index + 1}</small></>}</button>})}</div>{revealedOffer && <div className="decision-bar"><button className="accept" onClick={accept}>قبول</button><button className="reject" onClick={reject}>رفض والمجازفة</button></div>}</>}
    </div><TeamStrip name="أنت" squad={humanSquad} active={humanTurn} side="bottom"/></section>}
    {screen === 'cards' && <section className="cards-screen screen-enter"><p className="eyebrow">مرحلة البطاقات</p><h2>فرصة أخيرة قبل التشكيل</h2>{cardMessage ? <div className="card-message"><span className="spinner"/>{cardMessage}</div> : <><div className="card-inventory"><button disabled={!activeCardCount(humanSquad, 'سرقة')} className={cardMode === 'سرقة' ? 'selected' : ''} onClick={() => setCardMode('سرقة')}>🗡️ سرقة <b>{activeCardCount(humanSquad, 'سرقة')}</b></button><button disabled={!activeCardCount(humanSquad, 'تبديل')} className={cardMode === 'تبديل' ? 'selected' : ''} onClick={() => setCardMode('تبديل')}>🔄 تبديل <b>{activeCardCount(humanSquad, 'تبديل')}</b></button></div><p className="card-help">{cardMode === 'سرقة' ? 'اختر لاعبًا غير محمي من المنافس. سنرسل أضعف لاعب لديك في المركز نفسه.' : cardMode === 'تبديل' ? 'اختر لاعبًا من فريقك لاستبداله بلاعب مجهول من المركز نفسه.' : 'يمكنك استخدام بطاقة فعالة واحدة فقط أو التخطي.'}</p><div className="card-targets">{(cardMode === 'سرقة' ? aiSquad : humanSquad).map((player) => <button key={player.id} disabled={!cardMode || (cardMode === 'سرقة' && player.protected)} onClick={() => cardMode === 'سرقة' ? handleSteal(player.id) : handleSwap(player.id)}><PlayerCard player={player} compact/>{player.protected && <small>🛡️ محمي</small>}</button>)}</div><button className="ghost-button" onClick={() => finishCardPhase()}>تخطي البطاقات</button></>}</section>}
    {screen === 'formation' && <section className="setup-screen screen-enter"><p className="eyebrow">اكتملت التشكيلة</p><h2>جهّز فريقك للمباراة</h2><div className="mini-pitch">{humanSquad.map((player, index) => <span key={player.id} style={{ right: `${12 + (index % 3) * 30}%`, top: `${8 + Math.floor(index / 3) * 31}%` }}><b>{player.rating}</b>{initials(player.name)}</span>)}</div><div className="option-group"><label>التشكيل</label><div>{formations.map((item) => <button className={formation === item ? 'selected' : ''} onClick={() => setFormation(item)} key={item}>{item}</button>)}</div></div><div className="option-group"><label>التكتيك</label><div>{tactics.map((item) => <button className={tactic === item ? 'selected' : ''} onClick={() => setTactic(item)} key={item}>{item}</button>)}</div></div><button className="primary-button" onClick={startSimulation}>ابدأ المباراة</button></section>}
    {screen === 'simulation' && result && <section className="match-screen screen-enter"><div className="scoreboard"><div><span className="avatar">فم</span><small>{opponentName}</small></div><strong>{currentEvent?.awayScore ?? 0} <em>–</em> {currentEvent?.homeScore ?? 0}</strong><div><span className="avatar gold">أنت</span><small>فريقك</small></div></div><div className="clock"><span style={{ width: `${(elapsed / 60) * 100}%` }}/><b>{elapsed}'</b></div><div className="match-pitch"><div className={`ball team-${currentEvent?.team ?? 'home'}`}>⚽</div>{aiSquad.map((player, index) => <i className="token away-token" key={player.id} style={{ '--i': index } as React.CSSProperties}>{player.rating}</i>)}{humanSquad.map((player, index) => <i className="token home-token" key={player.id} style={{ '--i': index } as React.CSSProperties}>{player.rating}</i>)}<div className="center-circle"/><div className="half-line"/></div><div className="event-feed">{visibleEvents.map((event, index) => <p className={event.type === 'goal' ? 'goal-event' : ''} key={`${event.minute}-${index}`}><b>{event.minute}'</b>{event.text}</p>)}</div></section>}
    {screen === 'result' && result && <section className="result-screen screen-enter"><p className="eyebrow">انتهت المباراة</p><h2 className={result.winner === 'home' ? 'win' : 'loss'}>{result.winner === 'home' ? 'انتصار مستحق!' : 'خسارة مثيرة'}</h2><div className="final-score"><span>{result.homeScore}</span><em>–</em><span>{result.awayScore}</span></div>{result.homePenalties !== undefined && <p className="penalties">{result.homePenalties} – {result.awayPenalties} بركلات الترجيح</p>}<div className="result-card"><small>أفضل لاعب</small><PlayerCard player={result.mvp} compact/></div><div className="reason"><b>لماذا انتهت هكذا؟</b><p>{result.reason}</p></div><button className="primary-button" onClick={startSearch}>العب مباراة أخرى</button><button className="ghost-button" onClick={reset}>العودة للرئيسية</button></section>}
  </main>
}
export default App
