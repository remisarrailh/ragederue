# RAGEDERUE Online — Roadmap complète
> Document de référence — à utiliser pour planifier chaque session de travail.
> Mis à jour avec les réponses aux questions de clarification.

---

# PLAN EN COURS — BLOC C : Personnages persistants

## Contexte
Le jeu a besoin d'un système de personnages identifiés côté serveur. Avant d'entrer en jeu, le joueur choisit un personnage (ou en crée un). Le personnage possède un nom et un coffre planque persistant. L'inventaire de jeu est perdu à la mort/déconnexion. Deux joueurs ne peuvent pas jouer simultanément avec le même personnage.

## Réponses de clarification
- **Persistance** : Fichier JSON sur le serveur (`server/characters.json`)
- **Inventaire en jeu** : Perdu à la mort/déconnexion — le coffre planque lui persiste toujours
- **Coffre** : Isolé par charId dans localStorage (`RAGEDERUE_chest_${charId}`)
- **Flux** : `TitleScene → CharacterScene → GameScene(level_03)`
- **Pas de protection des profils** : N'importe qui peut utiliser n'importe quel personnage
- **Limite** : Impossible de se connecter avec un perso déjà en jeu

## Fichiers à créer / modifier (8 fichiers)

| Fichier | Action | Rôle |
|---|---|---|
| `server/CharacterStore.js` | NEW | Lecture/écriture characters.json |
| `server/index.js` | MODIFY | Nouveaux handlers C_CHAR_* |
| `server/Protocol.js` | MODIFY | Constantes + encoders C_CHAR_*, S_CHAR_LIST, S_JOIN_REFUSED |
| `js/network/NetProtocol.js` | MODIFY | Miroir client des nouveaux messages |
| `js/network/NetworkManager.js` | MODIFY | Méthodes sendChar*, callbacks onCharList/onJoinRefused |
| `js/scenes/CharacterScene.js` | NEW | UI sélection/création/suppression personnage |
| `js/scenes/TitleScene.js` | MODIFY | `_go()` → `CharacterScene` |
| `js/scenes/HideoutChestScene.js` | MODIFY | Clé localStorage isolée par charId |
| `js/main.js` | MODIFY | Enregistrer CharacterScene |

---

## Étape 1 — `server/CharacterStore.js` (NEW)

Gestion CRUD du fichier `server/characters.json`. Lecture synchrone à chaque appel (fichier petit, < 100 personnages).

```js
const fs   = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'characters.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { characters: [] }; }
}
function save(data) { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); }

module.exports = {
  getAll()    { return load().characters; },
  getById(id) { return load().characters.find(c => c.id === id) ?? null; },
  create(name) {
    const data = load();
    const char = { id: `char_${Date.now()}`, name, chestItems: [], createdAt: Date.now() };
    data.characters.push(char);
    save(data);
    return char;
  },
  delete(id) {
    const data = load();
    data.characters = data.characters.filter(c => c.id !== id);
    save(data);
  },
};
```

---

## Étape 2 — `server/Protocol.js` — Nouveaux messages

Ajouter après les constantes existantes :

```js
const C_CHAR_LIST    = 0x10;  // C→S : demande liste personnages
const C_CHAR_SELECT  = 0x11;  // C→S : sélectionne/crée un personnage
const C_CHAR_DELETE  = 0x12;  // C→S : supprime un personnage
const S_CHAR_LIST    = 0x90;  // S→C : liste des personnages
const S_JOIN_REFUSED = 0x91;  // S→C : refus (personnage déjà en jeu)
```

Nouvelles fonctions :

```js
// C_CHAR_SELECT: type(1) + action(u8: 0=select, 1=create) + len(u8) + value(N)
function decodeCharSelect(buf) {
  const action = buf[1];
  const len = buf[2];
  const value = buf.slice(3, 3 + len).toString('utf8');
  return { action, value };
}

// C_CHAR_DELETE: type(1) + len(u8) + charId(N)
function decodeCharDelete(buf) {
  const len = buf[1];
  return { charId: buf.slice(2, 2 + len).toString('utf8') };
}

// S_CHAR_LIST: type(1) + count(u8) + [ idLen(u8)+id + nameLen(u8)+name ]*
function encodeCharList(characters) {
  const parts = characters.map(c => ({
    idB: Buffer.from(c.id, 'utf8'),
    nameB: Buffer.from(c.name, 'utf8'),
  }));
  const size = 2 + parts.reduce((s, p) => s + 2 + p.idB.length + p.nameB.length, 0);
  const buf = Buffer.alloc(size);
  buf[0] = S_CHAR_LIST;
  buf[1] = characters.length;
  let off = 2;
  for (const p of parts) {
    buf[off++] = p.idB.length;
    p.idB.copy(buf, off); off += p.idB.length;
    buf[off++] = p.nameB.length;
    p.nameB.copy(buf, off); off += p.nameB.length;
  }
  return buf;
}

// S_JOIN_REFUSED: type(1) + reasonLen(u8) + reason(N)
function encodeJoinRefused(reason) {
  const rb = Buffer.from(reason, 'utf8');
  const buf = Buffer.alloc(2 + rb.length);
  buf[0] = S_JOIN_REFUSED; buf[1] = rb.length;
  rb.copy(buf, 2);
  return buf;
}
```

---

## Étape 3 — `server/index.js`

### Ajouts globaux (après `require` existants)
```js
const CharacterStore = require('./CharacterStore');
const activeChars = new Set();  // charIds actuellement en jeu
```

### Ajout au player object
```js
charId: null,   // défini quand C_CHAR_SELECT(0, charId) réussit
```

### Nouveaux cases dans le switch
```js
case Protocol.C_CHAR_LIST: {
  ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
  break;
}
case Protocol.C_CHAR_SELECT: {
  const { action, value } = Protocol.decodeCharSelect(data);
  if (action === 1) {
    // Créer nouveau personnage
    CharacterStore.create(value);
  } else {
    // Sélectionner existant
    if (activeChars.has(value)) {
      ws.send(Protocol.encodeJoinRefused('Personnage déjà en jeu'), { binary: true });
      break;
    }
    player.charId = value;
    activeChars.add(value);
  }
  ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
  break;
}
case Protocol.C_CHAR_DELETE: {
  const { charId } = Protocol.decodeCharDelete(data);
  CharacterStore.delete(charId);
  ws.send(Protocol.encodeCharList(CharacterStore.getAll()), { binary: true });
  break;
}
```

### Ajout dans ws.on('close')
```js
if (player.charId) activeChars.delete(player.charId);
```

---

## Étape 4 — `js/network/NetProtocol.js`

Ajouter après les constantes existantes :

```js
export const C_CHAR_LIST    = 0x10;
export const C_CHAR_SELECT  = 0x11;
export const C_CHAR_DELETE  = 0x12;
export const S_CHAR_LIST    = 0x90;
export const S_JOIN_REFUSED = 0x91;

export function encodeCharListReq() { return new Uint8Array([C_CHAR_LIST]); }

export function encodeCharSelect(action, value) {
  const bytes = new TextEncoder().encode(value);
  const buf = new Uint8Array(3 + bytes.length);
  buf[0] = C_CHAR_SELECT; buf[1] = action; buf[2] = bytes.length;
  buf.set(bytes, 3);
  return buf;
}

export function encodeCharDelete(charId) {
  const bytes = new TextEncoder().encode(charId);
  const buf = new Uint8Array(2 + bytes.length);
  buf[0] = C_CHAR_DELETE; buf[1] = bytes.length;
  buf.set(bytes, 2);
  return buf;
}

export function decodeCharList(dv) {
  const count = dv.getUint8(1);
  const chars = [];
  let off = 2;
  for (let i = 0; i < count; i++) {
    const idLen = dv.getUint8(off++);
    const id = new TextDecoder().decode(new Uint8Array(dv.buffer, off, idLen)); off += idLen;
    const nameLen = dv.getUint8(off++);
    const name = new TextDecoder().decode(new Uint8Array(dv.buffer, off, nameLen)); off += nameLen;
    chars.push({ id, name });
  }
  return chars;
}

export function decodeJoinRefused(dv) {
  const len = dv.getUint8(1);
  return new TextDecoder().decode(new Uint8Array(dv.buffer, 2, len));
}
```

---

## Étape 5 — `js/network/NetworkManager.js`

### Ajout de callbacks
```js
this.onCharList    = null;   // (characters[]) => void
this.onJoinRefused = null;   // (reason: string) => void
```

### Dans le handler de messages entrants, ajouter
```js
case NP.S_CHAR_LIST:
  if (this.onCharList) this.onCharList(NP.decodeCharList(dv));
  break;
case NP.S_JOIN_REFUSED:
  if (this.onJoinRefused) this.onJoinRefused(NP.decodeJoinRefused(dv));
  break;
```

### Nouvelles méthodes publiques
```js
sendCharListReq()            { this._send(NP.encodeCharListReq()); }
sendCharSelect(action, val)  { this._send(NP.encodeCharSelect(action, val)); }
sendCharDelete(charId)       { this._send(NP.encodeCharDelete(charId)); }
```

---

## Étape 6 — `js/scenes/CharacterScene.js` (NEW)

### Comportement général
- Se connecte au serveur (NetworkManager, sans C_JOIN — juste pour la liste de persos)
- Envoie `sendCharListReq()` à l'ouverture de la connexion
- Affiche la liste des personnages avec sélecteur

### UI layout (monospace, style cohérent)
```
         SÉLECTION PERSONNAGE
         ───────────────────
    >    Remi
         Alex
         (liste scrollable)

   [N] Nouveau   [DEL] Supprimer   [ESC] Retour
   [ENTER] Jouer avec ce personnage
   ── Création ───────────────────
   Nom: _              [ENTER: confirmer]
```

### États de la scène
- `'list'` : navigation dans la liste
- `'create'` : saisie du nom d'un nouveau personnage

### Transitions
- **ENTER / A (état list)** :
  1. `net.sendCharSelect(0, char.id)`
  2. Attendre `onCharList` (confirmation) ou `onJoinRefused`
  3. Si refus → afficher "Ce personnage est déjà en jeu" en rouge (3s)
  4. Si succès → `registry.set('charId', char.id)`, `registry.set('charName', char.name)`, lancer `GameScene({ levelId: 'level_03' })`
- **N (état list)** → passer à état `'create'`
- **ENTER (état create)** → `net.sendCharSelect(1, inputBuffer)` → retour état `'list'`
- **ESC (état create)** → retour état `'list'`
- **DEL / Y (état list)** → `net.sendCharDelete(char.id)` → la liste se met à jour
- **ESC / B (état list)** → fermer la connexion, retour `TitleScene`

### Gestion déconnexion serveur
- Si serveur inaccessible → afficher "Serveur non disponible" + bouton retour

---

## Étape 7 — `js/scenes/HideoutChestScene.js`

Modifier la ligne qui définit `STORAGE_KEY` :

```js
// Avant :
const STORAGE_KEY  = 'RAGEDERUE_chest';

// Après (dans create()) :
const charId = this.registry.get('charId') ?? 'default';
this._storageKey = `RAGEDERUE_chest_${charId}`;
```

Et remplacer toutes les occurrences de `STORAGE_KEY` par `this._storageKey` dans `_loadChest()` et `_saveChest()`.

---

## Étape 8 — `js/scenes/TitleScene.js`

Modifier `_go()` :
```js
_go() {
  if (this._started) return;
  this._started = true;
  if (this.bgMusic) { this.bgMusic.stop(); this.bgMusic.destroy(); this.bgMusic = null; }
  this.scene.start('CharacterScene');  // ← au lieu de 'GameScene'
}
```

---

## Étape 9 — `js/main.js`

```js
import CharacterScene from './scenes/CharacterScene.js';
// Ajouter dans le tableau scene après TitleScene :
scene: [PreloadScene, TitleScene, CharacterScene, LevelEditorScene, ...]
```

---

## Vérification
1. Lancer le serveur → `node server/index.js`
2. Ouvrir le jeu → TitleScene → ENTER → CharacterScene s'affiche avec la liste vide
3. Appuyer N → saisir "Test" → ENTER → "Test" apparaît dans la liste
4. Sélectionner "Test" → arrive dans la planque (level_03)
5. Mettre un item dans le coffre, sortir (warp), revenir → coffre intact
6. Ouvrir 2e onglet → CharacterScene → sélectionner "Test" → "Déjà en jeu"
7. Fermer 1er onglet → réessayer dans le 2e → fonctionne
8. Supprimer "Test" via DEL → disparaît de la liste
9. Redémarrer le serveur → `characters.json` rechargé, personnages toujours là

---

# ANCIENNE SECTION — BLOC A : Stamina / Faim / Soif

## Contexte
Ajout des trois jauges de survie au joueur. Aucune dépendance serveur : tout est local côté client pour l'instant. La vitesse de drain pourra être rendue configurable par serveur dans BLOC B.

## Fichiers à modifier (6 fichiers)

| Fichier | Rôle |
|---|---|
| `js/config/constants.js` | Ajouter les constantes de balance |
| `js/entities/Player.js` | Ajouter les stats, la logique de drain, drain stamina sur actions |
| `js/scenes/HUDScene.js` | Ajouter 3 nouvelles barres |
| `js/config/lootTable.js` | Ajouter propriétés `hungerRestore`/`thirstRestore`, item `water_bottle` |
| `js/systems/Inventory.js` | Appliquer les effets faim/soif/stamina dans `useItem()` |
| `js/scenes/InventoryScene.js` | Étendre la condition d'utilisabilité |

---

## Étape 1 — `js/config/constants.js` (après ligne 19)

```js
// ─── Stamina ──────────────────────────────────────────────────────────────
export const PLAYER_MAX_STAMINA     = 100;
export const STAMINA_REGEN_RATE     = 12;     // points/s quand pas d'action récente
export const STAMINA_REGEN_DELAY_MS = 1500;   // ms d'attente avant regen après une action
export const STAMINA_COST_PUNCH     = 10;
export const STAMINA_COST_KICK      = 15;
export const STAMINA_COST_JAB       = 8;
export const STAMINA_COST_JUMP      = 12;
export const STAMINA_LOW_THRESHOLD  = 0.1;    // fraction — saut impossible en dessous

// ─── Faim ─────────────────────────────────────────────────────────────────
export const PLAYER_MAX_HUNGER      = 100;
export const HUNGER_DRAIN_RATE      = 0.5;    // points/s (100 → 0 en ~200s = ~3min)
export const HUNGER_DAMAGE_RATE     = 1;      // HP perdus/s quand faim = 0

// ─── Soif ─────────────────────────────────────────────────────────────────
export const PLAYER_MAX_THIRST      = 100;
export const THIRST_DRAIN_RATE      = 0.8;    // points/s (plus rapide que la faim)
export const THIRST_DAMAGE_RATE     = 1;      // HP perdus/s quand soif = 0
```

**Import dans Player.js** : ajouter ces constantes à l'import de la ligne 2.

---

## Étape 2 — `js/entities/Player.js`

### 2a. Propriétés (après `this.combat = combat;` ligne 45)
```js
// ── Survie ─────────────────────────────────────────────────────────────
this.stamina           = PLAYER_MAX_STAMINA;
this.maxStamina        = PLAYER_MAX_STAMINA;
this._staminaRegenTimer = 0;   // ms restants avant de regenérer

this.hunger            = PLAYER_MAX_HUNGER;
this.maxHunger         = PLAYER_MAX_HUNGER;
this._hungerDmgAccum   = 0;    // accumulation ms pour tick de dégât faim

this.thirst            = PLAYER_MAX_THIRST;
this.maxThirst         = PLAYER_MAX_THIRST;
this._thirstDmgAccum   = 0;    // accumulation ms pour tick de dégât soif
```

### 2b. Appel dans `update()` (après `this._handleAttackInput();` ligne 149)
```js
this._updateSurvival();
```

### 2c. Nouvelle méthode `_updateSurvival()` (ajouter avant `_handleMovement`)
Utilise `this.scene.game.loop.delta` — pas besoin de modifier la signature.
```js
_updateSurvival() {
  if (this.state === 'dead') return;
  const dt    = this.scene.game.loop.delta;  // ms
  const dtSec = dt / 1000;

  // Stamina — regen différée
  if (this._staminaRegenTimer > 0) {
    this._staminaRegenTimer = Math.max(0, this._staminaRegenTimer - dt);
  } else {
    this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN_RATE * dtSec);
  }

  // Faim
  this.hunger = Math.max(0, this.hunger - HUNGER_DRAIN_RATE * dtSec);
  if (this.hunger <= 0) {
    this._hungerDmgAccum += dt;
    if (this._hungerDmgAccum >= 1000) {
      this._hungerDmgAccum -= 1000;
      this.hp = Math.max(0, this.hp - HUNGER_DAMAGE_RATE);
    }
  } else { this._hungerDmgAccum = 0; }

  // Soif
  this.thirst = Math.max(0, this.thirst - THIRST_DRAIN_RATE * dtSec);
  if (this.thirst <= 0) {
    this._thirstDmgAccum += dt;
    if (this._thirstDmgAccum >= 1000) {
      this._thirstDmgAccum -= 1000;
      this.hp = Math.max(0, this.hp - THIRST_DAMAGE_RATE);
    }
  } else { this._thirstDmgAccum = 0; }
}
```

### 2d. Helper `_drainStamina(amount)` (ajouter à la suite)
```js
_drainStamina(amount) {
  this.stamina = Math.max(0, this.stamina - amount);
  this._staminaRegenTimer = STAMINA_REGEN_DELAY_MS;
}
```

### 2e. Consommation stamina dans `_handleAttackInput()` (après ligne 235)
- Avant `_startJump()` : gate + drain
  ```js
  if (jumpDown && ...) {
    if (this.stamina < this.maxStamina * STAMINA_LOW_THRESHOLD) { /* ignore */ }
    else { this._drainStamina(STAMINA_COST_JUMP); this._startJump(); }
  }
  ```
- Avant chaque attaque (punch/kick/jab) : `this._drainStamina(STAMINA_COST_PUNCH)` etc.

### 2f. Ralentissement quand stamina = 0 (dans `_handleMovement()`, avant `this.setVelocity`)
```js
if (this.stamina <= 0) { vx *= 0.6; vy *= 0.6; }
```

---

## Étape 3 — `js/scenes/HUDScene.js`

**Barres empilées** sous la barre HP. HP est à y=`PAD+4`=18. Chaque barre décalée de 18px.

| Barre | y | Couleur fond | Couleur fill | Texte |
|---|---|---|---|---|
| HP (existant) | 18 | `0x330000` | rouge→vert | `85/100` |
| Stamina | 36 | `0x332200` | `0xffee00`→`0xff6600` | `85/100` |
| Faim | 54 | `0x331100` | `0xff8833`→`0xff2200` | `85/100` |
| Soif | 72 | `0x001133` | `0x00ccff`→`0x0055ff` | `85/100` |

Dans `create()`, ajouter après la barre HP (après ligne 32) :
```js
// ── Stamina bar ──────────────────────────────────────────────────────────
this.add.rectangle(PAD+22, PAD+22, BAR_W, BAR_H, 0x332200).setOrigin(0,0.5).setDepth(500);
this._stFill = this.add.rectangle(PAD+22, PAD+22, BAR_W, BAR_H, 0xffee00).setOrigin(0,0.5).setDepth(501);
this._stText = this.add.text(PAD+22+BAR_W+8, PAD+22, '', { fontFamily:'monospace', fontSize:'11px', color:'#ffee88' }).setOrigin(0,0.5).setDepth(501);

// ── Hunger bar ───────────────────────────────────────────────────────────
this.add.rectangle(PAD+22, PAD+40, BAR_W, BAR_H, 0x331100).setOrigin(0,0.5).setDepth(500);
this._hgFill = this.add.rectangle(PAD+22, PAD+40, BAR_W, BAR_H, 0xff8833).setOrigin(0,0.5).setDepth(501);
this._hgText = this.add.text(PAD+22+BAR_W+8, PAD+40, '', { fontFamily:'monospace', fontSize:'11px', color:'#ffbb88' }).setOrigin(0,0.5).setDepth(501);

// ── Thirst bar ───────────────────────────────────────────────────────────
this.add.rectangle(PAD+22, PAD+58, BAR_W, BAR_H, 0x001133).setOrigin(0,0.5).setDepth(500);
this._thFill = this.add.rectangle(PAD+22, PAD+58, BAR_W, BAR_H, 0x00ccff).setOrigin(0,0.5).setDepth(501);
this._thText = this.add.text(PAD+22+BAR_W+8, PAD+58, '', { fontFamily:'monospace', fontSize:'11px', color:'#88eeff' }).setOrigin(0,0.5).setDepth(501);
```

Dans `update()`, appeler `_updateStamina()`, `_updateHunger()`, `_updateThirst()`.

Nouvelles méthodes (même pattern que `_updateHP()`) :
```js
_updateStamina() {
  const ratio = Phaser.Math.Clamp(this.player.stamina / this.player.maxStamina, 0, 1);
  this._stFill.setSize(Math.round(BAR_W * ratio), BAR_H);
  const r = Math.round(Phaser.Math.Linear(0xff, 0x99, 1 - ratio));
  const g = Math.round(Phaser.Math.Linear(0xee, 0x44, 1 - ratio));
  this._stFill.setFillStyle(Phaser.Display.Color.GetColor(r, g, 0));
  this._stText.setText(`${Math.round(this.player.stamina)}/${this.player.maxStamina}`);
}
_updateHunger() { /* même pattern, couleur orange→rouge */ }
_updateThirst() { /* même pattern, couleur cyan→bleu */ }
```

---

## Étape 4 — `js/config/lootTable.js`

### 4a. Ajouter `hungerRestore` / `thirstRestore` aux items existants
```js
sushi:     { ..., hungerRestore: 35, description: 'Sushi — +20 HP, +35 faim' },
pizza:     { ..., hungerRestore: 50, description: 'Pizza — +35 HP, +50 faim' },
ice_cream: { ..., hungerRestore: 20, thirstRestore: 15, description: 'Ice cream — +15 HP, +20 faim, +15 soif' },
```

### 4b. Nouvel item `water_bottle` (texture placeholder = `'ice_cream'` jusqu'à création de l'asset)
```js
water_bottle: {
  texture:       'ice_cream',  // TODO: remplacer par 'water_bottle' quand l'asset est créé
  invW: 1, invH: 1,
  useTime:       800,
  healAmount:    0,
  thirstRestore: 50,
  value:         0,
  displayW: 28, displayH: 42,
  glowColor:   0x44aaff,
  description: 'Bouteille d\'eau — +50 soif',
},
```

### 4c. Ajouter `water_bottle` aux tables de loot
```js
CONTAINER_LOOT_TABLE: ajouter { type: 'water_bottle', weight: 20 }
CORPSE_LOOT_TABLE:    ajouter { type: 'water_bottle', weight: 15 }
```
(Ajuster les poids des autres items pour que le total reste cohérent)

---

## Étape 5 — `js/systems/Inventory.js` — `useItem()` (après ligne 75)

```js
if (item.def.hungerRestore > 0) {
  player.hunger = Math.min(player.maxHunger, player.hunger + item.def.hungerRestore);
}
if (item.def.thirstRestore > 0) {
  player.thirst = Math.min(player.maxThirst, player.thirst + item.def.thirstRestore);
}
```

---

## Étape 6 — `js/scenes/InventoryScene.js` (ligne 235)

Étendre la condition d'utilisabilité :
```js
// Avant :
if (item.def.useTime <= 0 && item.def.healAmount <= 0) return;
// Après :
if (item.def.useTime <= 0 && !item.def.healAmount && !item.def.hungerRestore && !item.def.thirstRestore) return;
```

---

## Vérification

1. Lancer le jeu, attendre ~3 min → faim et soif atteignent 0, HP baisse doucement
2. Ramasser et utiliser `pizza` → barre faim remonte
3. Frapper 10× → barre stamina baisse, regen après ~1.5s d'inactivité
4. Vider la stamina (spam frappe) → vitesse diminue, saut bloqué
5. Ramasser une bouteille d'eau → soif remonte

---

---

## Vision du jeu (clarifiée)

**Tarkov en beat-em-up coop, 2-3h par partie.**
- La "victoire" = accomplir toutes les **quêtes principales** avant la fin du timer
- 1 run = 2-3h max ; les joueurs spawent dans la planque au début
- Le run se termine (victoire) quand les quêtes principales sont toutes faites
- La planque et ses **améliorations** sont **persistantes** entre les runs
- L'inventaire d'un joueur est **perdu à sa mort** (corps lootable par les autres)
- Si mort : **10s au sol → un coéquipier peut relever** → sinon respawn dans la planque

---

## Ce qui existe déjà

| Système | État |
|---------|------|
| Déplacement + combats (punch/kick/jab/jump) | ✅ |
| Ennemis IA patrol/chase/attack/knockdown | ✅ |
| Inventaire grille 6×4 + items variables | ✅ |
| LootSystem (containers + cadavres) | ✅ |
| Réseau WebSocket (sync joueurs/ennemis/loot) | ✅ |
| Éditeur de niveaux complet (zoom, props, transit, layers) | ✅ |
| HP + timer run + world reset | ✅ |
| Toutes les scènes UI de base | ✅ |

---

## Organisation des features — 9 Blocs

---

### BLOC A — Survie (stamina, faim, soif)
*Peut démarrer immédiatement — aucune dépendance serveur*

**A1 — Stamina**
- Barre dans HUD (icône à créer)
- Baisse : saut, punch, kick, jab
- À 0 → mouvements et coups ralentis (vitesse × 0.6 ?)
- Saut impossible si < 10%
- Regénération passive (quand inactif X secondes)
- **Dans la planque** : régénération × 2 (ou instantanée ?)

**A2 — Faim**
- Barre dans HUD (icône à créer)
- Baisse passivement (rythme configurable par serveur)
- À 0 → -1 HP/s
- Items nourriture existants (`pizza`, `sushi`, `ice_cream`) → remontent faim
- Certains items font **baisser la soif** (à définir item par item dans lootTable)
- **Dans la planque** : regen auto (+ rapide avec amélioration Cuisine)

**A3 — Soif**
- Même logique que faim
- Items eau (`water_bottle` — **asset à créer**) → remontent soif
- **Dans la planque** : regen auto (+ rapide avec amélioration Filtration)

**Fichiers :** `Player.js`, `HUDScene.js`, `lootTable.js`, `Inventory.js`

---

### BLOC B — Planque (Safe House)
*Dépend de : réseau serveur pour la persistance*

**B1 — Niveau planque**
- `level_planque` : niveau spécial sans ennemi, sans loot aléatoire
- Accessible depuis **level_01 uniquement** (porte warp dédiée)
- Fond/décors différents du reste (salle souterraine ?) — **assets à créer**
- La planque est **commune** à tous les joueurs d'une session

**B2 — Coffre persistant**
- Interface coffre (comme SearchScene mais stockage permanent)
- Timer de run ne détruit **pas** les items dedans
- Taille initiale suggérée : **6×3 = 18 slots** ; upgradable
- Items dans le coffre survivent à la mort du joueur et aux world resets

**B3 — 5 Améliorations (déverrouillables)**

| Amélioration | Coût | Effet gameplay |
|---|---|---|
| Cuisine | ETH + ingrédients spécifiques | Regen faim × 2 dans planque ; crafting nourriture |
| Filtration | ETH + items spécifiques | Regen soif × 2 ; créer bouteilles d'eau |
| Coffre+ | ETH + items | +18 slots de stockage supplémentaires |
| Gym | ETH + items | Accès UI pour dépenser les points de compétences |
| Atelier | ETH + items | Crafting armes (recettes à définir) |

**B4 — Spawn au démarrage**
- Les joueurs apparaissent dans `level_planque` à chaque début de run
- Plus de spawn en `level_01` directement

**Fichiers :** nouveau `level_planque.js`, `GameScene.js`, `PlanqueScene.js` (ou extension), `NetProtocol.js`, `server/`

---

### BLOC C — Personnage persistant
*Dépend de : serveur complet*

**C1 — Création de personnage**
- Écran à la première connexion : saisir un nom
- Si personnage déjà créé → sélection automatique (stocké localement + serveur)
- Scène : `CharacterScene.js`

**C2 — Inventaire persistant côté serveur**
- L'inventaire du joueur est sauvegardé sur le serveur
- Perdu à la mort (le body reste avec le loot sur la map)
- Body lootable par n'importe qui (autres joueurs ou toi-même)
- Body disparaît avec le prochain world reset
- Coffre planque lui ne reset jamais

**C3 — Système DBNO (Down But Not Out)**
- Quand HP = 0 → état "au sol" pendant **10 secondes**
- Un coéquipier à moins de 64px peut appuyer sur E pour relever (HP = 30% ?)
- Si pas relevé → mort réelle → respawn dans la planque
- Le body + inventaire reste sur la map pour le reste du run

**Fichiers :** `CharacterScene.js`, `Player.js`, `GameScene.js`, `NetProtocol.js`, `server/`

---

### BLOC D — XP et compétences
*Dépend de : Bloc B (Gym dans la planque)*

**D1 — Gain d'XP**
- Tuer un ennemi : XP (variable selon ennemi)
- Compléter une quête : XP (défini dans la quête)
- Extraire des items dans le coffre planque : XP

**D2 — Compétences (Gym)**
- Dépense de points de skill via UI dans la planque (si Gym déverrouillé)
- Suggestions de compétences (à confirmer) :
  - Vie max (+10 HP/niveau)
  - Stamina max (+10/niveau)
  - Dégâts (+5% /niveau)
  - Vitesse de déplacement (+3%/niveau)
  - Slots inventaire supplémentaires (+1×1 par niveau)

**Fichiers :** `Player.js`, `PlanqueScene.js`, `server/`

---

### BLOC E — Armes
*Dépend de : Bloc B (Atelier), Bloc C (personnage)*

**Slot d'équipement dédié :**
- Nouveau slot "arme" visible dans le HUD
- L'arme équipée change le comportement de l'attaque de base (touche X)
- Sans arme = coups de poing actuels

| Arme | Type | Mécanique proposée |
|---|---|---|
| Batte | Mêlée lente | Grande portée, knockdown facile |
| Couteau | Mêlée rapide | Combo 3 coups rapides |
| Sabre | Mêlée moyenne | Attaque en arc (portée latérale) |
| Pistolet | Ranged | Tir en direction du regard, munitions limitées |
| Fusil mitrailleur | Ranged | Rafale auto, dégâts/coup faibles, consomme stamina |

- Armes **fabriquées à l'Atelier** ou **trouvées en loot** (rares)
- Armes rangées dans l'inventaire normalement (taille : 1×2 ou 2×1)
- Équiper = drag depuis inventaire vers slot arme (ou touche rapide)

**Assets manquants :** sprites pour les 5 armes + animations joueur avec arme équipée

**Fichiers :** `Player.js`, `HUDScene.js`, `InventoryScene.js`, `lootTable.js`

---

### BLOC F — Quêtes
*Dépend de : Bloc B (planque = hub de quêtes), Bloc C*

**Vision : quêtes scriptées dans l'éditeur de niveaux**

**Types de quêtes :**
1. **Récupérer un objet spécifique** — l'item a un ID de quête, le déposer dans le coffre planque valide
2. **Récupérer X items** — compter un type d'item spécifique dans le coffre planque
3. **Tuer un ennemi spécial** — boss à position fixe définie dans l'éditeur (serveur choisit laquelle)
4. **Poser un objet dans une zone** — zone de dépôt définie dans l'éditeur

**Éditeur de quêtes (dans LevelEditorScene) :**
- Nouvelle palette : `[quête]` → placer une zone/marqueur de quête
- Paramètres : type de quête, ID, label affiché, conditions

**Ennemis spéciaux / boss :**
- Positions fixes multiples définies dans l'éditeur (ex : 3 positions possibles dans level_01)
- À chaque run, le serveur choisit une position au hasard
- L'ennemi spécial a des stats différentes (HP × 3, dégâts × 2 ?)

**UI quêtes :**
- Journal de quêtes (touche dédiée ou dans PauseScene)
- Indicateur d'objectif actif dans le HUD (texte court en bas)

**Fichiers :** `LevelEditorScene.js` (nouveau type objet quête), `GameScene.js`, `HUDScene.js`, `server/`, `NetProtocol.js`

---

### BLOC G — Éditeur de Props
*Indépendant — peut démarrer à tout moment*

Accessible depuis un bouton dans la toolbar de LevelEditorScene.

**G1 — Liste des props**
- Voir tous les types de props enregistrés
- Ajouter un nouveau type (lier un asset image, définir scale par défaut)
- Supprimer un type (confirmation si utilisé dans un niveau)

**G2 — Paramètres par type**
- `collisionPlayer` : bool (déjà partiellement implémenté via `blocksPlayer`)
- `collisionEnemy` : bool (nouveau)
- Scale par défaut
- Aperçu du sprite

**G3 — Resize dans l'éditeur de niveau**
- Poignées de resize sur les props sélectionnés (comme transit zones)
- Si resize → applique à tous les props du **même type dans le niveau courant**
- (Pas global à tous les niveaux — sauf option explicite)

**G4 — Retrait de l'outil "extract"**
- Supprimer le type `extract` de la palette de l'éditeur
- Les warp zones restent (pour naviguer entre niveaux et aller à la planque)
- La condition de victoire passe par les quêtes, pas par une extract zone

**Fichiers :** `LevelEditorScene.js`, `server/editor-server.js`, `js/config/` (nouveau `propsDefinitions.js` ?)

---

### BLOC H — Éditeur de Loot Tables
*Indépendant — peut démarrer à tout moment*

**H1 — Éditeur de tables de loot**
- Accessible depuis LevelEditorScene (ou scène dédiée)
- Sélectionner un type de container → ajuster % de chaque item
- Voir la distribution visuelle (mini bar chart)

**H2 — Éditeur d'items**
- Liste de tous les items
- Ajouter un item : nom, sprite, taille (invW × invH), effets (vie, stamina, faim, soif, ETH)
- Retirer un item (avertissement si utilisé dans des loot tables)

**Fichiers :** `LevelEditorScene.js` ou `LootEditorScene.js`, `lootTable.js`, `server/editor-server.js`

---

## Assets manquants

### Sprites d'items
| Asset | Description | Priorité |
|---|---|---|
| `water_bottle` (1×1) | Item de soif | HAUTE (Bloc A) |
| `water_bottle_crafted` | Bouteille crafted (Filtration) | MOYENNE (Bloc B) |
| Icône stamina HUD | Barre endurance | HAUTE |
| Icône faim HUD | Barre faim | HAUTE |
| Icône soif HUD | Barre soif | HAUTE |

### Sprites d'armes (Bloc E)
| Asset | Animations nécessaires |
|---|---|
| `bat` | Idle, attaque (2-3 frames) |
| `knife` | Idle, attaque rapide (3 frames) |
| `sword` | Idle, attaque arc (3 frames) |
| `pistol` | Idle, tir |
| `smg` | Idle, rafale |
| Joueur tenant arme | Overlay sur les animations joueur existantes ? |

### Niveau planque (Bloc B)
| Asset | Description |
|---|---|
| Fond planque | Salle souterraine / bunker (toute largeur) |
| Coffre / boîte de stockage | Sprite du meuble coffre |
| Cuisine sprite | Décor upgrade cuisine |
| Filtration sprite | Décor upgrade filtration |
| Gym sprite | Décor upgrade gym |
| Atelier sprite | Décor upgrade atelier |

### Audio
| Asset | Déclencheur |
|---|---|
| Coup batte | Impact batte |
| Tir pistolet | Shoot |
| Tir SMG | Rafale |
| Level up | Skill upgradé |
| Quête complétée | Objectif rempli |
| Joueur relevé | DBNO → relèvement |
| Musique planque | Ambiance safe house |

---

## Ordre de développement recommandé

| # | Bloc | Durée estimée | Dépendances |
|---|---|---|---|
| 1 | **BLOC A** — Stamina + faim + soif | Courte-moyenne | Aucune |
| 2 | **BLOC G** — Éditeur de props | Courte | Aucune |
| 3 | **BLOC H** — Éditeur de loot tables | Courte-moyenne | Aucune |
| 4 | **BLOC B** — Planque (niveau + coffre) | Longue | — |
| 5 | **BLOC B** — Améliorations planque | Longue | Bloc B coffre |
| 6 | **BLOC C** — Personnage + DBNO | Très longue | Serveur |
| 7 | **BLOC E** — Armes | Longue | Assets sprites |
| 8 | **BLOC D** — XP + compétences | Moyenne | Bloc B Gym |
| 9 | **BLOC F** — Quêtes | Très longue | Blocs B, C, éditeur |

---

## Suggestions / Oublis potentiels

| Suggestion | Pourquoi c'est important |
|---|---|
| **Minimap / indicateur de position** | Les niveaux font 10 000+ px, difficile de s'orienter |
| **Journal de quêtes in-game** | Tracker d'objectifs visible sans ouvrir le menu |
| **Recettes de crafting (Atelier)** | Quels items → quelle arme ? À lister avant d'implémenter |
| **Feedback faim/soif critique** | Alerte visuelle (flash rouge) + son quand barre très basse |
| **Relève DBNO côté réseau** | L'action de relèvement doit être synchro multijoueur |
| **Paramètre serveur : vitesse survie** | Pouvoir ralentir/accélérer la consommation faim/soif |
| **Corps joueur mort : sprite distinct** | Visuellement différencier un joueur mort d'un ennemi mort |
| **Résumé de fin de run** | Écran de stats : XP gagné, quêtes faites, items extraits |
| **Quête principale vs. secondaire** | Certaines quêtes obligatoires (victoire), d'autres optionnelles (XP bonus) |
| **Difficulté configurable serveur** | Ennemis plus/moins nombreux, faim/soif plus rapide |
