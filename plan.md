# RAGEDERUE Online — Plan de développement

> Dernière mise à jour : 2026-02-21 — M3 terminé

---

## Stack technique

- **Phaser 3** via CDN (HTML + JS vanilla, zéro build step)
- `npm run dev` → `npx http-server . -p 8080 -c-1` pour le dev local
- **WebSocket** (Node.js `ws`) pour le multijoueur (M6)

---

## Structure de projet

```
RAGEDERUEonline/
├── index.html                   ✅
├── package.json                 ✅  scripts: dev, server
├── plan.md                      ✅  ce fichier
├── server.js                    ⏳  (M6) WebSocket server
├── assets/                      ✅  (existant)
└── js/
    ├── main.js                  ✅  Phaser.Game config + scene registry
    ├── config/
    │   ├── constants.js         ✅  LANE_TOP/BOTTOM, SCALE_MIN/MAX...
    │   ├── animations.js        ✅  toutes les anims (dims vérifiées)
    │   └── lootTable.js         ⏳  (M3)
    ├── scenes/
    │   ├── PreloadScene.js      ✅
    │   ├── GameScene.js         ✅
    │   ├── HUDScene.js          ✅
    │   ├── GameOverScene.js     ⏳  (M3)
    │   └── WinScene.js          ⏳  (M3)
    ├── entities/
    │   ├── Player.js            ✅  mouvement + manette + attaques + state machine
    │   ├── Enemy.js             ✅  (M2)
    │   ├── Loot.js              ⏳  (M3)
    │   └── Barrel.js            ⏳  (M5)
    └── systems/
        ├── DepthSystem.js       ✅
        ├── CombatSystem.js      ✅  (M2)
        ├── LootSystem.js        ⏳  (M3)
        ├── SpawnSystem.js       ⏳  (M4)
        └── NetworkManager.js   ⏳  (M6)
```

---

## Spritesheets — dimensions vérifiées ✅

**Toutes les sprites : `frameWidth = 96, frameHeight = 63`**

| Anim | Frames | Clé Phaser |
|------|--------|-----------|
| idle (Brawler Girl) | 4 | `player_idle` |
| walk (Brawler Girl) | **10** | `player_walk` |
| punch (Brawler Girl) | 3 | `player_punch` |
| kick (Brawler Girl) | 5 | `player_kick` |
| jump (Brawler Girl) | 4 | `player_jump` |
| hurt (Brawler Girl) | 2 | `player_hurt` |
| jab (Brawler Girl) | 3 | `player_jab` |
| jump_kick (Brawler Girl) | 3 | `player_jump_kick` |
| dive_kick (Brawler Girl) | 5 | `player_dive_kick` |
| idle (Enemy Punk) | 4 | `enemy_idle` |
| walk (Enemy Punk) | 4 | `enemy_walk` |
| punch (Enemy Punk) | 3 | `enemy_punch` |
| hurt (Enemy Punk) | **4** | `enemy_hurt` |

---

## M1 — Stage + Mouvement joueur ✅ TERMINÉ

**Objectif :** Stage cyberpunk visible, joueur se déplace en 2.5D, scale avec la profondeur, caméra suit.

- [x] `index.html` + `package.json` + `js/main.js` (Phaser 3 CDN)
- [x] `PreloadScene.js` : charge tous les assets + barre de chargement
- [x] `GameScene.js` : 3 couches parallaxe (sky ×0.06, bâtiments ×0.25, décor ×0.5) + world 3840px + caméra lerp
- [x] `constants.js` : LANE_TOP=330, LANE_BOTTOM=470, SCALE_MIN=0.6, SCALE_MAX=1.0
- [x] `DepthSystem.js` : scale + depth + ombre ellipse
- [x] `Player.js` : mouvement 8 directions (curseurs/WASD) + **manette** (stick gauche + D-pad, deadzone 0.15)
- [x] Props placés : 2× car, 2× barrel, 2× hydrant, 6× lamppost/arbre
- [x] `HUDScene.js` : barre HP avec colour shift vert→rouge

**Test :** `npm run dev` → `http://localhost:8080`

---

## M2 — Combat + Ennemi ✅ TERMINÉ

**Objectif :** Joueur frappe (Z=punch, X=kick, C=jab). Enemy Punk patrouille, poursuit, attaque. HP réel dans le HUD.

### Fichiers créés
- [x] `js/entities/Enemy.js` — states : idle / patrol / chase / attack / hurt / dead
- [x] `js/systems/CombatSystem.js` — hitboxes actives via `animationupdate`, knockback

### Fichiers modifiés
- [x] `Player.js` — state machine + attaques clavier/manette + invincibilité 600ms + flash
- [x] `GameScene.js` — spawn 3 ennemis, appel `CombatSystem.update()` chaque frame

### Contrôles combat
| Action | Clavier | Manette |
|--------|---------|---------|
| Punch | Z | Carré / X (btn 2) |
| Kick | X | Croix / A (btn 0) |
| Jab | C | Triangle / Y (btn 3) |

### Notes implémentation
- Hitboxes définies dans `Player.js` (HITBOXES + ACTIVE_FRAMES) — tunable via `DEBUG_HITBOXES=true`
- Death : dernière frame de `enemy_hurt` + fade alpha 700ms ✅
- Son : skippé (passe audio dédiée ultérieure)

**Test :** Z/X/C près d'un ennemi → stagger → mort en fade ; ennemi punch joueur → HP bar diminue + flash blanc

---

## M3 — Boucle d'extraction + Loot ✅ TERMINÉ

**Objectif :** Timer 120s, Ethereum et Sushi spawnent, zone d'extraction à droite, win/lose.

### Fichiers créés
- [x] `js/config/lootTable.js` — 4 types : ethereum (100 ETH), sushi (+20 HP), pizza (+35 HP), ice_cream (+15 HP)
- [x] `js/entities/Loot.js` — sprite + glow ellipse + bob tween, `pickup()` avec pop animation
- [x] `js/systems/LootSystem.js` — `spawnAll()`, détection proximité 48px, auto-collect
- [x] `js/scenes/GameOverScene.js` — GAME OVER + wallet + SPACE/A pour retry
- [x] `js/scenes/WinScene.js` — EXTRACTION SUCCESSFUL + wallet + time bonus + score

### Fichiers modifiés
- [x] `GameScene.js` — timer 120s, `physics.add.group()` + Y-collision disablée, extraction zone (beam + texte pulsant), `_endGame()`
- [x] `HUDScene.js` — timer MM:SS (rouge+clignotant < 30s) + compteur `◆ X ETH`
- [x] `PreloadScene.js` — charge `eth`, `sushi`, `pizza`, `ice_cream` depuis `assets/Sprites/`
- [x] `main.js` — ajout GameOverScene + WinScene, `debug: false`

### Assets utilisés
- `assets/Sprites/eth.png` (42×42)
- `assets/Sprites/sushi.png` (402×290, affiché 40×29)
- `assets/Sprites/Cutted_Pizza.png` (127×68, affiché 40×21)
- `assets/Sprites/Ice_Cream.png` (42×62, affiché 28×42)

**Test :** collecter ETH → compteur monte ; timer → GAME OVER ; atteindre x≥3500 → WIN + score

---

## M4 — Combos + Vagues d'ennemis ⏳ À FAIRE

**Objectif :** Combo jab→jab→kick, jump attacks, vagues séquentielles, grab ennemi.

### Fichiers à créer
- [ ] `js/systems/SpawnSystem.js` — waves `[{ delay, count, spawnPoint }]`, affiche "WAVE X"

### Fichiers à modifier
- [ ] `Player.js` — combo window 500ms, jump arc (tween jumpOffsetY), jump_kick + dive_kick
- [ ] `Enemy.js` — état grab (joueur bloqué 1.5s, button-mash pour s'échapper)

### Assets manquants M4
- ⚠️ Sprite ennemi variant → `setTint(0xff4444)` sur Enemy Punk
- ⚠️ VFX impact → `Phaser.GameObjects.Particles` + `generateTexture` 4×4 blanc

**Test :** jab×2 → kick auto ; jump+X en descente = dive kick ; wave 2 spawn après clear wave 1

---

## M5 — Outils, Consommables, Polish stage ⏳ À FAIRE

**Objectif :** Screwdriver déverrouille du loot spécifique. Barrel interactif. Stage décoré.

### Fichiers à créer
- [ ] `js/entities/Barrel.js` — pickup → carry → throw → dégâts → casse

### Fichiers à modifier
- [ ] `LootSystem.js` — inventaire `player.inventory`, notification HUD
- [ ] `Loot.js` — état locked (gris + cadenas) → déverrouillé si outil présent
- [ ] `GameScene.js` — tous les props aux positions finales, sushi heal +20 HP

### Assets manquants M5
- ⚠️ `screwdriver.png` → **ASSET À CRÉER**
- ⚠️ `pizza.png` → **ASSET À CRÉER**
- ⚠️ Frames casse barrel → particle burst
- ⚠️ `level1.json` (Tiled) → nécessite session Tiled (outil gratuit)

**Test :** ramasser screwdriver → loot verrouillé s'ouvre ; porter barrel → lancer → ennemi touché

---

## M6 — Multijoueur WebSocket ⏳ À FAIRE

**Objectif :** 2 joueurs visibles en temps réel, positions/anims/loot synchro, timer commun.

### Fichiers à créer
- [ ] `server.js` — Node.js `ws`, broadcast `{ type, payload }`, gère `player_update / loot_pickup / player_joined / player_left`
- [ ] `js/systems/NetworkManager.js` — wrapper WebSocket + reconnect backoff

### Fichiers à modifier
- [ ] `package.json` — `npm install ws` + script `"server": "node server.js"`
- [ ] `GameScene.js` — sync toutes les 50ms, joueur 2 distant (position lerpée)

### Assets manquants M6
- ⚠️ Skin joueur 2 → `setTint(0x4488ff)`
- ⚠️ Lobby/matchmaking → auto-connect `ws://localhost:8081`, dot couleur HUD

**Test :** `npm run server` + 2 onglets → mouvement synchro, loot disparaît pour les deux

---

## Tableau global des assets manquants

| Asset | Milestone | Workaround actuel |
|-------|-----------|-------------------|
| Anim `death` BG + EP | M2 | Fade out sur `hurt` |
| Sons SFX (impact, pickup, extract) | M3+ | Muet — passe audio dédiée |
| Musique | M3+ | Muet — passe audio dédiée |
| `pizza.png` | M3 | Sushi sprites relabelisés |
| `screwdriver.png` | M5 | `Graphics.generateTexture` |
| Sprite zone extraction | M3 | Graphics animé |
| Frames casse barrel | M5 | Particle burst |
| `level1.json` (Tiled map) | M5 | Tileset panoramique en attendant |
| Ennemi variant sprite | M4 | `setTint(0xff4444)` sur Enemy Punk |
| VFX impact / sparks | M4 | Particles `generateTexture` |
| Skin Joueur 2 | M6 | `setTint(0x4488ff)` |

---

## Commandes utiles

```bash
# Lancer le jeu
npm run dev
# → http://localhost:8080

# (M6) Lancer le serveur WebSocket
npm run server
```
