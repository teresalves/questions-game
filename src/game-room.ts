import { getQuestions } from "./questions";

interface Player {
  name: string;
  ws: WebSocket;
  isHost: boolean;
}

interface GameSettings {
  numQuestions: number;
  timeout: number;
  packs: string[];
}

interface GameState {
  phase: "lobby" | "question" | "results" | "final";
  players: Map<string, Player>;
  questions: string[];
  currentQuestionIndex: number;
  votes: Map<string, string>;
  scores: Map<string, number>;
  timer: number | null;
  roomCode: string;
  settings: GameSettings;
}

const DEFAULT_SETTINGS: GameSettings = {
  numQuestions: 5,
  timeout: 20,
  packs: ["sfw"],
};

export class GameRoom implements DurableObject {
  private state: DurableObjectState;
  private game: GameState;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.game = {
      phase: "lobby",
      players: new Map(),
      questions: [],
      currentQuestionIndex: 0,
      votes: new Map(),
      scores: new Map(),
      timer: null,
      roomCode: "",
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];

      // Use standard accept() — keeps the DO alive while connections exist.
      // This avoids hibernation resetting in-memory game state.
      server.accept();

      server.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data as string);
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
          roomCode: this.game.roomCode,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  }

  private handleMessage(ws: WebSocket, data: any) {
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

  private getPlayerId(ws: WebSocket): string | null {
    for (const [id, player] of this.game.players) {
      if (player.ws === ws) return id;
    }
    return null;
  }

  private handleJoin(ws: WebSocket, data: { name: string; roomCode?: string }) {
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
      isHost,
    });

    ws.send(
      JSON.stringify({
        type: "joined",
        playerId,
        isHost,
        roomCode: this.game.roomCode,
      })
    );

    this.broadcastLobby();
  }

  private handleStart(ws: WebSocket, data: { settings?: Partial<GameSettings> }) {
    const playerId = this.getPlayerId(ws);
    if (!playerId) return;

    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can start the game" }));
      return;
    }

    if (this.game.players.size < 2) {
      ws.send(JSON.stringify({ type: "error", message: "Need at least 2 players" }));
      return;
    }

    // Apply settings from host (with validation)
    if (data.settings) {
      const s = data.settings;
      this.game.settings.numQuestions = Math.max(1, Math.min(20, s.numQuestions ?? DEFAULT_SETTINGS.numQuestions));
      this.game.settings.timeout = Math.max(5, Math.min(60, s.timeout ?? DEFAULT_SETTINGS.timeout));
      if (Array.isArray(s.packs) && s.packs.length > 0) {
        this.game.settings.packs = s.packs;
      }
    }

    // Get questions from selected packs, shuffle, and pick
    const allQuestions = getQuestions(this.game.settings.packs);
    const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
    this.game.questions = shuffled.slice(0, Math.min(this.game.settings.numQuestions, shuffled.length));
    this.game.currentQuestionIndex = 0;

    // Initialize scores
    for (const [id] of this.game.players) {
      this.game.scores.set(id, 0);
    }

    this.startQuestion();
  }

  private startQuestion() {
    this.game.phase = "question";
    this.game.votes = new Map();

    const question = this.game.questions[this.game.currentQuestionIndex];
    const players = this.getPlayerList();
    const timeout = this.game.settings.timeout;

    this.broadcast({
      type: "question",
      question: `Who is most likely to ${question}?`,
      questionNumber: this.game.currentQuestionIndex + 1,
      totalQuestions: this.game.questions.length,
      players,
      timeLimit: timeout,
    });

    // Start timer
    if (this.game.timer) {
      clearTimeout(this.game.timer);
    }

    this.game.timer = setTimeout(() => {
      this.endVoting();
    }, timeout * 1000) as unknown as number;
  }

  private handleVote(ws: WebSocket, data: { votedFor: string }) {
    if (this.game.phase !== "question") {
      ws.send(JSON.stringify({ type: "error", message: "Not in voting phase" }));
      return;
    }

    const playerId = this.getPlayerId(ws);
    if (!playerId) return;

    if (!this.game.players.has(data.votedFor)) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid player" }));
      return;
    }

    this.game.votes.set(playerId, data.votedFor);

    ws.send(JSON.stringify({ type: "voted", votedFor: data.votedFor }));

    // Broadcast vote count
    this.broadcast({
      type: "voteCount",
      count: this.game.votes.size,
      total: this.game.players.size,
    });

    // Check if everyone has voted
    if (this.game.votes.size === this.game.players.size) {
      if (this.game.timer) {
        clearTimeout(this.game.timer);
        this.game.timer = null;
      }
      this.endVoting();
    }
  }

  private endVoting() {
    this.game.phase = "results";
    this.game.timer = null;

    // Tally votes
    const voteCounts: Record<string, number> = {};
    for (const [id] of this.game.players) {
      voteCounts[id] = 0;
    }
    for (const [, votedForId] of this.game.votes) {
      voteCounts[votedForId] = (voteCounts[votedForId] || 0) + 1;
    }

    // Update cumulative scores
    for (const [id, count] of Object.entries(voteCounts)) {
      this.game.scores.set(id, (this.game.scores.get(id) || 0) + count);
    }

    // Build results with player names
    const results = Object.entries(voteCounts)
      .map(([id, count]) => ({
        playerId: id,
        name: this.game.players.get(id)?.name || "Unknown",
        votes: count,
      }))
      .sort((a, b) => b.votes - a.votes);

    const isLastQuestion =
      this.game.currentQuestionIndex >= this.game.questions.length - 1;

    this.broadcast({
      type: "results",
      question: `Who is most likely to ${this.game.questions[this.game.currentQuestionIndex]}?`,
      results,
      questionNumber: this.game.currentQuestionIndex + 1,
      totalQuestions: this.game.questions.length,
      isLastQuestion,
    });
  }

  private handleNext(ws: WebSocket) {
    const playerId = this.getPlayerId(ws);
    if (!playerId) return;

    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can advance" }));
      return;
    }

    if (this.game.phase !== "results") return;

    this.game.currentQuestionIndex++;

    if (this.game.currentQuestionIndex >= this.game.questions.length) {
      this.showFinalResults();
    } else {
      this.startQuestion();
    }
  }

  private showFinalResults() {
    this.game.phase = "final";

    const finalScores = Array.from(this.game.scores.entries())
      .map(([id, score]) => ({
        playerId: id,
        name: this.game.players.get(id)?.name || "Unknown",
        totalVotes: score,
      }))
      .sort((a, b) => b.totalVotes - a.totalVotes);

    this.broadcast({
      type: "final",
      scores: finalScores,
    });
  }

  private handlePlayAgain(ws: WebSocket) {
    const playerId = this.getPlayerId(ws);
    if (!playerId) return;

    const player = this.game.players.get(playerId);
    if (!player?.isHost) {
      ws.send(JSON.stringify({ type: "error", message: "Only the host can restart" }));
      return;
    }

    if (this.game.phase !== "final") return;

    // Reset game state but keep players and room
    this.game.phase = "lobby";
    this.game.questions = [];
    this.game.currentQuestionIndex = 0;
    this.game.votes = new Map();
    this.game.scores = new Map();
    if (this.game.timer) {
      clearTimeout(this.game.timer);
      this.game.timer = null;
    }

    this.broadcastLobby();
  }

  private removePlayer(ws: WebSocket) {
    const playerId = this.getPlayerId(ws);
    if (!playerId) return;

    const wasHost = this.game.players.get(playerId)?.isHost;
    this.game.players.delete(playerId);

    // If host left and game is in lobby, assign new host
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

    // If in question phase and everyone remaining has voted, end voting
    if (this.game.phase === "question") {
      // Remove vote from disconnected player
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

  private getPlayerList() {
    return Array.from(this.game.players.entries()).map(([id, p]) => ({
      id,
      name: p.name,
      isHost: p.isHost,
    }));
  }

  private broadcastLobby() {
    this.broadcast({
      type: "lobby",
      players: this.getPlayerList(),
      roomCode: this.game.roomCode,
    });
  }

  private broadcast(message: object) {
    const msg = JSON.stringify(message);
    for (const [, player] of this.game.players) {
      try {
        player.ws.send(msg);
      } catch {
        // connection might be dead
      }
    }
  }
}
