import Enemy from './Enemy.js';
import { LANE_TOP, LANE_BOTTOM } from '../config/constants.js';
import { updateDepth } from '../systems/DepthSystem.js';

/**
 * RemoteEnemy — server-driven enemy replica.
 * Receives state snapshots via applyNetState() and interpolates position.
 * No local AI, no local HP management — the server is the authority.
 */
export default class RemoteEnemy extends Enemy {
  constructor(scene, x, y, combat, cfg = {}) {
    super(scene, x, y, combat, cfg);
    this.isRemote = true;   // kept for any legacy checks
    this._targetX = x;
    this._targetY = y;
  }

  // ── Override: smooth position interpolation, no AI ────────────────────
  update(_player) {
    if (this.state === 'dead') return;
    const lerp = Math.min(1, 10 * (this.scene.game.loop.delta / 1000));
    this.x += (this._targetX - this.x) * lerp;
    this.y += (this._targetY - this.y) * lerp;
    this.y = Phaser.Math.Clamp(this.y, this.scene.laneTop ?? LANE_TOP, this.scene.laneBottom ?? LANE_BOTTOM);
    updateDepth(this);
  }

  // ── Override: visual feedback only, server manages HP & state ─────────
  takeHit(_damage, _knockback, _fromX) {
    if (this.state === 'dead') return;
    this.scene.sound.play('sfx_hit', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });
    this.setTint(0xff4444);
    this.scene.time.delayedCall(150, () => { if (this.active) this.clearTint(); });
  }

  // ── Override: no local state transitions on anim-complete ─────────────
  _onAnimComplete(anim) {
    if (!this.active) return;
    this.combat.deactivateHitboxes(this);
    // Server drives all state changes — do not run local FSM transitions
  }

  // ── Apply server snapshot ─────────────────────────────────────────────
  applyNetState(data) {
    this._targetX = data.x;
    this._targetY = data.y;

    // Once dead, only accept HP updates (position already frozen)
    if (this.state === 'dead') {
      this.hp = data.hp;
      return;
    }

    // Facing
    if (data.facing !== this.facing) {
      this.facing = data.facing;
      this.setFlipX(this.facing > 0);
    }

    // State change → drive animation
    if (data.state !== this.state) {
      if (data.state === 'dead') {
        this._die(!!this._justCreated);
        return;
      }
      this.state = data.state;
      switch (data.state) {
        case 'patrol':    this.play('enemy_idle',  true); break;
        case 'chase':     this.play('enemy_walk',  true); break;
        case 'attack':    this.play('enemy_punch', true); break;
        case 'knockdown': this.play('enemy_hurt',  true); break;
        case 'hitstun':
          this.setTint(0xff4444);
          this.scene.time.delayedCall(200, () => { if (this.active) this.clearTint(); });
          break;
        default: this.play('enemy_idle', true);
      }
    }

    this.hp = data.hp;
  }
}
