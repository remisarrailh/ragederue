import {
  PLAYER_SPEED, LANE_TOP, LANE_BOTTOM,
  PLAYER_MAX_HP, PLAYER_INVINCIBLE_MS
} from '../config/constants.js';
import { updateDepth, createShadow } from '../systems/DepthSystem.js';

// ── Attack hitbox definitions ─────────────────────────────────────────────
// { offsetX, offsetY, width, height, damage, knockback }
// offsetX is in front of the player (flipped automatically when facing left)
const HITBOXES = {
  player_punch: { offsetX: 48, offsetY: -22, w: 52, h: 30, dmg: 15, kb: 130 },
  player_kick:  { offsetX: 55, offsetY: -16, w: 62, h: 28, dmg: 20, kb: 160 },
  player_jab:   { offsetX: 42, offsetY: -22, w: 46, h: 28, dmg: 10, kb: 95  },
};
// Active frame index per attack (1-based, Phaser AnimationFrame.index)
const ACTIVE_FRAMES = {
  player_punch: [2],
  player_kick:  [2, 3],
  player_jab:   [2],
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {CombatSystem|null} combat  Pass null for movement-only mode (M1)
   */
  constructor(scene, x, y, combat = null) {
    super(scene, x, y, 'player_idle');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(28, 40);
    this.body.setOffset(34, 20);
    this.body.setCollideWorldBounds(true);

    // ── Stats ──────────────────────────────────────────────────────────────
    this.hp    = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.combat = combat;

    // ── State machine ──────────────────────────────────────────────────────
    this.state        = 'idle';   // idle | walk | punch | kick | jab | hurt
    this.isInvincible = false;
    this.facing       = 1;        // +1 = right, -1 = left

    // ── Keyboard attack keys ───────────────────────────────────────────────
    // Z=punch  X=kick  C=jab  (no conflict with WASD or arrow keys)
    this.attackKeys = {
      punch: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      kick:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      jab:   scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
    };

    // ── Gamepad attack flags (set by 'down' event, consumed each frame) ────
    this._gpAttack = { punch: false, kick: false, jab: false };
    scene.input.gamepad.on('down', (pad, button) => {
      if (pad.index !== 0) return;
      if (button.index === 2) this._gpAttack.punch = true; // Square / X
      if (button.index === 0) this._gpAttack.kick  = true; // Cross  / A
      if (button.index === 3) this._gpAttack.jab   = true; // Triangle / Y
    });

    // ── Shadow ─────────────────────────────────────────────────────────────
    createShadow(scene, this);

    this.play('player_idle');

    // ── Hitbox activation on specific attack frames ────────────────────────
    this.on('animationupdate', (anim, frame) => {
      if (!this.combat) return;
      const hb = HITBOXES[anim.key];
      const activeFrames = ACTIVE_FRAMES[anim.key];
      if (hb && activeFrames && activeFrames.includes(frame.index)) {
        this.combat.activateHitbox(this, hb.offsetX, hb.offsetY, hb.w, hb.h, hb.dmg, hb.kb);
      }
    });

    // ── Return to idle after any attack anim completes ─────────────────────
    // Note : 'player_hurt' ne reset PAS l'état ici — c'est le timer d'invincibilité
    // qui gère la fin du stunlock (voir takeHit).
    this.on('animationcomplete', (anim) => {
      if (this.combat) this.combat.deactivateHitboxes(this);

      const attackAnims = ['player_punch', 'player_kick', 'player_jab'];
      if (attackAnims.includes(anim.key)) {
        this.state = 'idle';
        this.play('player_idle', true);
      }
      // Pour hurt : on boucle l'anim jusqu'à la fin du stunlock
      if (anim.key === 'player_hurt' && this.state === 'hurt') {
        this.play('player_hurt', true);
      }
    });
  }

  // ─────────────────────────────────────────────────────── update ──────────
  update(cursors, wasd) {
    if (this.state === 'hurt') {
      // Let knockback decay — dampen X, zero Y
      this.body.setVelocityX(this.body.velocity.x * 0.78);
      this.body.setVelocityY(0);
    } else if (['punch', 'kick', 'jab'].includes(this.state)) {
      this.setVelocity(0, 0);
    } else {
      this._handleMovement(cursors, wasd);
    }

    this._handleAttackInput();
    updateDepth(this);
  }

  // ──────────────────────────────────────────────────── public API ─────────

  takeHit(damage, knockback, fromX) {
    if (this.isInvincible || this.state === 'dead') return;

    this.hp = Math.max(0, this.hp - damage);
    this.isInvincible = true;

    if (this.combat) this.combat.deactivateHitboxes(this);

    this.state = 'hurt';
    const dir = this.x >= fromX ? 1 : -1;
    this.setVelocity(dir * knockback, 0);
    this.play('player_hurt', true);

    // SFX
    this.scene.sound.play('sfx_hit');

    // Clignotement style beat-em-up : flash net 0 ↔ 1
    this.setAlpha(1);
    const flashTween = this.scene.tweens.add({
      targets: this,
      alpha: { from: 0, to: 1 },
      duration: 60,
      repeat: -1,
      yoyo: true,
    });

    // Stunlock : on reste en état 'hurt' (bloqué) pendant toute l'invincibilité
    this.scene.time.delayedCall(PLAYER_INVINCIBLE_MS, () => {
      flashTween.stop();
      this.setAlpha(1);
      this.isInvincible = false;
      // Repasser en idle à la fin du stunlock
      this.state = 'idle';
      this.play('player_idle', true);
    });
  }

  // ─────────────────────────────────────────── private helpers ─────────────

  _handleAttackInput() {
    // No attacks during hurt
    if (this.state === 'hurt') {
      this._gpAttack.punch = this._gpAttack.kick = this._gpAttack.jab = false;
      return;
    }
    // Kick has no chaining — wait for it to finish
    if (this.state === 'kick') {
      this._gpAttack.punch = this._gpAttack.kick = this._gpAttack.jab = false;
      return;
    }

    const punchDown = Phaser.Input.Keyboard.JustDown(this.attackKeys.punch) || this._gpAttack.punch;
    const kickDown  = Phaser.Input.Keyboard.JustDown(this.attackKeys.kick)  || this._gpAttack.kick;
    const jabDown   = Phaser.Input.Keyboard.JustDown(this.attackKeys.jab)   || this._gpAttack.jab;

    // Always consume flags
    this._gpAttack.punch = false;
    this._gpAttack.kick  = false;
    this._gpAttack.jab   = false;

    if (punchDown) {
      this.state = 'punch';
      this.play('player_punch', true);
    } else if (kickDown) {
      this.state = 'kick';
      this.play('player_kick', true);
    } else if (jabDown) {
      this.state = 'jab';
      this.play('player_jab', true);
    }
  }

  _handleMovement(cursors, wasd) {
    const left  = cursors.left.isDown  || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up    = cursors.up.isDown    || wasd.up.isDown;
    const down  = cursors.down.isDown  || wasd.down.isDown;

    // ── Gamepad ──────────────────────────────────────────────────────────
    let gpX = 0, gpY = 0;
    const gp = this.scene.input.gamepad;
    if (gp && gp.total > 0) {
      const pad = gp.getPad(0);
      if (pad) {
        const DEAD = 0.15;
        if (Math.abs(pad.leftStick.x) > DEAD) gpX = pad.leftStick.x;
        if (Math.abs(pad.leftStick.y) > DEAD) gpY = pad.leftStick.y;
        if (pad.left.isDown)  gpX = -1;
        if (pad.right.isDown) gpX =  1;
        if (pad.up.isDown)    gpY = -1;
        if (pad.down.isDown)  gpY =  1;
      }
    }

    let vx = gpX * PLAYER_SPEED;
    let vy = gpY * PLAYER_SPEED * 0.6;

    if (left)  vx -= PLAYER_SPEED;
    if (right) vx += PLAYER_SPEED;
    if (up)    vy -= PLAYER_SPEED * 0.6;
    if (down)  vy += PLAYER_SPEED * 0.6;

    const kbMoving = (left || right) && (up || down);
    if (kbMoving && gpX === 0 && gpY === 0) {
      vx *= 0.707;
      vy *= 0.707;
    }

    if (gpX !== 0 && gpY !== 0) {
      const mag = Math.sqrt(vx * vx + vy * vy);
      if (mag > PLAYER_SPEED) {
        vx = (vx / mag) * PLAYER_SPEED;
        vy = (vy / mag) * PLAYER_SPEED * 0.6;
      }
    }

    this.setVelocity(vx, vy);
    this.y = Phaser.Math.Clamp(this.y, LANE_TOP, LANE_BOTTOM);

    if (vx < 0)      { this.setFlipX(true);  this.facing = -1; }
    else if (vx > 0) { this.setFlipX(false); this.facing =  1; }

    const moving = Math.abs(vx) > 1 || Math.abs(vy) > 1;
    if (moving && this.state !== 'walk') {
      this.state = 'walk';
      this.play('player_walk', true);
    } else if (!moving && this.state !== 'idle') {
      this.state = 'idle';
      this.play('player_idle', true);
    }
  }
}
