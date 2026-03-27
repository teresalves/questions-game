var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/questions.ts
var PACKS = [
  {
    id: "sfw",
    name: "Party Mode",
    description: "Clean fun for everyone",
    questions: [
      "forget their own birthday",
      "survive a zombie apocalypse",
      "accidentally become famous",
      "get lost in their own neighborhood",
      "win a hot dog eating contest",
      "become a millionaire by accident",
      "trip on a flat surface",
      "cry during a Disney movie",
      "talk their way out of a speeding ticket",
      "fall asleep during their own wedding",
      "befriend a wild animal",
      "start a cult without realizing it",
      "go viral on the internet for something embarrassing",
      "survive on a deserted island the longest",
      "accidentally set something on fire",
      "get into a fight with a toddler and lose",
      "become president of a small country",
      "eat something off the floor",
      "sleep through an earthquake",
      "show up to the wrong wedding and stay",
      "laugh at the worst possible moment",
      "get banned from a buffet",
      "accidentally send a text to the wrong person",
      "win a reality TV show",
      "adopt 10 cats",
      "become a supervillain",
      "forget where they parked for 3 hours",
      "start a flash mob in a grocery store",
      "get arrested for something ridiculous",
      "still use a flip phone in 2030"
    ]
  },
  {
    id: "nsfw",
    name: "After Dark",
    description: "Adults only, no filter",
    questions: [
      "hook up with their boss",
      "get caught watching something embarrassing",
      "send a spicy text to the wrong person",
      "get kicked out of a bar for being too rowdy",
      "wake up in a stranger's bed with no memory",
      "accidentally flash someone in public",
      "have a one night stand and forget their name",
      "get drunk and confess their deepest secret",
      "skinny dip in a public fountain",
      "date two people at the same time",
      "get caught doing the walk of shame",
      "drunk-text their ex at 3am",
      "start a fight at a party over nothing",
      "throw up on someone during a date",
      "get banned from a strip club",
      "lose their clothes on a night out",
      "wake up with a tattoo they don't remember getting",
      "pass out in someone's front yard",
      "get caught talking dirty to themselves",
      "make out with a stranger for a free drink",
      "get blackout drunk at a work event",
      "accidentally like an ex's photo from 3 years ago at 2am",
      "have the most embarrassing browser history",
      "be the loudest person in bed",
      "ghost someone after a great date"
    ]
  },
  {
    id: "dev",
    name: "Software Engineers",
    description: "For the technically inclined",
    questions: [
      "push directly to main on a Friday at 5pm",
      "write code with zero comments and call it 'self-documenting'",
      "mass-reject pull requests for missing semicolons",
      "spend 6 hours debugging only to find a typo",
      "deploy to production without testing",
      "rewrite the entire codebase in Rust 'for fun'",
      "have 200 open browser tabs of Stack Overflow",
      "accidentally drop the production database",
      "use Comic Sans in their IDE",
      "write a 500-line function and call it clean",
      "argue about tabs vs spaces for 3 hours",
      "automate a 5-minute task with a 3-week script",
      "claim 'it works on my machine' with a straight face",
      "name their variables a, b, c, aa, bb, cc",
      "mass-commit with the message 'fixed stuff'",
      "use AI to write their entire PR and pretend they did it",
      "fall asleep during a standup meeting",
      "have a mass-meltdown over a merge conflict",
      "build their own framework instead of using an existing one",
      "have the most unread Slack messages",
      "accidentally expose API keys on GitHub",
      "refuse to use any library they didn't write themselves",
      "mass-quit after a failed deployment",
      "write unit tests after the deadline",
      "use a 10-year-old version of Node.js in production",
      "have the most chaotic .vimrc / .bashrc",
      "mass-refactor code the night before a release",
      "add a TODO comment and never come back to it",
      "mass-over-engineer a simple CRUD app",
      "mass-delete a branch someone was still using"
    ]
  }
];
function getQuestions(packIds) {
  const selected = PACKS.filter((p) => packIds.includes(p.id));
  if (selected.length === 0) {
    return PACKS[0].questions;
  }
  const all = selected.flatMap((p) => p.questions);
  return [...new Set(all)];
}
__name(getQuestions, "getQuestions");

// src/game-room.ts
var DEFAULT_SETTINGS = {
  numQuestions: 5,
  timeout: 20,
  packs: ["sfw"]
};
var GameRoom = class {
  state;
  game;
  constructor(state, _env) {
    this.state = state;
    this.game = {
      phase: "lobby",
      players: /* @__PURE__ */ new Map(),
      questions: [],
      currentQuestionIndex: 0,
      votes: /* @__PURE__ */ new Map(),
      scores: /* @__PURE__ */ new Map(),
      timer: null,
      roomCode: "",
      settings: { ...DEFAULT_SETTINGS }
    };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      server.accept();
      server.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(server, data);
        } catch (e) {
          server.send(JSON.stringify({ type: "error", message: "Invalid message" }));
        }
      });
      server.addEventListener("close", () => {
        this.removePlayer(server);
      });
      server.addEventListener("error", () => {
        this.removePlayer(server);
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === "/status") {
      return new Response(
        JSON.stringify({
          phase: this.game.phase,
          playerCount: this.game.players.size,
          roomCode: this.game.roomCode
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response("Not found", { status: 404 });
  }
  handleMessage(ws, data) {
    switch (data.type) {
      case "join":
        this.handleJoin(ws, data);
        break;
      case "start":
        this.handleStart(ws, data);
        break;
      case "vote":
        this.handleVote(ws, data);
        break;
      case "next":
        this.handleNext(ws);
        break;
      case "play-again":
        this.handlePlayAgain(ws);
        break;
      default:
        ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
    }
  }
  getPlayerId(ws) {
    for (const [id, player] of this.game.players) {
      if (player.ws === ws)
        return id;
    }
    return null;
  }
  handleJoin(ws, data) {
    if (this.game.phase !== "lobby") {
      ws.send(JSON.stringify({ type: "error", message: "Game already in progress" }));
      return;
    }
    const playerId = crypto.randomUUID().slice(0, 8);
    const isHost = this.game.players.size === 0;
    if (isHost && data.roomCode) {
      this.game.roomCode = data.roomCode;
    }
    this.game.players.set(playerId, {
      name: data.name,
      ws,
      isHost
    });
    ws.send(
      JSON.stringify({
        type: "joined",
        playerId,
        isHost,
        roomCode: this.game.roomCode
      })
    );
    this.broadcastLobby();
  }
  handleStart(ws, data) {
    const playerId = this.getPlayerId(ws);
    if (!playerId)
      return;
    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game" }));
      return;
    }
    if (this.game.players.size < 2) {
      ws.send(JSON.stringify({ type: "error", message: "Need at least 2 players" }));
      return;
    }
    if (data.settings) {
      const s = data.settings;
      this.game.settings.numQuestions = Math.max(1, Math.min(20, s.numQuestions ?? DEFAULT_SETTINGS.numQuestions));
      this.game.settings.timeout = Math.max(5, Math.min(60, s.timeout ?? DEFAULT_SETTINGS.timeout));
      if (Array.isArray(s.packs) && s.packs.length > 0) {
        this.game.settings.packs = s.packs;
      }
    }
    const allQuestions = getQuestions(this.game.settings.packs);
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    this.game.questions = shuffled.slice(0, Math.min(this.game.settings.numQuestions, shuffled.length));
    this.game.currentQuestionIndex = 0;
    for (const [id] of this.game.players) {
      this.game.scores.set(id, 0);
    }
    this.startQuestion();
  }
  startQuestion() {
    this.game.phase = "question";
    this.game.votes = /* @__PURE__ */ new Map();
    const question = this.game.questions[this.game.currentQuestionIndex];
    const players = this.getPlayerList();
    const timeout = this.game.settings.timeout;
    this.broadcast({
      type: "question",
      question: `Who is most likely to ${question}?`,
      questionNumber: this.game.currentQuestionIndex + 1,
      totalQuestions: this.game.questions.length,
      players,
      timeLimit: timeout
    });
    if (this.game.timer) {
      clearTimeout(this.game.timer);
    }
    this.game.timer = setTimeout(() => {
      this.endVoting();
    }, timeout * 1e3);
  }
  handleVote(ws, data) {
    if (this.game.phase !== "question") {
      ws.send(JSON.stringify({ type: "error", message: "Not in voting phase" }));
      return;
    }
    const playerId = this.getPlayerId(ws);
    if (!playerId)
      return;
    if (!this.game.players.has(data.votedFor)) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid player" }));
      return;
    }
    this.game.votes.set(playerId, data.votedFor);
    ws.send(JSON.stringify({ type: "voted", votedFor: data.votedFor }));
    this.broadcast({
      type: "voteCount",
      count: this.game.votes.size,
      total: this.game.players.size
    });
    if (this.game.votes.size === this.game.players.size) {
      if (this.game.timer) {
        clearTimeout(this.game.timer);
        this.game.timer = null;
      }
      this.endVoting();
    }
  }
  endVoting() {
    this.game.phase = "results";
    this.game.timer = null;
    const voteCounts = {};
    for (const [id] of this.game.players) {
      voteCounts[id] = 0;
    }
    for (const [, votedForId] of this.game.votes) {
      voteCounts[votedForId] = (voteCounts[votedForId] || 0) + 1;
    }
    for (const [id, count] of Object.entries(voteCounts)) {
      this.game.scores.set(id, (this.game.scores.get(id) || 0) + count);
    }
    const results = Object.entries(voteCounts).map(([id, count]) => ({
      playerId: id,
      name: this.game.players.get(id)?.name || "Unknown",
      votes: count
    })).sort((a, b) => b.votes - a.votes);
    const isLastQuestion = this.game.currentQuestionIndex >= this.game.questions.length - 1;
    this.broadcast({
      type: "results",
      question: `Who is most likely to ${this.game.questions[this.game.currentQuestionIndex]}?`,
      results,
      questionNumber: this.game.currentQuestionIndex + 1,
      totalQuestions: this.game.questions.length,
      isLastQuestion
    });
  }
  handleNext(ws) {
    const playerId = this.getPlayerId(ws);
    if (!playerId)
      return;
    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can advance" }));
      return;
    }
    if (this.game.phase !== "results")
      return;
    this.game.currentQuestionIndex++;
    if (this.game.currentQuestionIndex >= this.game.questions.length) {
      this.showFinalResults();
    } else {
      this.startQuestion();
    }
  }
  showFinalResults() {
    this.game.phase = "final";
    const finalScores = Array.from(this.game.scores.entries()).map(([id, score]) => ({
      playerId: id,
      name: this.game.players.get(id)?.name || "Unknown",
      totalVotes: score
    })).sort((a, b) => b.totalVotes - a.totalVotes);
    this.broadcast({
      type: "final",
      scores: finalScores
    });
  }
  handlePlayAgain(ws) {
    const playerId = this.getPlayerId(ws);
    if (!playerId)
      return;
    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can restart" }));
      return;
    }
    if (this.game.phase !== "final")
      return;
    this.game.phase = "lobby";
    this.game.questions = [];
    this.game.currentQuestionIndex = 0;
    this.game.votes = /* @__PURE__ */ new Map();
    this.game.scores = /* @__PURE__ */ new Map();
    if (this.game.timer) {
      clearTimeout(this.game.timer);
      this.game.timer = null;
    }
    this.broadcastLobby();
  }
  removePlayer(ws) {
    const playerId = this.getPlayerId(ws);
    if (!playerId)
      return;
    const wasHost = this.game.players.get(playerId)?.isHost;
    this.game.players.delete(playerId);
    if (wasHost && this.game.phase === "lobby" && this.game.players.size > 0) {
      const firstPlayer = this.game.players.values().next().value;
      if (firstPlayer) {
        firstPlayer.isHost = true;
        firstPlayer.ws.send(
          JSON.stringify({ type: "promoted", isHost: true })
        );
      }
    }
    this.broadcastLobby();
    if (this.game.phase === "question") {
      this.game.votes.delete(playerId);
      if (this.game.players.size > 0 && this.game.votes.size >= this.game.players.size) {
        if (this.game.timer) {
          clearTimeout(this.game.timer);
          this.game.timer = null;
        }
        this.endVoting();
      }
    }
  }
  getPlayerList() {
    return Array.from(this.game.players.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      isHost: p.isHost
    }));
  }
  broadcastLobby() {
    this.broadcast({
      type: "lobby",
      players: this.getPlayerList(),
      roomCode: this.game.roomCode
    });
  }
  broadcast(message) {
    const msg = JSON.stringify(message);
    for (const [, player] of this.game.players) {
      try {
        player.ws.send(msg);
      } catch {
      }
    }
  }
};
__name(GameRoom, "GameRoom");

// src/worker.ts
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/create-room") {
      const roomCode = generateRoomCode();
      const id = env.GAME_ROOM.idFromName(roomCode);
      return new Response(JSON.stringify({ roomCode }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname.startsWith("/api/room/")) {
      const roomCode = url.pathname.split("/")[3]?.toUpperCase();
      if (!roomCode) {
        return new Response("Missing room code", { status: 400 });
      }
      const id = env.GAME_ROOM.idFromName(roomCode);
      const room = env.GAME_ROOM.get(id);
      const statusUrl = new URL(request.url);
      statusUrl.pathname = "/status";
      const resp = await room.fetch(statusUrl.toString());
      return resp;
    }
    if (url.pathname.startsWith("/ws/")) {
      const roomCode = url.pathname.split("/")[2]?.toUpperCase();
      if (!roomCode) {
        return new Response("Missing room code", { status: 400 });
      }
      const id = env.GAME_ROOM.idFromName(roomCode);
      const room = env.GAME_ROOM.get(id);
      const wsUrl = new URL(request.url);
      wsUrl.pathname = "/ws";
      return room.fetch(wsUrl.toString(), request);
    }
    return new Response("Not found", { status: 404 });
  }
};
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
__name(generateRoomCode, "generateRoomCode");
export {
  GameRoom,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
