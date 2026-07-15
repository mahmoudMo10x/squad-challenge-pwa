// server/index.ts
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";

// src/game/players.ts
var firstNames = ["\u0631\u0627\u0634\u062F", "\u0632\u064A\u0627\u062F", "\u064A\u0627\u0633\u0631", "\u0645\u0631\u0648\u0627\u0646", "\u0633\u0644\u064A\u0645", "\u0639\u0645\u0631", "\u062A\u0627\u0645\u0631", "\u0646\u0627\u062F\u0631", "\u0641\u0627\u0631\u0633", "\u0623\u0643\u0631\u0645", "\u0647\u064A\u062B\u0645", "\u0645\u0635\u0639\u0628", "\u0628\u062F\u0631", "\u0631\u0627\u0645\u064A", "\u062C\u0627\u062F", "\u0623\u0646\u0633", "\u0633\u064A\u0641", "\u0648\u0644\u064A\u062F", "\u0643\u0646\u0627\u0646", "\u0645\u0627\u0632\u0646", "\u062D\u0633\u0627\u0645", "\u0644\u0624\u064A", "\u0646\u0627\u064A\u0641", "\u0643\u0631\u064A\u0645", "\u0645\u0647\u0646\u062F"];
var lastNames = ["\u0627\u0644\u0633\u0627\u0644\u0645\u064A", "\u0627\u0644\u0646\u062C\u0627\u0631", "\u0627\u0644\u062D\u0631\u0628\u064A", "\u0643\u0645\u0627\u0644", "\u0627\u0644\u0642\u062D\u0637\u0627\u0646\u064A", "\u0634\u0627\u0647\u064A\u0646", "\u0641\u0624\u0627\u062F", "\u0639\u0627\u062F\u0644", "\u0627\u0644\u062F\u0648\u0633\u0631\u064A", "\u0646\u0627\u0635\u0631", "\u062C\u0627\u0628\u0631", "\u0639\u0648\u0636", "\u0645\u0646\u0635\u0648\u0631", "\u062E\u0637\u0627\u0628", "\u0645\u0631\u0627\u062F", "\u0634\u0631\u064A\u0641", "\u0631\u0628\u064A\u0639", "\u0634\u0648\u0642\u064A", "\u062D\u0645\u062F", "\u062E\u0644\u064A\u0644"];
var cards = [null, null, null, null, null, "\u062D\u0645\u0627\u064A\u0629", "\u0633\u0631\u0642\u0629", "\u0643\u0634\u0641", "\u062A\u0628\u062F\u064A\u0644"];
var distribution = [
  { position: "GK", count: 60 },
  { position: "DEF", count: 145 },
  { position: "MID", count: 155 },
  { position: "FWD", count: 140 }
];
var hash = (value) => [...value].reduce((acc, char) => acc * 31 + char.charCodeAt(0) >>> 0, 2166136261);
var PLAYERS = distribution.flatMap(
  ({ position, count }) => Array.from({ length: count }, (_, index) => {
    const globalNameIndex = distribution.slice(0, distribution.findIndex((item) => item.position === position)).reduce((sum, item) => sum + item.count, 0) + index;
    const name = `${firstNames[globalNameIndex % firstNames.length]} ${lastNames[Math.floor(globalNameIndex / firstNames.length) % lastNames.length]}`;
    const seed = hash(`${position}-${index}-${name}`);
    const rating = 66 + seed % 28;
    return {
      id: `sc-${position.toLowerCase()}-${String(index + 1).padStart(3, "0")}`,
      name,
      position,
      rating,
      pace: 50 + (seed >>> 2) % 47,
      attack: position === "GK" ? 20 + (seed >>> 4) % 20 : 50 + (seed >>> 5) % 47,
      passing: 48 + (seed >>> 8) % 49,
      defense: position === "GK" ? 45 + (seed >>> 9) % 35 : 48 + (seed >>> 11) % 49,
      stamina: 54 + (seed >>> 14) % 43,
      card: cards[(seed >>> 17) % cards.length]
    };
  })
);
var slotOrder = ["GK", "DEF", "DEF", "MID", "MID", "FWD", "FWD"];

// src/game/draft.ts
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 >>> 0;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

// src/game/cards.ts
var activeCardCount = (squad, type) => squad.filter((player) => player.card === type).length;
function consumeCard(squad, type) {
  let consumed = false;
  return squad.map((player) => {
    if (!consumed && player.card === type) {
      consumed = true;
      return { ...player, card: null };
    }
    return player;
  });
}
function stealPlayer(own, opponent, targetId) {
  const target = opponent.find((player) => player.id === targetId);
  if (!target || target.protected) return null;
  const candidates = own.filter((player) => player.position === target.position);
  if (!candidates.length) return null;
  const sent = [...candidates].sort((a, b) => a.rating - b.rating)[0];
  return {
    own: own.map((player) => player.id === sent.id ? target : player),
    opponent: opponent.map((player) => player.id === target.id ? sent : player),
    received: target,
    sent
  };
}
function swapPlayer(squad, playerId, unavailableIds, rng) {
  const current = squad.find((player) => player.id === playerId);
  if (!current) return null;
  const pool = PLAYERS.filter((player) => player.position === current.position && !unavailableIds.has(player.id));
  if (!pool.length) return null;
  const replacement = { ...pool[Math.floor(rng() * pool.length)], protected: false, card: null };
  return {
    squad: squad.map((player) => player.id === current.id ? replacement : player),
    removed: current,
    replacement
  };
}

// src/game/simulation.ts
var tacticModifier = {
  "\u0647\u062C\u0648\u0645\u064A": { attack: 3, defense: -2, stamina: -1 },
  "\u0645\u062A\u0648\u0627\u0632\u0646": { attack: 0, defense: 0, stamina: 0 },
  "\u062F\u0641\u0627\u0639\u064A": { attack: -2, defense: 3, stamina: 1 },
  "\u0636\u063A\u0637 \u0639\u0627\u0644\u064D": { attack: 2, defense: 1, stamina: -4 },
  "\u0645\u0631\u062A\u062F\u0627\u062A": { attack: 2, defense: 1, stamina: -1 }
};
var formationModifier = {
  "2-2-2": { attack: 0, defense: 0 },
  "3-2-1": { attack: -3, defense: 5 },
  "2-3-1": { attack: 1, defense: 2 },
  "1-3-2": { attack: 5, defense: -4 }
};
function squadPower(squad, setup) {
  const base = squad.reduce((sum, player) => sum + player.rating, 0) / squad.length;
  const attack = squad.reduce((sum, player) => sum + player.attack, 0) / squad.length;
  const defense = squad.reduce((sum, player) => sum + player.defense, 0) / squad.length;
  const stamina = squad.reduce((sum, player) => sum + player.stamina, 0) / squad.length;
  const tactic = tacticModifier[setup.tactic];
  const formation = formationModifier[setup.formation];
  return {
    total: base * 0.55 + attack * 0.2 + defense * 0.18 + stamina * 0.07 + tactic.attack * 0.5 + tactic.defense * 0.5 + tactic.stamina * 0.25 + formation.attack * 0.5 + formation.defense * 0.5,
    attack: attack + tactic.attack + formation.attack,
    defense: defense + tactic.defense + formation.defense
  };
}
function simulateMatch(home, away, homeSetup, awaySetup, seed) {
  const rng = createRng(seed);
  const hp = squadPower(home, homeSetup);
  const ap = squadPower(away, awaySetup);
  let homeScore = 0;
  let awayScore = 0;
  const events = [{ minute: 0, type: "kickoff", text: "\u0627\u0646\u0637\u0644\u0642\u062A \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629", homeScore, awayScore }];
  for (let minute = 3; minute < 60; minute += 3 + Math.floor(rng() * 5)) {
    if (minute >= 29 && !events.some((event) => event.type === "halftime")) {
      events.push({ minute: 30, type: "halftime", text: "\u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u0634\u0648\u0637 \u0627\u0644\u0623\u0648\u0644", homeScore, awayScore });
    }
    const homeChance = Math.max(0.32, Math.min(0.68, 0.5 + (hp.total - ap.total) / 75));
    const team = rng() < homeChance ? "home" : "away";
    const attack = team === "home" ? hp.attack : ap.attack;
    const defense = team === "home" ? ap.defense : hp.defense;
    const goalProbability = Math.max(0.12, Math.min(0.42, 0.24 + (attack - defense) / 180));
    if (rng() < goalProbability) {
      if (team === "home") homeScore += 1;
      else awayScore += 1;
      events.push({ minute, type: "goal", team, text: team === "home" ? "\u0647\u062F\u0641 \u0631\u0627\u0626\u0639 \u0644\u0641\u0631\u064A\u0642\u0643!" : "\u0647\u062F\u0641 \u0644\u0644\u0645\u0646\u0627\u0641\u0633", homeScore, awayScore });
    } else {
      const saved = rng() < 0.48;
      events.push({ minute, type: saved ? "save" : "chance", team, text: saved ? "\u062A\u0635\u062F\u064A \u062D\u0627\u0633\u0645 \u0645\u0646 \u0627\u0644\u062D\u0627\u0631\u0633" : "\u0641\u0631\u0635\u0629 \u062E\u0637\u064A\u0631\u0629 \u062A\u0645\u0631 \u0628\u062C\u0648\u0627\u0631 \u0627\u0644\u0645\u0631\u0645\u0649", homeScore, awayScore });
    }
  }
  events.push({ minute: 60, type: "fulltime", text: "\u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u0623\u0635\u0644\u064A", homeScore, awayScore });
  let homePenalties;
  let awayPenalties;
  if (homeScore === awayScore) {
    homePenalties = 0;
    awayPenalties = 0;
    for (let kick = 0; kick < 5; kick += 1) {
      if (rng() < Math.max(0.58, Math.min(0.9, 0.74 + (hp.total - ap.total) / 250))) homePenalties += 1;
      if (rng() < Math.max(0.58, Math.min(0.9, 0.74 + (ap.total - hp.total) / 250))) awayPenalties += 1;
    }
    while (homePenalties === awayPenalties) {
      const h = rng() < 0.74;
      const a = rng() < 0.74;
      if (h) homePenalties += 1;
      if (a) awayPenalties += 1;
    }
  }
  const winner = homeScore !== awayScore ? homeScore > awayScore ? "home" : "away" : (homePenalties ?? 0) > (awayPenalties ?? 0) ? "home" : "away";
  const winningSquad = winner === "home" ? home : away;
  const mvp = [...winningSquad].sort((a, b) => b.rating - a.rating)[0];
  const difference = Math.abs(hp.total - ap.total);
  const reason = difference < 2 ? "\u062D\u064F\u0633\u0645\u062A \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629 \u0628\u062A\u0641\u0627\u0635\u064A\u0644 \u0635\u063A\u064A\u0631\u0629 \u0648\u062D\u0633\u0646 \u0627\u0633\u062A\u063A\u0644\u0627\u0644 \u0627\u0644\u0641\u0631\u0635." : winner === (hp.total > ap.total ? "home" : "away") ? "\u062A\u0641\u0648\u0642 \u0627\u0644\u0641\u0631\u064A\u0642 \u0627\u0644\u0641\u0627\u0626\u0632 \u0641\u064A \u062C\u0648\u062F\u0629 \u0627\u0644\u062A\u0634\u0643\u064A\u0644\u0629 \u0648\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u062A\u0643\u062A\u064A\u0643." : "\u0642\u0644\u0628 \u0627\u0644\u0641\u0631\u064A\u0642 \u0627\u0644\u0641\u0627\u0626\u0632 \u0627\u0644\u062A\u0648\u0642\u0639\u0627\u062A \u0628\u0641\u0627\u0639\u0644\u064A\u0629 \u0623\u0643\u0628\u0631 \u0623\u0645\u0627\u0645 \u0627\u0644\u0645\u0631\u0645\u0649.";
  return { events, homeScore, awayScore, homePenalties, awayPenalties, winner, homePower: hp.total, awayPower: ap.total, reason, mvp };
}

// server/index.ts
var app = express();
var httpServer = createServer(app);
var allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
var io = new Server(httpServer, { cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true } });
var waiting = [];
var matches = /* @__PURE__ */ new Map();
var tokenToMatch = /* @__PURE__ */ new Map();
var TURN_MS = Number(process.env.TURN_MS ?? 3e4);
var RECONNECT_MS = Number(process.env.RECONNECT_MS ?? 45e3);
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: { directives: { "connect-src": ["'self'", ...allowedOrigins.length ? allowedOrigins : []] } } }));
app.use(rateLimit({ windowMs: 6e4, limit: 180, standardHeaders: true, legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ ok: true, waiting: waiting.length, matches: matches.size }));
app.use(express.static("dist"));
app.use((_req, res) => res.sendFile("index.html", { root: "dist" }));
function precommitOffers(rng) {
  const pools = /* @__PURE__ */ new Map();
  for (const position of ["GK", "DEF", "MID", "FWD"]) {
    const pool = PLAYERS.filter((player) => player.position === position);
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [pool[index], pool[target]] = [pool[target], pool[index]];
    }
    pools.set(position, pool);
  }
  return Array.from({ length: 14 }, (_, turn) => {
    const position = slotOrder[Math.floor(turn / 2)];
    return pools.get(position).splice(0, 4).map((player) => ({ id: randomUUID(), player: { ...player }, opened: false, rejected: false }));
  });
}
function socketFor(seat) {
  return seat.socketId ? io.sockets.sockets.get(seat.socketId) : void 0;
}
function publicSnapshot(match, you) {
  return {
    matchId: match.id,
    version: match.version,
    phase: match.phase,
    you,
    starter: match.starter,
    activePlayer: match.active,
    players: match.seats.map((seat, index) => ({ index, name: seat.name, connected: Boolean(seat.socketId), squad: seat.squad, setup: seat.setup })),
    turnIndex: match.turnIndex,
    slot: match.phase === "draft" ? slotOrder[Math.floor(match.turnIndex / 2)] : void 0,
    boxes: match.currentOffers.map((offer) => ({ id: offer.id, opened: offer.opened, rejected: offer.rejected, player: offer.opened ? offer.player : void 0 })),
    mandatory: match.mandatory,
    cardDone: match.cardDone,
    deadline: match.deadline,
    message: match.message,
    result: match.result
  };
}
function broadcast(match) {
  match.seats.forEach((seat, index) => socketFor(seat)?.emit("match:state", publicSnapshot(match, index)));
}
function fail(socket, code, message) {
  socket.emit("action:error", { code, message });
}
function seatOf(match, socket) {
  return match.seats.findIndex((seat) => seat.socketId === socket.id);
}
function validated(socket, payload) {
  const match = matches.get(payload.matchId);
  if (!match) {
    fail(socket, "MATCH_NOT_FOUND", "\u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629");
    return null;
  }
  if (match.version !== payload.version) {
    fail(socket, "STALE_STATE", "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629\u060C \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629");
    broadcast(match);
    return null;
  }
  const seat = seatOf(match, socket);
  if (seat < 0) {
    fail(socket, "NOT_SEATED", "\u0644\u0633\u062A \u0636\u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0645\u0628\u0627\u0631\u0627\u0629");
    return null;
  }
  return { match, seat };
}
function clearTimer(match) {
  if (match.timer) clearTimeout(match.timer);
  match.timer = void 0;
}
function armTimer(match) {
  clearTimer(match);
  match.deadline = Date.now() + TURN_MS;
  match.timer = setTimeout(() => autoAct(match), TURN_MS);
}
function advanceDraft(match, player) {
  match.seats[match.active].squad.push({ ...player, protected: player.card === "\u062D\u0645\u0627\u064A\u0629" });
  match.turnIndex += 1;
  match.version += 1;
  match.revealedId = void 0;
  match.mandatory = false;
  if (match.turnIndex >= 14) {
    clearTimer(match);
    match.phase = "cards";
    match.active = match.starter;
    match.deadline = void 0;
    armTimer(match);
  } else {
    match.active = match.turnIndex % 2 === 0 ? match.starter : 1 - match.starter;
    match.currentOffers = match.offers[match.turnIndex];
    armTimer(match);
  }
  broadcast(match);
}
function autoAct(match) {
  if (match.phase === "draft") {
    if (match.revealedId) {
      const offer = match.currentOffers.find((item) => item.id === match.revealedId);
      advanceDraft(match, offer.player);
    } else {
      const legal = match.currentOffers.filter((item) => !item.rejected && !item.opened);
      const offer = legal[Math.floor(match.rng() * legal.length)];
      offer.opened = true;
      if (match.mandatory) advanceDraft(match, offer.player);
      else {
        match.revealedId = offer.id;
        match.version += 1;
        armTimer(match);
        broadcast(match);
      }
    }
  } else if (match.phase === "cards") cardAction(match, match.active, "\u062A\u062E\u0637\u064A");
  else if (match.phase === "setup") lockSetup(match, match.active, "2-2-2", "\u0645\u062A\u0648\u0627\u0632\u0646");
}
function cardAction(match, seat, type, targetId) {
  if (match.phase !== "cards" || match.active !== seat || match.cardDone[seat]) return false;
  const other = 1 - seat;
  if (type === "\u0633\u0631\u0642\u0629") {
    if (!targetId || activeCardCount(match.seats[seat].squad, "\u0633\u0631\u0642\u0629") < 1) return false;
    const result = stealPlayer(match.seats[seat].squad, match.seats[other].squad, targetId);
    if (!result) return false;
    match.seats[seat].squad = consumeCard(result.own, "\u0633\u0631\u0642\u0629");
    match.seats[other].squad = result.opponent;
    match.message = `${match.seats[seat].name} \u0627\u0633\u062A\u062E\u062F\u0645 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0633\u0631\u0642\u0629`;
  } else if (type === "\u062A\u0628\u062F\u064A\u0644") {
    if (!targetId || activeCardCount(match.seats[seat].squad, "\u062A\u0628\u062F\u064A\u0644") < 1) return false;
    const unavailable = new Set(match.seats.flatMap((item) => item.squad.map((player) => player.id)));
    const result = swapPlayer(match.seats[seat].squad, targetId, unavailable, match.rng);
    if (!result) return false;
    match.seats[seat].squad = consumeCard(result.squad, "\u062A\u0628\u062F\u064A\u0644");
    match.message = `${match.seats[seat].name} \u0627\u0633\u062A\u062E\u062F\u0645 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062A\u0628\u062F\u064A\u0644`;
  }
  match.cardDone[seat] = true;
  match.version += 1;
  if (match.cardDone[0] && match.cardDone[1]) {
    clearTimer(match);
    match.phase = "setup";
    match.active = match.starter;
    armTimer(match);
  } else {
    match.active = other;
    armTimer(match);
  }
  broadcast(match);
  return true;
}
function lockSetup(match, seat, formation, tactic) {
  match.seats[seat].setup = { formation, tactic };
  match.version += 1;
  const other = 1 - seat;
  if (match.seats[other].setup) {
    clearTimer(match);
    match.phase = "simulation";
    match.result = simulateMatch(match.seats[0].squad, match.seats[1].squad, match.seats[0].setup, match.seats[1].setup, Math.floor(match.rng() * 2 ** 31));
    match.deadline = Date.now() + 6e4;
    match.timer = setTimeout(() => {
      match.phase = "result";
      match.version += 1;
      match.deadline = void 0;
      broadcast(match);
      setTimeout(() => {
        matches.delete(match.id);
        match.seats.forEach((seat2) => tokenToMatch.delete(seat2.token));
      }, 10 * 6e4);
    }, 6e4);
  } else {
    match.active = other;
    armTimer(match);
  }
  broadcast(match);
}
function createMatch(a, b) {
  const rng = createRng(Date.now() ^ Math.floor(Math.random() * 2 ** 31));
  const starter = rng() < 0.5 ? 0 : 1;
  const match = { id: randomUUID(), version: 1, phase: "draft", seats: [{ token: a.token, socketId: a.socketId, name: a.name, squad: [] }, { token: b.token, socketId: b.socketId, name: b.name, squad: [] }], starter, active: starter, turnIndex: 0, offers: [], currentOffers: [], mandatory: false, cardDone: [false, false], rng };
  match.offers = precommitOffers(rng);
  match.currentOffers = match.offers[0];
  matches.set(match.id, match);
  tokenToMatch.set(a.token, { matchId: match.id, seat: 0 });
  tokenToMatch.set(b.token, { matchId: match.id, seat: 1 });
  socketFor(match.seats[0])?.join(match.id);
  socketFor(match.seats[1])?.join(match.id);
  armTimer(match);
  broadcast(match);
}
io.on("connection", (socket) => {
  const actionTimes = [];
  socket.use((_event, next) => {
    const now = Date.now();
    while (actionTimes.length && now - actionTimes[0] > 1e3) actionTimes.shift();
    if (actionTimes.length >= 20) return next(new Error("RATE_LIMIT"));
    actionTimes.push(now);
    next();
  });
  socket.on("queue:join", ({ token, name }) => {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(token)) return fail(socket, "INVALID_TOKEN", "\u0631\u0645\u0632 \u0627\u0644\u062C\u0644\u0633\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
    const existing = tokenToMatch.get(token);
    if (existing) {
      const match = matches.get(existing.matchId);
      if (match) {
        match.seats[existing.seat].socketId = socket.id;
        match.seats[existing.seat].disconnectedAt = void 0;
        socket.join(match.id);
        broadcast(match);
        return;
      }
    }
    if (!waiting.some((item) => item.token === token)) waiting.push({ token, socketId: socket.id, name: name.trim().slice(0, 24) || "\u0644\u0627\u0639\u0628" });
    if (waiting.length >= 2) createMatch(waiting.shift(), waiting.shift());
    else socket.emit("queue:status", { waiting: true, position: waiting.length });
  });
  socket.on("queue:leave", () => {
    const index = waiting.findIndex((item) => item.socketId === socket.id);
    if (index >= 0) waiting.splice(index, 1);
  });
  socket.on("draft:open", (payload) => {
    const valid = validated(socket, payload);
    if (!valid) return;
    const { match, seat } = valid;
    if (match.phase !== "draft" || match.active !== seat || match.revealedId) return fail(socket, "ILLEGAL_ACTION", "\u0644\u064A\u0633 \u0645\u0633\u0645\u0648\u062D\u064B\u0627 \u0641\u062A\u062D \u0647\u0630\u0627 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u0627\u0644\u0622\u0646");
    const offer = match.currentOffers.find((item) => item.id === payload.boxId && !item.opened && !item.rejected);
    if (!offer) return fail(socket, "INVALID_BOX", "\u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
    offer.opened = true;
    match.version += 1;
    if (match.mandatory) advanceDraft(match, offer.player);
    else {
      match.revealedId = offer.id;
      armTimer(match);
      broadcast(match);
    }
  });
  socket.on("draft:decision", (payload) => {
    const valid = validated(socket, payload);
    if (!valid) return;
    const { match, seat } = valid;
    if (match.phase !== "draft" || match.active !== seat || !match.revealedId) return fail(socket, "ILLEGAL_ACTION", "\u0644\u0627 \u064A\u0648\u062C\u062F \u0627\u062E\u062A\u064A\u0627\u0631 \u064A\u0646\u062A\u0638\u0631 \u0627\u0644\u0642\u0631\u0627\u0631");
    const offer = match.currentOffers.find((item) => item.id === match.revealedId);
    if (payload.accept) advanceDraft(match, offer.player);
    else {
      offer.rejected = true;
      match.revealedId = void 0;
      match.mandatory = true;
      match.version += 1;
      armTimer(match);
      broadcast(match);
    }
  });
  socket.on("card:reveal", (payload) => {
    const valid = validated(socket, payload);
    if (!valid) return;
    const { match, seat } = valid;
    if (match.phase !== "draft" || match.active !== seat || match.revealedId || activeCardCount(match.seats[seat].squad, "\u0643\u0634\u0641") < 1) return fail(socket, "NO_REVEAL", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0637\u0627\u0642\u0629 \u0643\u0634\u0641 \u0635\u0627\u0644\u062D\u0629");
    const offer = match.currentOffers.find((item) => item.id === payload.boxId && !item.opened && !item.rejected);
    if (!offer) return fail(socket, "INVALID_BOX", "\u0627\u0644\u0635\u0646\u062F\u0648\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D");
    match.seats[seat].squad = consumeCard(match.seats[seat].squad, "\u0643\u0634\u0641");
    match.version += 1;
    socket.emit("card:peek", { boxId: offer.id, player: offer.player });
    broadcast(match);
  });
  socket.on("card:action", (payload) => {
    const valid = validated(socket, payload);
    if (!valid) return;
    if (!cardAction(valid.match, valid.seat, payload.type, payload.targetId)) fail(socket, "INVALID_CARD_ACTION", "\u062A\u0639\u0630\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0628\u0637\u0627\u0642\u0629");
  });
  socket.on("setup:lock", (payload) => {
    const valid = validated(socket, payload);
    if (!valid) return;
    if (valid.match.phase !== "setup" || valid.match.active !== valid.seat) return fail(socket, "INVALID_SETUP", "\u0644\u064A\u0633 \u062F\u0648\u0631 \u062A\u062B\u0628\u064A\u062A \u062A\u0634\u0643\u064A\u0644\u0643");
    lockSetup(valid.match, valid.seat, payload.formation, payload.tactic);
  });
  socket.on("disconnect", () => {
    const waitIndex = waiting.findIndex((item) => item.socketId === socket.id);
    if (waitIndex >= 0) waiting.splice(waitIndex, 1);
    for (const match of matches.values()) {
      const foundSeat = seatOf(match, socket);
      if (foundSeat < 0) continue;
      const seat = foundSeat;
      match.seats[seat].socketId = null;
      match.seats[seat].disconnectedAt = Date.now();
      broadcast(match);
      setTimeout(() => {
        if (!match.seats[seat].socketId && match.seats[seat].disconnectedAt && Date.now() - match.seats[seat].disconnectedAt >= RECONNECT_MS) {
          match.phase = "abandoned";
          match.message = `\u0627\u0646\u0633\u062D\u0628 ${match.seats[seat].name}`;
          match.version += 1;
          clearTimer(match);
          broadcast(match);
        }
      }, RECONNECT_MS + 50);
    }
  });
});
var port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => console.log(`Squad Challenge server listening on http://localhost:${port}`));
