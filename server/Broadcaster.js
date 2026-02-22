'use strict';

/**
 * Broadcaster — wraps WebSocket send helpers and tracks bandwidth stats.
 * Holds a reference to the Room's player Map so it can iterate them for broadcast.
 */
class Broadcaster {
  /** @param {Map<number, object>} players  Shared reference to Room.players */
  constructor(players) {
    this.players       = players;
    this.bytesSent     = 0;
    this.bytesReceived = 0;
    this.msgsSent      = 0;
    this.msgsReceived  = 0;
    this._lastReset    = Date.now();
  }

  /** Send binary data to a single player. */
  sendTo(player, data) {
    if (player.ws.readyState !== 1) return;
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    player.ws.send(buf, { binary: true });
    this.bytesSent += buf.length;
    this.msgsSent++;
  }

  /** Broadcast binary data to all connected players (optionally exclude one id). */
  broadcast(data, excludeId) {
    const buf = data instanceof ArrayBuffer ? Buffer.from(data) : data;
    for (const [id, p] of this.players) {
      if (id === excludeId) continue;
      if (p.ws.readyState !== 1) continue;
      p.ws.send(buf, { binary: true });
      this.bytesSent += buf.length;
      this.msgsSent++;
    }
  }

  /** Record an incoming message for bandwidth stats. */
  recordIncoming(byteLength) {
    this.bytesReceived += byteLength;
    this.msgsReceived++;
  }

  /** Reset all rolling bandwidth counters. */
  resetStats() {
    this.bytesSent     = 0;
    this.bytesReceived = 0;
    this.msgsSent      = 0;
    this.msgsReceived  = 0;
    this._lastReset    = Date.now();
  }
}

module.exports = Broadcaster;
