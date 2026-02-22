/**
 * ServerEnemy — server-side enemy AI (no Phaser dependency).
 * Runs patrol / chase / attack / hitstun / knockdown / dead state machine.
 */

// ── Constants (mirrors client) ────────────────────────────────────────────
const LANE_TOP    = 330;
const LANE_BOTTOM = 470;
const ENEMY_SPEED        = 90;
const ENEMY_MAX_HP       = 60;
const ENEMY_CHASE_DIST   = 280;
const ENEMY_ATTACK_DIST  = 70;
const ENEMY_KNOCKDOWN_THRESHOLD  = 35;
const ENEMY_HITSTUN_MS           = 220;
const ENEMY_KNOCKDOWN_RECOVERY_MS = 900;
const ENEMY_ATTACK_COOLDOWN_MS   = 2200;
const ENEMY_ATTACK_DURATION_MS   = 600;
const EXTRACT_X  = 3500;

class ServerEnemy {
  /**
   * @param {number} netId  Unique network ID
   * @param {number} x      Spawn X
   * @param {number} y      Spawn Y
   * @param {object} [cfg]  Override defaults: { hp, speed }
   */
  constructor(netId, x, y, cfg = {}) {
    this.netId = netId;
    this.x = x;
    this.y = y;

    // Stats
    this.hp       = cfg.hp    ?? ENEMY_MAX_HP;
    this.maxHp    = this.hp;
    this.speed    = cfg.speed ?? ENEMY_SPEED;
    this.attackDamage   = cfg.attackDamage ?? 10;
    this.attackKnockback = cfg.attackKnockback ?? 110;

    // State machine
    this.state          = 'patrol';
    this.facing         = 1;        // +1=right  -1=left
    this.accumulatedDmg = 0;

    // Timers (ms remaining)
    this.attackCooldown = 0;
    this._stateTimer    = 0;        // generic timer for current state

    // Patrol bounds (±160px from spawn)
    this._patrolLeft  = x - 160;
    this._patrolRight = x + 160;
    this._patrolDir   = 1;

    // Velocities (for knockback decay)
    this.velX = 0;
    this.velY = 0;

    // Loot / searchable (set on death, used by client)
    this.searchable = false;
  }

  /**
   * Update this enemy for one tick.
   * @param {number} dt        Delta time in ms
   * @param {Array}  players   Array of { x, y } for all players in the room
   */
  update(dt, players) {
    if (this.state === 'dead') return;

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // Find nearest player
    let nearest = null;
    let nearDist = Infinity;
    for (const p of players) {
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < nearDist) {
        nearDist = d;
        nearest = p;
      }
    }

    switch (this.state) {
      case 'patrol':
        this._doPatrol(dt);
        if (nearest && nearDist < ENEMY_CHASE_DIST) {
          this.state = 'chase';
        }
        break;

      case 'chase':
        if (nearest) {
          if (nearDist < ENEMY_ATTACK_DIST && this.attackCooldown <= 0) {
            this._startAttack();
          } else {
            this._chase(dt, nearest, nearDist);
          }
        } else {
          this.state = 'patrol';
        }
        break;

      case 'attack':
        this.velX = 0;
        this.velY = 0;
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'chase';
        }
        break;

      case 'hitstun':
        this.velX *= 0.75;
        this.velY = 0;
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'chase';
          this.velX = 0;
        }
        break;

      case 'knockdown':
        this.velX *= 0.85;
        this.velY = 0;
        this._stateTimer -= dt;
        if (this._stateTimer <= 0) {
          this.state = 'chase';
          this.velX = 0;
        }
        break;
    }

    // Apply velocity
    const dtSec = dt / 1000;
    this.x += this.velX * dtSec;
    this.y += this.velY * dtSec;

    // Clamp to lane
    this.y = Math.max(LANE_TOP, Math.min(LANE_BOTTOM, this.y));
    // Clamp to world (stay away from extraction zone)
    this.x = Math.max(40, Math.min(EXTRACT_X - 80, this.x));
  }

  /**
   * Apply damage from a player hit.
   * @param {number} damage
   * @param {number} knockback
   * @param {number} fromX   Attacker's X position
   * @returns {boolean} true if enemy just died
   */
  takeHit(damage, knockback, fromX) {
    if (this.state === 'dead') return false;

    this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = 0;
      this._die();
      return true;
    }

    const dir = this.x >= fromX ? 1 : -1;
    this.accumulatedDmg += damage;

    if (this.accumulatedDmg >= ENEMY_KNOCKDOWN_THRESHOLD) {
      // Knockdown
      this.state = 'knockdown';
      this.accumulatedDmg = 0;
      this.velX = dir * knockback * 2.2;
      this._stateTimer = ENEMY_KNOCKDOWN_RECOVERY_MS;
    } else {
      // Hitstun
      this.state = 'hitstun';
      this.velX = dir * 50;
      this._stateTimer = ENEMY_HITSTUN_MS;
    }

    return false;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  _doPatrol(dt) {
    const target = this._patrolDir > 0 ? this._patrolRight : this._patrolLeft;

    if (Math.abs(this.x - target) < 6) {
      this._patrolDir *= -1;
      this.velX = 0;
      this.velY = 0;
      return;
    }

    this.facing = this._patrolDir > 0 ? 1 : -1;
    this.velX = this._patrolDir * this.speed * 0.5;
    this.velY = 0;
  }

  _chase(dt, target, dist) {
    if (dist < 2) {
      this.velX = 0;
      this.velY = 0;
      return;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const nx = dx / dist;
    const ny = dy / dist;

    this.facing = dx > 0 ? 1 : -1;
    this.velX = nx * this.speed;
    this.velY = ny * this.speed * 0.6;
  }

  _startAttack() {
    this.state = 'attack';
    this.attackCooldown = ENEMY_ATTACK_COOLDOWN_MS;
    this.velX = 0;
    this.velY = 0;
    this._stateTimer = ENEMY_ATTACK_DURATION_MS;
  }

  _die() {
    this.state = 'dead';
    this.velX = 0;
    this.velY = 0;
    this.searchable = true;
  }
}

module.exports = ServerEnemy;
