import {
  PLAYER_SPEED, LANE_TOP, LANE_BOTTOM,
  PLAYER_MAX_HP, PLAYER_INVINCIBLE_MS,
  JUMP_DURATION, JUMP_HEIGHT
} from '../config/constants.js';
import { updateDepth, createShadow } from '../systems/DepthSystem.js';

// ── Attack hitbox definitions ─────────────────────────────────────────────
// { offsetX, offsetY, width, height, damage, knockback }
// offsetX is in front of the player (flipped automatically when facing left)
const HITBOXES = {
  player_punch:     { offsetX: 48, offsetY: -22, w: 52, h: 30, dmg: 15, kb: 130 },
  player_kick:      { offsetX: 55, offsetY: -16, w: 62, h: 28, dmg: 20, kb: 160 },
  player_jab:       { offsetX: 42, offsetY: -22, w: 46, h: 28, dmg: 10, kb: 95  },
  player_jump_kick: { offsetX: 50, offsetY: -10, w: 60, h: 34, dmg: 25, kb: 200 },
};
// Active frame index per attack (1-based, Phaser AnimationFrame.index)
const ACTIVE_FRAMES = {
  player_punch:     [2],
  player_kick:      [2, 3],
  player_jab:       [2],
  player_jump_kick: [2],
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
    this.state        = 'idle';   // idle | walk | punch | kick | jab | jump | jump_kick | hurt
    this.isInvincible = false;
    this.facing       = 1;        // +1 = right, -1 = left
    this._isAirborne  = false;    // true during jump arc
    this._groundY     = y;        // memorised Y for landing
    this.searching    = false;    // true while SearchScene is open
    this.inInventory  = false;    // true while InventoryScene is open
    this.inMenu       = false;    // true while Settings/Pause menu is open

    // ── Keyboard attack keys ───────────────────────────────────────────────
    // X=punch  C=kick  V=jab  SPACE=jump
    this.attackKeys = {
      punch: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      kick:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      jab:   scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V),
      jump:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    // ── Gamepad attack flags (set by 'down' event, consumed each frame) ────
    this._gpAttack = { punch: false, kick: false, jab: false, jump: false };
    scene.input.gamepad.on('down', (pad, button) => {
      if (!document.hasFocus()) return;  // ignore when tab is not focused
      const chosenPad = this.scene.registry.get('padIndex') ?? 0;
      if (chosenPad < 0) return;  // keyboard-only mode
      if (pad.index !== chosenPad) return;
      if (this.searching || this.inInventory || this.inMenu) return;  // ignore while overlay is open
      if (button.index === 2) this._gpAttack.punch = true; // Square / X
      if (button.index === 1) this._gpAttack.kick  = true; // Circle / B
      if (button.index === 3) this._gpAttack.jab   = true; // Triangle / Y
      if (button.index === 0) this._gpAttack.jump  = true; // Cross / A
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
      // Jump kick : retombe après l'anim (ne reset pas idle, c'est le tween d'atterrissage qui le fait)
      if (anim.key === 'player_jump_kick' && this.state === 'jump_kick') {
        // stay in jump_kick state until landing
      }
      // Pour hurt : on boucle l'anim jusqu'à la fin du stunlock
      if (anim.key === 'player_hurt' && this.state === 'hurt') {
        this.play('player_hurt', true);
      }
    });
  }

  // ─────────────────────────────────────────────────────── update ──────────
  update(cursors, wasd) {
    // Frozen while searching a container / corpse, in inventory, or in menu
    if (this.searching || this.inInventory || this.inMenu) {
      this.setVelocity(0, 0);
      if (this.state !== 'idle' && this.state !== 'hurt') {
        this.state = 'idle';
        this.play('player_idle', true);
      }
      this._wasFrozen = true;
      return;
    }

    // Just unfroze — flush any stale gamepad flags from overlay buttons
    if (this._wasFrozen) {
      this._wasFrozen = false;
      this._gpAttack.punch = this._gpAttack.kick = this._gpAttack.jab = this._gpAttack.jump = false;
    }

    if (this.state === 'hurt') {
      // Let knockback decay — dampen X, zero Y
      this.body.setVelocityX(this.body.velocity.x * 0.78);
      this.body.setVelocityY(0);
    } else if (['punch', 'kick', 'jab'].includes(this.state)) {
      this.setVelocity(0, 0);
    } else if (this.state === 'jump' || this.state === 'jump_kick') {
      // Airborne — keep horizontal momentum, no vertical input
      this.body.setVelocityY(0);
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

    // Death check
    if (this.hp <= 0) {
      this.state = 'dead';
      this.setVelocity(0, 0);
      this.play('player_hurt', true);
      this.scene.sound.play('sfx_death_player', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });
      return;  // GameScene.update() will detect hp <= 0 and end the game
    }

    this.state = 'hurt';
    const dir = this.x >= fromX ? 1 : -1;
    this.setVelocity(dir * knockback, 0);
    this.play('player_hurt', true);

    // SFX
    this.scene.sound.play('sfx_hit', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });

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
      this._gpAttack.punch = this._gpAttack.kick = this._gpAttack.jab = this._gpAttack.jump = false;
      return;
    }
    // Kick has no chaining — wait for it to finish
    if (this.state === 'kick') {
      this._gpAttack.punch = this._gpAttack.kick = this._gpAttack.jab = this._gpAttack.jump = false;
      return;
    }

    const punchDown = Phaser.Input.Keyboard.JustDown(this.attackKeys.punch) || this._gpAttack.punch;
    const kickDown  = Phaser.Input.Keyboard.JustDown(this.attackKeys.kick)  || this._gpAttack.kick;
    const jabDown   = Phaser.Input.Keyboard.JustDown(this.attackKeys.jab)   || this._gpAttack.jab;
    const jumpDown  = Phaser.Input.Keyboard.JustDown(this.attackKeys.jump)  || this._gpAttack.jump;

    // Always consume flags
    this._gpAttack.punch = false;
    this._gpAttack.kick  = false;
    this._gpAttack.jab   = false;
    this._gpAttack.jump  = false;

    // ── Airborne: allow jump kick ──────────────────────────────────────
    if (this._isAirborne) {
      if ((kickDown || punchDown) && this.state === 'jump') {
        this._jumpKick();
      }
      return;
    }

    // ── Ground actions ─────────────────────────────────────────────
    if (jumpDown && this.state !== 'punch' && this.state !== 'kick' && this.state !== 'jab') {
      this._startJump();
    } else if (punchDown) {
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

  // ── Jump ─────────────────────────────────────────────────────────────
  _startJump() {
    this.state = 'jump';
    this._isAirborne = true;
    this._groundY = this.y;
    this.play('player_jump', true);

    // Keep current horizontal velocity for air momentum
    this.body.setVelocityY(0);

    // Arc ascent then descent
    this.scene.tweens.add({
      targets: this,
      y: this._groundY - JUMP_HEIGHT,
      duration: JUMP_DURATION * 0.45,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Descent
        this.scene.tweens.add({
          targets: this,
          y: this._groundY,
          duration: JUMP_DURATION * 0.55,
          ease: 'Sine.easeIn',
          onComplete: () => this._land(),
        });
      },
    });
  }

  _jumpKick() {
    this.state = 'jump_kick';
    this.play('player_jump_kick', true);
  }

  _land() {
    this._isAirborne = false;
    this.y = this._groundY;
    if (this.state === 'jump' || this.state === 'jump_kick') {
      this.state = 'idle';
      this.play('player_idle', true);
    }
  }

  _handleMovement(cursors, wasd) {
    const left  = cursors.left.isDown  || wasd.left.isDown;
    const right = cursors.right.isDown || wasd.right.isDown;
    const up    = cursors.up.isDown    || wasd.up.isDown;
    const down  = cursors.down.isDown  || wasd.down.isDown;

    // ── Gamepad ──────────────────────────────────────────────────────────
    let gpX = 0, gpY = 0;
    const chosenPadMove = this.scene.registry.get('padIndex') ?? 0;
    const gp = this.scene.input.gamepad;
    if (chosenPadMove >= 0 && gp && gp.total > 0 && document.hasFocus()) {
      const pad = gp.getPad(chosenPadMove);
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
