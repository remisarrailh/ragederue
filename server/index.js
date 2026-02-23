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
const http = require('http');
const Room = require('./Room');
const Protocol = require('./Protocol');
const CharacterStore = require('./CharacterStore');

// Characters currently in-game: Set of charId strings
const activeChars = new Set();

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

// Pre-create default room so the world exists before any player joins
getOrCreateRoom('street_01');

// ── Player ID counter ──────────────────────────────────────────────────────
let nextId = 1;

// ── HTTP server (handles both WS upgrades and /stats requests) ───────────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.url === '/stats') {
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const stats = {
      uptime: Math.round(process.uptime()),
      memory: {
        rss:       Math.round(mem.rss       / 1024 / 1024 * 100) / 100,
        heapUsed:  Math.round(mem.heapUsed  / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      },
      cpu: {
        user:   Math.round(cpuUsage.user   / 1000),
        system: Math.round(cpuUsage.system / 1000),
      },
      connections: wss.clients.size,
      rooms: Array.from(rooms.values()).map(r => r.getStats()),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
  } else if (req.url === '/stats/reset') {
    for (const room of rooms.values()) room.resetStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ── WebSocket server — shares the same HTTP server ─────────────────────────
const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`[Server] RAGEDERUE Online listening on port ${PORT}`);
  console.log(`[Server] WebSocket:   ws://localhost:${PORT}`);
  console.log(`[Server] Stats:       http://localhost:${PORT}/stats`);
});

wss.on('connection', (ws) => {
  const player = {
    id: nextId++,
    ws,
    name: 'Unknown',
    charId: null,   // set when C_CHAR_SELECT(0, charId) succeeds
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

    // Track incoming bytes
    if (player.room) player.room.recordIncoming(data.length);

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

      case Protocol.C_CHAR_LIST: {
        ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
        break;
      }

      case Protocol.C_CHAR_SELECT: {
        const { action, value } = Protocol.decodeCharSelect(data);
        if (action === 1) {
          // Create new character
          if (value.trim().length > 0) CharacterStore.create(value);
        } else {
          // Select existing character
          if (activeChars.has(value)) {
            ws.send(Protocol.encodeJoinRefused('Personnage déjà en jeu'), { binary: true });
            break;
          }
          player.charId = value;
          activeChars.add(value);
          console.log(`[Server] ${player.name} (id=${player.id}) selected char "${value}"`);
          // Send chest contents to the client
          const char = CharacterStore.getById(value);
          if (char) ws.send(Protocol.encodeChestData(char.chestItems || []), { binary: true });
        }
        ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
        break;
      }

      case Protocol.C_CHEST_SAVE: {
        const { charId: saveCharId, items } = Protocol.decodeChestSave(data);
        const targetCharId = saveCharId || player.charId;
        if (targetCharId) {
          CharacterStore.updateChest(targetCharId, items);
          console.log(`[Server] Chest saved for char "${targetCharId}" (${items.length} items)`);
        }
        break;
      }

      case Protocol.C_CHAR_DELETE: {
        const { charId } = Protocol.decodeCharDelete(data);
        // Cannot delete a character that is currently in-game
        if (!activeChars.has(charId)) {
          CharacterStore.delete(charId);
        }
        ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
        break;
      }

      default:
        // Unknown message — ignore
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[Server] ${player.name} (id=${player.id}) disconnected`);
    if (player.charId) activeChars.delete(player.charId);
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
