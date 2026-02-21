import {
  ENEMY_SPEED, ENEMY_MAX_HP, ENEMY_CHASE_DIST, ENEMY_ATTACK_DIST,
  ENEMY_KNOCKDOWN_THRESHOLD, ENEMY_HITSTUN_MS, ENEMY_KNOCKDOWN_RECOVERY_MS,
  LANE_TOP, LANE_BOTTOM
} from '../config/constants.js';
import { updateDepth, createShadow } from '../systems/DepthSystem.js';
import { CORPSE_LOOT_TABLE, CORPSE_ITEM_COUNT, rollLoot } from '../config/lootTable.js';

export default class Enemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {CombatSystem} combat
   * @param {object} [cfg]  Override defaults: { hp, speed, attackDamage, attackKnockback }
   */
  constructor(scene, x, y, combat, cfg = {}) {
    super(scene, x, y, 'enemy_idle');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.body.setSize(28, 40);
    this.body.setOffset(34, 20);

    // ── Stats ─────────────────────────────────────────────────────────────
    this.combat         = combat;
    this.hp             = cfg.hp             ?? ENEMY_MAX_HP;
    this.maxHp          = this.hp;
    this.speed          = cfg.speed          ?? ENEMY_SPEED;
    this.attackDamage   = cfg.attackDamage   ?? 10;
    this.attackKnockback = cfg.attackKnockback ?? 110;

    // ── State machine ─────────────────────────────────────────────────────
    this.state          = 'patrol';
    this.isInvincible   = false;
    this.attackCooldown = 0;          // ms until next attack allowed
    this.accumulatedDmg = 0;          // dmg accumulated toward knockdown

    // ── Facing direction: +1 = right, -1 = left ───────────────────────────
    // Enemy Punk sprite is drawn facing LEFT natively, so flipX=true = facing right
    this.facing = 1;

    // ── Patrol bounds (stay within 160px of spawn) ────────────────────────
    this.patrolLeft  = x - 160;
    this.patrolRight = x + 160;
    this.patrolDir   = 1;

    // ── Shadow ────────────────────────────────────────────────────────────
    createShadow(scene, this);

    this.play('enemy_idle');

    // ── Hitbox activation on attack frame ─────────────────────────────────
    this.on('animationupdate', (anim, frame) => {
      if (anim.key === 'enemy_punch' && frame.index === 2) {
        this.combat.activateHitbox(
          this, 50, -22, 58, 32, this.attackDamage, this.attackKnockback
        );
      }
    });

    // ── Anim-complete transitions ─────────────────────────────────────────
    this.on('animationcomplete', (anim) => {
      this.combat.deactivateHitboxes(this);

      if (anim.key === 'enemy_punch' && this.state === 'attack') {
        this.state = 'chase';
      }
      // Knockdown : après l'anim hurt, rester au sol puis se relever
      if (anim.key === 'enemy_hurt' && this.state === 'knockdown') {
        this.setVelocity(0, 0);
        this.scene.time.delayedCall(ENEMY_KNOCKDOWN_RECOVERY_MS, () => {
          if (this.state === 'knockdown') {
            this.isInvincible = false;
            this.state = 'chase';
            this.play('enemy_idle', true);
          }
        });
      }
    });
  }

  // ────────────────────────────────────────────────────── update ──────────
  update(player) {
    if (this.state === 'dead') return;

    this.attackCooldown -= this.scene.game.loop.delta;

    const dx   = player.x - this.x;
    const dy   = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    switch (this.state) {
      case 'patrol': {
        this._doPatrol();
        if (dist < ENEMY_CHASE_DIST) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (dist < ENEMY_ATTACK_DIST && this.attackCooldown <= 0) {
          this._startAttack();
        } else {
          this._chasePlayer(dx, dy, dist, player);
        }
        break;
      }
      case 'attack': {
        this.setVelocity(0, 0);
        break;
      }
      case 'hitstun': {
        // Légère décélération du micro-recul
        this.setVelocityX(this.body.velocity.x * 0.75);
        this.setVelocityY(0);
        break;
      }
      case 'knockdown': {
        // Décélération de la projection arrière
        this.setVelocityX(this.body.velocity.x * 0.85);
        this.setVelocityY(0);
        break;
      }
    }

    updateDepth(this);
  }

  // ──────────────────────────────────────────────── public API ─────────────

  takeHit(damage, knockback, fromX) {
    if (this.isInvincible || this.state === 'dead') return;

    this.hp -= damage;

    if (this.hp <= 0) {
      this._die();
      return;
    }

    this.combat.deactivateHitboxes(this);
    const dir = this.x >= fromX ? 1 : -1;
    this.accumulatedDmg += damage;

    if (this.accumulatedDmg >= ENEMY_KNOCKDOWN_THRESHOLD) {
      // ── Knockdown : projection arrière + au sol ─────────────────────
      this._knockdown(dir, knockback);
    } else {
      // ── Hitstun : flinch léger, pas de chute ────────────────────────
      this._hitstun(dir);
    }
  }

  /**
   * Hitstun léger : l'ennemi recule à peine, flash rouge, brièvement bloqué.
   * Pas d'invincibilité longue pour permettre les combos.
   */
  _hitstun(dir) {
    this.state = 'hitstun';
    this.isInvincible = true;
    this.setVelocity(dir * 50, 0);   // micro-recul

    // SFX
    this.scene.sound.play('sfx_hit', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });

    // Flash rouge pour indiquer le coup
    this.setTint(0xff4444);

    this.scene.time.delayedCall(ENEMY_HITSTUN_MS, () => {
      if (this.state === 'hitstun') {
        this.clearTint();
        this.isInvincible = false;
        this.state = 'chase';
        this.play('enemy_idle', true);
      }
    });
  }

  /**
   * Knockdown : projection en arc (envol + retombée), reste au sol, puis se relève.
   * Reset l'accumulateur de dégâts.
   */
  _knockdown(dir, knockback) {
    this.state = 'knockdown';
    this.isInvincible = true;
    this.accumulatedDmg = 0;
    this.clearTint();
    this.play('enemy_hurt', true);

    // SFX
    this.scene.sound.play('sfx_hit', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });

    // ── Projection horizontale via la physique ──────────────────────────
    this.setVelocity(dir * knockback * 2.2, 0);

    // ── Arc vertical simulé via tween sur le sprite Y ───────────────────
    // On mémorise la position Y au sol, on fait monter puis retomber
    const groundY = this.y;
    const arcHeight = 40;   // hauteur de l'envol en pixels
    const arcDuration = 400; // durée totale de l'arc (ms)

    // Phase 1 : envol
    this.scene.tweens.add({
      targets: this,
      y: groundY - arcHeight,
      duration: arcDuration * 0.4,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // Phase 2 : retombée
        this.scene.tweens.add({
          targets: this,
          y: groundY,
          duration: arcDuration * 0.6,
          ease: 'Sine.easeIn',
          onComplete: () => {
            // Impact au sol : stopper le mouvement horizontal
            this.setVelocity(0, 0);
          }
        });
      }
    });

    // Rotation légère pendant la projection (effet de vrille)
    this.scene.tweens.add({
      targets: this,
      angle: dir * 360,
      duration: arcDuration,
      ease: 'Linear',
      onComplete: () => {
        this.setAngle(0);
      }
    });
  }

  // ─────────────────────────────────────────────── private helpers ─────────

  _doPatrol() {
    const target = this.patrolDir > 0 ? this.patrolRight : this.patrolLeft;

    if (Math.abs(this.x - target) < 6) {
      this.patrolDir *= -1;
      this.setVelocity(0, 0);
      this.play('enemy_idle', true);
      return;
    }

    this.facing = this.patrolDir > 0 ? 1 : -1;
    this.setVelocity(this.patrolDir * this.speed * 0.5, 0);
    // Sprite faces LEFT natively → flipX=true makes it face right
    this.setFlipX(this.facing > 0);
    this.play('enemy_walk', true);
  }

  _chasePlayer(dx, dy, dist, player) {
    if (dist < 2) { this.setVelocity(0, 0); return; }

    const nx = dx / dist;
    const ny = dy / dist;

    this.facing = dx > 0 ? 1 : -1;
    this.setVelocity(nx * this.speed, ny * this.speed * 0.6);
    this.y = Phaser.Math.Clamp(this.y, LANE_TOP, LANE_BOTTOM);

    // Sprite faces LEFT natively → flipX=true makes it face right
    this.setFlipX(this.facing > 0);
    this.play('enemy_walk', true);
  }

  _startAttack() {
    this.state = 'attack';
    this.attackCooldown = 2200;
    this.setVelocity(0, 0);
    this.play('enemy_punch', true);
  }

  _die() {
    this.state = 'dead';
    this.isInvincible = true;
    this.combat.deactivateHitboxes(this);
    this.setVelocity(0, 0);

    // SFX
    this.scene.sound.play('sfx_death_enemy', { volume: this.scene.registry.get('sfxVol') ?? 0.5 });

    // Generate loot for this corpse
    const count = Phaser.Math.Between(CORPSE_ITEM_COUNT.min, CORPSE_ITEM_COUNT.max);
    this.lootItems = rollLoot(CORPSE_LOOT_TABLE, count); // array of type keys
    this.searched  = false;  // true once player has searched this body
    this.searchable = true;  // flag for the search system
    this.opened     = false; // true after first search (skip opening anim on re-search)

    // Play hurt anim — stays on last frame (corpse on ground)
    this.play('enemy_hurt', true);
    this.once('animationcomplete', () => {
      // Dim the corpse slightly to signal it’s dead but still there
      this.setAlpha(0.65);
    });
  }
  /** Mark corpse as searched (called by SearchScene when player closes the loot UI). */
  markSearched() {
    this.searched = true;
    this.setAlpha(0.35);
  }}
