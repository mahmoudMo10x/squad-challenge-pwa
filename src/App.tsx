import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { chooseAiPlayer, createOffers, createRng } from './game/draft'
import { positionLabel, slotOrder } from './game/players'
import { simulateMatch } from './game/simulation'
import { countCards, chooseAiCardAction, consumeCard, addCard, stealPlayer, swapPlayer } from './game/cards'
import { buildCardSchedule } from './game/cardSchedule'
import type { BoxOffer, CardInventory, CardType, Formation, MatchResult, Player, SquadSetup, Tactic } from './game/types'
import { FormationPitch } from './components/FormationPitch'
import { MatchRadar } from './components/MatchRadar'
import { PlayerAvatar } from './components/PlayerAvatar'
import OnlineGame from './OnlineGame'

type Screen = 'home' | 'online' | 'searching' | 'draft' | 'cards' | 'formation' | 'simulation' | 'result'
const formations: Formation[] = ['2-2-2', '3-2-1', '2-3-1', '1-3-2']
const tactics: Tactic[] = ['متوازن', 'هجومي', 'دفاعي', 'ضغط عالٍ', 'مرتدات']
const cardIcon = (card: CardType) => card ? ({ حماية: '🛡️', سرقة: '🗡️', كشف: '👁️', تبديل: '🔄' } as const)[card] : ''

function CardInventoryStrip({ cards }: { cards: CardInventory }) {
  const visible: Array<{ type: 'سرقة' | 'كشف' | 'تبديل'; label: string; emoji: string }> = [
    { type: 'كشف', label: 'كشف', emoji: '👁️' },
    { type: 'سرقة', label: 'سرقة', emoji: '🗡️' },
    { type: 'تبديل', label: 'تبديل', emoji: '🔄' },
  ]
  const items = visible
    .map((slot) => ({ ...slot, count: countCards(cards, slot.type) }))
    .filter((slot) => slot.count > 0)
  if (!items.length) return null
  return (
    <div className="profile-inventory" aria-label="المخزون">
      {items.map((slot) => (
        <span key={slot.type} className="profile-inventory-chip">
          <span className="chip-icon">{slot.emoji}</span>
          <span className="chip-count">{slot.count}</span>
        </span>
      ))}
    </div>
  )
}

function ProfileHeader({ name, id, side, cards, badge }: { name: string; id: string; side: 'top' | 'bottom'; cards: CardInventory; badge?: string }) {
  return (
    <div className={`profile-header profile-${side}`}>
      <div className="profile-id">
        <PlayerAvatar id={id} size={44} ringColor={side === 'bottom' ? '#e0b941' : '#f87171'} />
        <div className="profile-meta">
          <strong>{name}</strong>
          <small>{badge ?? (side === 'top' ? 'المنافس' : 'أنت')}</small>
        </div>
      </div>
      <CardInventoryStrip cards={cards} />
    </div>
  )
}

function BonusCardBadge({ card }: { card: CardType }) {
  if (!card) return null
  return <div className="box-bonus-card">{cardIcon(card)} {card}</div>
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [countdown, setCountdown] = useState(3)
  const [turnIndex, setTurnIndex] = useState(0)
  const [humanSquad, setHumanSquad] = useState<Player[]>([])
  const [aiSquad, setAiSquad] = useState<Player[]>([])
  const [humanCards, setHumanCards] = useState<CardInventory>([])
  const [aiCards, setAiCards] = useState<CardInventory>([])
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
  const [matchSeed, setMatchSeed] = useState(0)
  const [awayFormation, setAwayFormation] = useState<Formation>('2-2-2')
  const [awayTactic, setAwayTactic] = useState<Tactic>('متوازن')
  const usedIds = useRef(new Set<string>())
  const rng = useRef(createRng(Date.now()))
  const opponentName = 'فارس الملاعب'
  const userProfileId = 'profile-user-local'

  const reset = () => {
    usedIds.current = new Set(); rng.current = createRng(Date.now())
    setHumanSquad([]); setAiSquad([]); setHumanCards([]); setAiCards([]); setTurnIndex(0); setOffers([]); setRevealedId(null); setMandatory(false); setPeekMode(false); setPeekedIds(new Set()); setCardMode(null); setCardMessage(''); setResult(null); setElapsed(0); setMatchSeed(0)
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
    const schedule = buildCardSchedule(matchSeed || Date.now())
    const nextOffers = createOffers(position, usedIds.current, rng.current, turnIndex, schedule)
    setOffers(nextOffers); setRevealedId(null); setMandatory(false); setPeekMode(false); setPeekedIds(new Set())
    if (turnIndex % 2 === 1) {
      const timer = window.setTimeout(() => {
        const choice = chooseAiPlayer(nextOffers, rng.current)
        const player = choice.bonusCard === 'حماية' ? { ...choice.player, protected: true } : choice.player
        usedIds.current.add(player.id)
        setAiSquad((squad) => [...squad, player])
        if (choice.bonusCard && choice.bonusCard !== 'حماية') setAiCards((cards) => addCard(cards, choice.bonusCard))
        setTurnIndex((turn) => turn + 1)
      }, 1100)
      return () => window.clearTimeout(timer)
    }
  }, [screen, turnIndex, matchSeed])

  const commitHuman = (offer: BoxOffer) => {
    const player = offer.bonusCard === 'حماية' ? { ...offer.player, protected: true } : { ...offer.player }
    usedIds.current.add(player.id)
    setHumanSquad((squad) => [...squad, player])
    if (offer.bonusCard && offer.bonusCard !== 'حماية') setHumanCards((cards) => addCard(cards, offer.bonusCard))
    setTurnIndex((turn) => turn + 1)
  }
  const openBox = (offer: BoxOffer) => {
    if (turnIndex % 2 === 1 || offer.rejected || offer.opened) return
    if (peekMode) {
      setPeekedIds((current) => new Set(current).add(offer.id))
      setHumanCards((cards) => consumeCard(cards, 'كشف'))
      setPeekMode(false)
      return
    }
    setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, opened: true } : item))
    if (mandatory) window.setTimeout(() => commitHuman(offer), 650)
    else setRevealedId(offer.id)
  }
  const accept = () => { const offer = offers.find((item) => item.id === revealedId); if (offer) commitHuman(offer) }
  const reject = () => { setOffers((current) => current.map((item) => item.id === revealedId ? { ...item, rejected: true } : item)); setRevealedId(null); setMandatory(true) }

  const finishCardPhase = (nextHuman = humanSquad, nextAi = aiSquad, _nextHumanCards = humanCards, nextAiCards = aiCards, message = '') => {
    const ids = new Set([...nextHuman, ...nextAi].map((player) => player.id))
    const aiAction = chooseAiCardAction(nextAi, nextAiCards, nextHuman, ids, rng.current)
    setHumanSquad(aiAction.human); setAiSquad(aiAction.ai); setAiCards(aiAction.aiCards)
    setCardMessage([message, aiAction.message].filter(Boolean).join(' — '))
    window.setTimeout(() => setScreen('formation'), 1500)
  }
  const handleSteal = (targetId: string) => {
    const result = stealPlayer(humanSquad, aiSquad, targetId)
    if (!result) return
    const nextHumanCards = consumeCard(humanCards, 'سرقة')
    setHumanSquad(result.own); setAiSquad(result.opponent); setHumanCards(nextHumanCards)
    finishCardPhase(result.own, result.opponent, nextHumanCards, aiCards, `سرقت ${result.received.name} وأرسلت ${result.sent.name}`)
  }
  const handleSwap = (playerId: string) => {
    const ids = new Set([...humanSquad, ...aiSquad].map((player) => player.id))
    const result = swapPlayer(humanSquad, playerId, ids, rng.current)
    if (!result) return
    usedIds.current.add(result.replacement.id)
    const nextHumanCards = consumeCard(humanCards, 'تبديل')
    setHumanSquad(result.squad); setHumanCards(nextHumanCards)
    finishCardPhase(result.squad, aiSquad, nextHumanCards, aiCards, `استبدلت ${result.removed.name} وحصلت على ${result.replacement.name}`)
  }

  const startSimulation = () => {
    const homeSetup: SquadSetup = { formation, tactic }
    const af: Formation = formations[Math.floor(rng.current() * formations.length)]
    const at: Tactic = tactics[Math.floor(rng.current() * tactics.length)]
    setAwayFormation(af); setAwayTactic(at)
    const awaySetup: SquadSetup = { formation: af, tactic: at }
    const seed = Math.floor(rng.current() * 1_000_000)
    setMatchSeed(seed)
    setResult(simulateMatch(humanSquad, aiSquad, homeSetup, awaySetup, seed)); setElapsed(0); setScreen('simulation')
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

  // Score presentation — user perspective. In computer mode the user is always "home".
  const liveMyScore = currentEvent?.homeScore ?? 0
  const liveOpponentScore = currentEvent?.awayScore ?? 0
  const userWon = result?.winner === 'home'

  return <main className="app-shell" dir="rtl">
    {screen === 'home' && <section className="home-screen screen-enter"><div className="brand-mark">⚽</div><p className="eyebrow">اختياراتك تصنع الفوز</p><h1>تحدي<br/><span>التشكيلة</span></h1><p className="intro">اختر سبعة لاعبين، خاطِر بالصندوق الثاني، ثم شاهد فريقك يخوض المباراة.</p><button className="primary-button" onClick={() => setScreen('online')}>لعبة جديدة أونلاين <span>←</span></button><button className="ghost-button demo-button" onClick={startSearch}>تجربة ضد الكمبيوتر</button><div className="status-pill"><i/> MVP أونلاين</div></section>}
    {screen === 'online' && <OnlineGame onExit={reset}/>}
    {screen === 'searching' && <section className="search-screen screen-enter"><p className="eyebrow">مباراة جديدة</p><h2>جاري البحث عن منافس</h2><div className="radar"><span className="radar-avatar"><PlayerAvatar id="opponent-search" size={56} /></span><i/><i/><i/></div><strong className="countdown">{countdown || 'VS'}</strong><p>نجهّز الملعب والصناديق...</p></section>}
    {screen === 'draft' && <section className="draft-screen screen-enter">
      <ProfileHeader name={opponentName} id={`profile-ai-${userProfileId}`} side="top" cards={aiCards} badge={!humanTurn ? 'الدور الآن' : `${aiSquad.length} / 7`} />
      <div className="draft-center"><div className="round-line"><span>الجولة {Math.min(turnIndex + 1, 14)} من 14</span><strong>{positionLabel[currentPosition]}</strong></div><div className="pitch-lines"><i/></div>
      {!humanTurn ? <div className="waiting-card"><span className="spinner"/> المنافس يختار {positionLabel[currentPosition]}...</div> : <><p className="instruction">{peekMode ? 'اختر صندوقًا لتكشفه سرًا دون استهلاك محاولة' : mandatory ? 'رفضت الاختيار الأول — اختر صندوقك الإجباري' : revealedOffer ? 'هل تثق بهذا اللاعب؟' : 'اختر صندوقًا من الأربعة'}</p>{!mandatory && !revealedOffer && countCards(humanCards, 'كشف') > 0 && <button className={`reveal-action ${peekMode ? 'selected' : ''}`} onClick={() => setPeekMode((value) => !value)}>👁️ استخدام بطاقة كشف ({countCards(humanCards, 'كشف')})</button>}<div className="boxes">{offers.map((offer, index) => { const visible = offer.opened || peekedIds.has(offer.id); return <button key={offer.id} className={`mystery-box ${offer.opened ? 'opened' : ''} ${peekedIds.has(offer.id) ? 'peeked' : ''} ${offer.rejected ? 'rejected' : ''}`} onClick={() => openBox(offer)} disabled={Boolean(revealedOffer) || offer.rejected}>{visible ? <><div className="box-player-row"><PlayerAvatar id={offer.player.id} size={36} /><div><strong>{offer.player.name}</strong><small>{offer.player.position} • تقييم {offer.player.rating}</small></div></div>{offer.opened && offer.bonusCard && <BonusCardBadge card={offer.bonusCard}/>}{peekedIds.has(offer.id) && !offer.opened && <small className="peek-label">كشف سري — اضغط لاختياره</small>}</> : <><PlayerAvatar id={`unknown-${offer.id}`} size={42} /><span>؟</span><small>الصندوق {index + 1}</small></>}</button>})}</div>{revealedOffer && <div className="decision-bar"><button className="accept" onClick={accept}>قبول</button><button className="reject" onClick={reject}>رفض والمجازفة</button></div>}</>}
    </div>
      <ProfileHeader name="أنت" id={userProfileId} side="bottom" cards={humanCards} badge={humanTurn ? 'الدور الآن' : `${humanSquad.length} / 7`} />
    </section>}
    {screen === 'cards' && <section className="cards-screen screen-enter"><p className="eyebrow">مرحلة البطاقات</p><h2>فرصة أخيرة قبل التشكيل</h2>{cardMessage ? <div className="card-message"><span className="spinner"/>{cardMessage}</div> : <><div className="card-inventory"><button disabled={!countCards(humanCards, 'سرقة')} className={cardMode === 'سرقة' ? 'selected' : ''} onClick={() => setCardMode('سرقة')}>🗡️ سرقة <b>{countCards(humanCards, 'سرقة')}</b></button><button disabled={!countCards(humanCards, 'تبديل')} className={cardMode === 'تبديل' ? 'selected' : ''} onClick={() => setCardMode('تبديل')}>🔄 تبديل <b>{countCards(humanCards, 'تبديل')}</b></button></div><p className="card-help">{cardMode === 'سرقة' ? 'اختر لاعبًا غير محمي من المنافس. سنرسل أضعف لاعب لديك في المركز نفسه.' : cardMode === 'تبديل' ? 'اختر لاعبًا من فريقك لاستبداله بلاعب مجهول من المركز نفسه.' : 'يمكنك استخدام بطاقة فعالة واحدة فقط أو التخطي.'}</p><div className="card-targets">{(cardMode === 'سرقة' ? aiSquad : humanSquad).map((player) => <button key={player.id} disabled={!cardMode || (cardMode === 'سرقة' && player.protected)} onClick={() => cardMode === 'سرقة' ? handleSteal(player.id) : handleSwap(player.id)}><PlayerAvatar id={player.id} size={44} /><strong>{player.name}</strong><small>{player.position} • {player.rating}</small>{player.protected && <small className="peek-label">🛡️ محمي</small>}</button>)}</div><button className="ghost-button" onClick={() => finishCardPhase()}>تخطي البطاقات</button></>}</section>}
    {screen === 'formation' && <section className="setup-screen screen-enter"><p className="eyebrow">اكتملت التشكيلة</p><h2>جهّز فريقك للمباراة</h2><FormationPitch squad={humanSquad} formation={formation} tactic={tactic} perspective="home" /><div className="option-group"><label>التشكيل</label><div className="option-grid">{formations.map((item) => <button className={formation === item ? 'selected' : ''} onClick={() => setFormation(item)} key={item}>{item}</button>)}</div></div><div className="option-group"><label>التكتيك</label><div className="option-grid">{tactics.map((item) => <button className={tactic === item ? 'selected' : ''} onClick={() => setTactic(item)} key={item}>{item}</button>)}</div></div><button className="primary-button" onClick={startSimulation}>ابدأ المباراة</button></section>}
    {screen === 'simulation' && result && <section className="match-screen screen-enter"><div className="scoreboard"><div><PlayerAvatar id={`profile-ai-${userProfileId}`} size={36} ringColor="#f87171" /><small>{opponentName}</small></div><strong>{liveOpponentScore} <em>–</em> {liveMyScore}</strong><div><PlayerAvatar id={userProfileId} size={36} ringColor="#e0b941" /><small>أنت</small></div></div><div className="clock"><span style={{ width: `${(elapsed / 60) * 100}%` }}/><b>{elapsed}'</b></div><MatchRadar homeFormation={formation} awayFormation={awayFormation} homeTactic={tactic} awayTactic={awayTactic} seed={matchSeed} events={result.events} elapsed={elapsed} yourSide="home" homeSquad={humanSquad} awaySquad={aiSquad} /><div className="event-feed">{visibleEvents.map((event, index) => <p className={event.type === 'goal' ? 'goal-event' : ''} key={`${event.minute}-${index}`}><b>{event.minute}'</b>{event.text}</p>)}</div></section>}
    {screen === 'result' && result && <section className="result-screen screen-enter"><p className="eyebrow">انتهت المباراة</p><h2 className={userWon ? 'win' : 'loss'}>{userWon ? 'انتصار مستحق!' : 'خسارة مثيرة'}</h2><div className="final-score"><span>{liveMyScore}</span><em>–</em><span>{liveOpponentScore}</span></div>{result.homePenalties !== undefined && <p className="penalties">{result.homePenalties} – {result.awayPenalties} بركلات الترجيح</p>}<div className="result-card"><small>أفضل لاعب</small><div className="result-mvp"><PlayerAvatar id={result.mvp.id} size={56} /><strong>{result.mvp.name}</strong><small>{result.mvp.position} • تقييم {result.mvp.rating}</small></div></div><div className="reason"><b>لماذا انتهت هكذا؟</b><p>{result.reason}</p></div><button className="primary-button" onClick={startSearch}>العب مباراة أخرى</button><button className="ghost-button" onClick={reset}>العودة للرئيسية</button></section>}
  </main>
}
export default App
