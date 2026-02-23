import { LANE_TOP, LANE_BOTTOM } from '../config/constants.js';
import { updateDepth, createShadow } from '../systems/DepthSystem.js';

/**
 * RemotePlayer — a visual representation of another player in the world.
 * Receives state snapshots from the server and interpolates smoothly.
 */
export default class RemotePlayer extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} id   Server-assigned player ID
   * @param {string} name Display name
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, id, name, x, y) {
    super(scene, x, y, 'player_idle');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(28, 40);
    this.body.setOffset(34, 20);

    // ── Identity ──────────────────────────────────────────────────────────
    this.netId  = id;
    this.netName = name;

    // ── State ─────────────────────────────────────────────────────────────
    this.state  = 'idle';
    this.facing = 1;
    this.hp     = 100;
    this.setScale(2);

    // ── Interpolation targets ─────────────────────────────────────────────
    this._targetX = x;
    this._targetY = y;
    this._lerpSpeed = 10; // higher = snappier

    // ── Name tag ──────────────────────────────────────────────────────────
    this._nameTag = scene.add.text(x, y - 50, name, {
      fontFamily: 'monospace', fontSize: '10px', color: '#88ccff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9999);

    // ── Shadow ────────────────────────────────────────────────────────────
    createShadow(scene, this);

    this.play('player_idle');
  }

  /**
   * Apply a server snapshot for this player.
   */
  applySnapshot(data) {
    this._targetX = data.x;
    this._targetY = data.y;
    this.hp = data.hp;

    const newFacing = data.facing;
    if (newFacing !== this.facing) {
      this.facing = newFacing;
      this.setFlipX(this.facing < 0);
    }

    // Play animation if state changed
    if (data.state !== this.state) {
      this.state = data.state;
      const animKey = `player_${this.state}`;
      if (this.scene.anims.exists(animKey)) {
        this.play(animKey, true);
      }
    }
  }

  /**
   * Smooth interpolation toward target position (called every frame).
   */
  update(time, delta) {
    const dt = delta / 1000;
    const lerp = Math.min(1, this._lerpSpeed * dt);

    this.x += (this._targetX - this.x) * lerp;
    this.y += (this._targetY - this.y) * lerp;

    // Clamp to lane
    this.y = Phaser.Math.Clamp(this.y, this.scene.laneTop ?? LANE_TOP, this.scene.laneBottom ?? LANE_BOTTOM);

    // Update name tag
    this._nameTag.setPosition(this.x, this.y - 50);

    // Depth
    updateDepth(this);
  }

  /**
   * Clean up.
   */
  destroy() {
    if (this._nameTag) this._nameTag.destroy();
    super.destroy();
  }
}
