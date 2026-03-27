# Questions Game

A real-time multiplayer "Who is most likely to..." party game built on Cloudflare Workers with Durable Objects and WebSockets.

## How it works

Players join a room via a 5-character code. Each round, everyone votes on which player is most likely to do something. Points accumulate across questions and a winner is crowned at the end.

- **Host** creates a room, configures settings, and controls game flow
- **Players** join via room code and vote each round
- Votes are tallied in real-time; results are shown after everyone votes or the timer expires

## Question Packs

| Pack | ID | Description |
|------|----|-------------|
| Party Mode | `sfw` | Clean fun for everyone |
| After Dark | `nsfw` | Adults only, no filter |
| Software Engineers | `dev` | For the technically inclined |

## Tech Stack

- [Cloudflare Workers](https://workers.cloudflare.com/) — serverless edge runtime
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) — stateful game rooms via `GameRoom`
- WebSockets — real-time communication between clients and the DO
- TypeScript
- Static frontend served from `/public` via the `[assets]` binding

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

## WebSocket Message Protocol

All messages are JSON. Clients send:

| Type | Payload | Description |
|------|---------|-------------|
| `join` | `{ name, roomCode? }` | Join the lobby |
| `start` | `{ settings? }` | Host starts the game |
| `vote` | `{ votedFor: playerId }` | Cast a vote |
| `next` | — | Host advances to next question |
| `play-again` | — | Host restarts from lobby |

Server sends: `joined`, `lobby`, `question`, `voted`, `voteCount`, `results`, `final`, `promoted`, `error`.

## Game Settings

| Setting | Default | Range |
|---------|---------|-------|
| `numQuestions` | 5 | 1–20 |
| `timeout` | 20s | 5–60s |
| `packs` | `["sfw"]` | any pack IDs |
