/**
 * RAGEDERUE Online — WebSocket Game Server
 *
 * Usage: node server/index.js [port]
 *   Default port: 9000
 *
 * Handles:
 *   - Player connections / disconnections
 *   - Room management (one room per map)
 *   - Broadcasting player states at 20 Hz
 */

const { WebSocketServer } = require('ws');
const Room = require('./Room');
const Protocol = require('./Protocol');

const PORT = parseInt(process.argv[2] || '9000', 10);

// ── Room registry ──────────────────────────────────────────────────────────
const rooms = new Map();

function getOrCreateRoom(name) {
  if (!rooms.has(name)) {
    console.log(`[Server] Creating room: ${name}`);
    const room = new Room(name);
    rooms.set(name, room);
  }
  return rooms.get(name);
}

// ── Player ID counter ──────────────────────────────────────────────────────
let nextId = 1;

// ── WebSocket server ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

console.log(`[Server] RAGEDERUE Online server listening on port ${PORT}`);
console.log(`[Server] Players can connect via: ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  const player = {
    id: nextId++,
    ws,
    name: 'Unknown',
    room: null,
    x: 150, y: 460,
    velX: 0, velY: 0,
    state: 'idle',
    facing: 1,
    hp: 100,
  };

  console.log(`[Server] Connection from id=${player.id}`);

  ws.on('message', (data) => {
    if (!(data instanceof Buffer)) return;
    const type = data[0];

    switch (type) {
      case Protocol.C_JOIN: {
        const { name, room: roomName } = Protocol.decodeJoin(data);
        player.name = name;

        // Join room
        const room = getOrCreateRoom(roomName);
        room.addPlayer(player);
        player.room = room;

        // Send welcome with assigned ID
        ws.send(Protocol.encodeWelcome(player.id), { binary: true });

        // Notify others in the room
        room.broadcast(Protocol.encodePlayerJoin(player.id, player.name), player.id);

        console.log(`[Server] ${player.name} (id=${player.id}) joined room "${roomName}" (${room.players.size} players)`);
        break;
      }

      case Protocol.C_PLAYER_STATE: {
        const state = Protocol.decodePlayerState(data, 1);
        player.x = state.x;
        player.y = state.y;
        player.velX = state.velX;
        player.velY = state.velY;
        player.state = state.state;
        player.facing = state.facing;
        player.hp = state.hp;
        break;
      }

      case Protocol.C_HIT_ENEMY: {
        if (player.room) {
          const hit = Protocol.decodeHitEnemy(data);
          player.room.hitEnemy(hit.netId, hit.damage, hit.knockback, hit.fromX);
        }
        break;
      }

      case Protocol.C_TAKE_ITEM: {
        if (player.room) {
          const take = Protocol.decodeTakeItem(data);
          player.room.takeItem(take.targetKind, take.targetId, take.itemIdx);
        }
        break;
      }

      default:
        // Unknown message — ignore
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[Server] ${player.name} (id=${player.id}) disconnected`);
    if (player.room) {
      player.room.removePlayer(player);
      // Notify others
      player.room.broadcast(Protocol.encodePlayerLeave(player.id));
      // Room persists even when empty — the world keeps ticking
      console.log(`[Server] Room "${player.room.name}" now has ${player.room.players.size} player(s)`);
    }
  });

  ws.on('error', (err) => {
    console.warn(`[Server] Error from id=${player.id}:`, err.message);
  });
});
