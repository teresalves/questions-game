export { GameRoom } from "./game-room";

interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API: create a new room
    if (url.pathname === "/api/create-room") {
      const roomCode = generateRoomCode();
      // Use the room code as the DO id so it's deterministic
      const id = env.GAME_ROOM.idFromName(roomCode);
      return new Response(JSON.stringify({ roomCode }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // API: check if room exists
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

    // WebSocket connection to room
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

    // Everything else is served by the [assets] binding (static files in /public)
    return new Response("Not found", { status: 404 });
  },
};

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
