# SOR Online — Plan de développement

## Stack technique
- **Phaser 3** via CDN (HTML + JS vanilla, zéro build step)
- `npx http-server . -p 8080 -c-1` pour le dev local
- **WebSocket** (Node.js `ws`) pour le multijoueur (M6)

---

## Structure de projet

```
soronline/
├── index.html
├── package.json                 # scripts: dev, server
├── server.js                    # (M6) WebSocket server
├── assets/                      # (existant)
└── js/
    ├── main.js                  # Phaser.Game config + scene registry
    ├── config/
    │   ├── constants.js         # LANE_TOP/BOTTOM, SCALE_MIN/MAX, COMBO_WINDOW...
    │   ├── animations.js        # Toutes les définitions d'anims Phaser
    │   └── lootTable.js         # Items, valeurs, tools requis, heal
    ├── scenes/
    │   ├── PreloadScene.js
    │   ├── GameScene.js         # Scène principale (game loop, caméra, timer)
    │   ├── HUDScene.js          # Scène parallèle (HP bar, timer, loot count)
    │   ├── GameOverScene.js
    │   └── WinScene.js
    ├── entities/
    │   ├── Player.js            # State machine + input + animations
    │   ├── Enemy.js             # AI state machine
    │   ├── Loot.js              # Pickup animé, état locked/unlocked
    │   └── Barrel.js            # Prop interactif jetable
    └── systems/
        ├── DepthSystem.js       # Scale + depth basés sur Y
        ├── CombatSystem.js      # Hitboxes actives, résolution, knockback
        ├── LootSystem.js        # Pickup logic, tool-gating, consumables
        ├── SpawnSystem.js       # Waves d'ennemis
        └── NetworkManager.js   # (M6) WebSocket client wrapper
```

---

## Concepts techniques clés

### 2.5D Pseudo-profondeur
- `LANE_TOP = 340`, `LANE_BOTTOM = 480` (Y world coords)
- `t = (entity.y - LANE_TOP) / (LANE_BOTTOM - LANE_TOP)` → `scale = lerp(0.65, 1.0, t)`
- `entity.setDepth(entity.y)` → tri automatique
- La couche `fore.png` a un depth fixe > `LANE_BOTTOM + 50` (toujours devant)
- Ombre : ellipse `Graphics` sous chaque entité, scale et alpha proportionnels à `t`

### Système de hitboxes
- Le "hurtbox" = physics body Arcade sur chaque entité
- Le "hitbox" = `Phaser.Geom.Rectangle` activé uniquement sur les frames actives d'attaque
- Activation via l'event `animationupdate` → frame index 2 (punch) → `CombatSystem.activateHitbox()`
- Un hit par activation (`used: true` après le premier contact)
- Flag `constants.DEBUG_HITBOXES` pour visualiser via `Graphics.strokeRect`

### Spritesheets — dimensions vérifiées ✓

**Toutes les sprites utilisent exactement : `frameWidth = 96, frameHeight = 63`**

| Anim | Total px | Frames | Clé Phaser |
|------|----------|--------|-----------|
| idle (BG) | 384×63 | 4 | `player_idle` |
| walk (BG) | 960×63 | **10** | `player_walk` |
| punch (BG) | 288×63 | 3 | `player_punch` |
| kick (BG) | 480×63 | 5 | `player_kick` |
| jump (BG) | 384×63 | 4 | `player_jump` |
| hurt (BG) | 192×63 | 2 | `player_hurt` |
| jab (BG) | 288×63 | 3 | `player_jab` |
| jump_kick (BG) | 288×63 | 3 | `player_jump_kick` |
| dive_kick (BG) | 480×63 | 5 | `player_dive_kick` |
| idle (EP) | 384×63 | 4 | `enemy_idle` |
| walk (EP) | 384×63 | 4 | `enemy_walk` |
| punch (EP) | 288×63 | 3 | `enemy_punch` |
| hurt (EP) | 384×63 | **4** | `enemy_hurt` |

### Parallaxe
| Layer | Asset | Depth | ScrollFactor |
|-------|-------|-------|-------------|
| Ciel / fond | `back.png` | 0 | tilePositionX × 0.05 |
| Bâtiments | `tileset.png` | 10 | tilePositionX × 0.25 |
| Sol (Graphics) | — | 20 | 1.0 |
| Déco avant | `fore.png` | LANE_BOTTOM+50 | tilePositionX × 0.5 |

Tous créés en `tileSprite`, `setScrollFactor(0)`, déplacés manuellement dans `update()` via `camX`.

> **Note `tileset.png`** : à vérifier si c'est un atlas Tiled ou une image panoramique. Si atlas → créer `level1.json` avec Tiled (outil gratuit). En attendant : utiliser comme `tileSprite` panoramique.

---

## Milestones

### M1 — Stage + Mouvement joueur
**Objectif :** Stage cyberpunk visible, joueur se déplace en 2.5D, scale avec la profondeur, caméra suit.

- `index.html` + `package.json` + `main.js` (Phaser 3 CDN)
- `PreloadScene` : charge back, fore, tileset, barrel, player idle/walk
- `GameScene` : 3 couches parallaxe (tileSprite) + world bounds 3840px + caméra lerp
- `constants.js` : LANE_TOP/BOTTOM, SCALE_MIN/MAX
- `DepthSystem.js` : scale + depth + ombre
- `Player.js` : mouvement 8 directions (curseurs/WASD), clampé sur Y, anims idle/walk, flipX selon direction
- 1 barrel placé en world space (depth fixe = 420)
- `HUDScene.js` : stub "HP: 100" texte fixe (scène parallèle)

**Assets manquants M1 :**
- Dimensions réelles des sprites (à vérifier avant preload) ⚠️
- Sol : `Graphics` rectangle foncé entre LANE_TOP et LANE_BOTTOM

---

### M2 — Combat + Ennemi
**Objectif :** Joueur frappe (Z=punch, X=kick, A=jab). Enemy Punk patrouille, poursuit, attaque. HP réel dans le HUD.

- `Player.js` : state machine (idle/walk/punch/kick/jab/hurt/jump), blocage input pendant attaque
- `CombatSystem.js` : hitboxes actives via `animationupdate`, résolution overlap, knockback
- `Enemy.js` : states idle/patrol/chase/attack/hurt/dead ; AI basique distance-based
- `Enemy.takeHit()` : knockback velocity, anim hurt, HP → 0 = fade out
- `Player.takeHit()` : invincibilité 500ms, event `player-damaged` vers HUDScene
- `HUDScene.js` : vraie barre HP via `Graphics`
- 3 ennemis placés à positions fixes dans GameScene

**Assets manquants M2 :**
- Animation `death` Enemy Punk → **MANQUANT** — workaround : fade alpha tween sur `hurt`
- Sons d'impact → **MANQUANT** — muet pour M2

---

### M3 — Boucle d'extraction + Loot
**Objectif :** Timer 120s, Ethereum et Sushi spawnent, zone d'extraction à droite, win/lose conditions.

- `lootTable.js` : définit items `{ key, texture, value, isConsumable, requiresTool, healAmount }`
- `Loot.js` : sprite animé 2 frames (tileEvent loop 400ms), glow `Graphics`
- `LootSystem.js` : pickup, tool-gating ("Need screwdriver" floating text), heal si consommable
- `GameScene` : timer countdown → `GameOverScene` ; 8 ethereum + 2 sushi placés ; `ExtractionZone`
- `ExtractionZone` : rectangle `Graphics` clignotant + "EXTRACT" texte néon, overlap → `WinScene`
- `HUDScene` : timer MM:SS + compteur loot (icône ethereum + nombre)
- `GameOverScene` / `WinScene` : texte simple + score final

**Assets manquants M3 :**
- `pizza.png` → **MANQUANT** — utiliser sushi sprites avec label "PIZZA"
- `screwdriver.png` → **MANQUANT** — `Graphics.generateTexture` rectangle blanc
- Sprite zone d'extraction → workaround `Graphics` animé
- Sons pickup/timer → muet pour M3

---

### M4 — Combos + Vagues d'ennemis
**Objectif :** Système de combos (jab→jab→kick), jump attacks, vagues d'ennemis, grab ennemi.

- `Player.js` : `lastAttackTime` + `comboCount` ; window 500ms ; combo 3 = kick auto
- `Player.js` jump : tween sur `jumpOffsetY` (arc simulé) ; Z en l'air = `jump_kick` ; X en descente = `dive_kick` (hitbox large, AoE)
- `Enemy.js` : état `grab` — joueur bloqué 1.5s, button-mash pour s'échapper
- `SpawnSystem.js` : config par waves `[{ delay, count, spawnPoint }]` ; affiche "WAVE X"
- Variants ennemis via config `{ hp, speed, damage }` + `setTint` pour différencier

**Assets manquants M4 :**
- Sprite ennemi variant → **MANQUANT** — `setTint(0xff4444)` sur Enemy Punk
- Animation grab ennemi → **MANQUANT** — `enemy_punch` loop + tint rouge sur joueur
- VFX impact → workaround : `Phaser.GameObjects.Particles` avec `generateTexture` (carré 4×4 blanc)

---

### M5 — Outils, Consommables, Polish du stage
**Objectif :** Screwdriver déverrouille du loot. Barrel interactif (lancer). Tous les props placés. Tilemap propre.

- `LootSystem.js` : inventaire `player.inventory` Map ; notification HUD à l'acquisition
- `Loot.js` : état `locked` (gris + cadenas Graphics) → déverrouillé si outil en inventaire
- `Barrel.js` : pickup (touche action près du barrel) → carry → throw (velocity dans direction) → damages ennemis → casse au contact
- Placer tous les props (`car`, `hydrant`, `banner-hor`, sushi) aux positions prévues avec depth correct
- `tileset.png` → si atlas Tiled : créer `level1.json`, charger via `this.make.tilemap`
- Sushi pickup : heal +20 HP + tween scale burst

**Assets manquants M5 :**
- `screwdriver.png` → **MANQUANT** ⚠️
- `pizza.png` → **MANQUANT** ⚠️
- Frames de casse barrel → workaround particles
- `level1.json` → nécessite session Tiled (outil gratuit) ⚠️

---

### M6 — Multijoueur WebSocket
**Objectif :** 2 joueurs se voient en temps réel, positions/animations synchro, loot partagé, timer commun.

- `server.js` : Node.js `ws` ; broadcast `{ type, payload }` ; gère `player_update`, `loot_pickup`, `player_joined/left`
- `package.json` : `npm install ws` + script `"server": "node server.js"`
- `NetworkManager.js` : wrapper WebSocket + reconnect exponential backoff
- `GameScene` : sync toutes les 50ms (`player_update { x, y, anim, frame, hp, lootBag }`)
- Player 2 distant : instance `Player` avec `isLocalPlayer=false` (pas d'input clavier), position lerpée
- `loot_pickup` broadcast : tous les clients détruisent le même loot ID
- Hôte (premier connecté) fait tourner l'IA ennemie

**Assets manquants M6 :**
- Skin joueur 2 → **MANQUANT** — `setTint(0x4488ff)` pour différencier
- Lobby/matchmaking UI → workaround : auto-connect à `ws://localhost:8081`, dot couleur dans HUD

---

## Tableau récapitulatif des assets manquants

| Asset | Milestone | Workaround |
|-------|-----------|------------|
| Dimensions réelles sprites | M1 ⚠️ | Script `naturalWidth` à exécuter en premier |
| `tileset.png` format (atlas or panorama) | M1 ⚠️ | tileSprite en attendant |
| Animation `death` (BG + EP) | M2 | Fade out sur `hurt` |
| Sons SFX (impact, pickup, extract) | M3+ | Muet → passe audio dédiée |
| Musique | M3+ | Muet → passe audio dédiée |
| `pizza.png` | M3 | sushi sprites relabelisés |
| `screwdriver.png` | M5 | `Graphics.generateTexture` |
| Sprite zone extraction | M3 | Graphics animé |
| Frames casse barrel | M5 | Particle burst |
| `level1.json` (Tiled map) | M5 | Créer avec Tiled (gratuit) |
| Ennemi variant sprite | M4 | `setTint` Enemy Punk |
| VFX impact / sparks | M4 | Particles generateTexture |
| Skin Joueur 2 | M6 | `setTint(0x4488ff)` |

---

## Fichiers critiques (à ne pas négliger)

| Fichier | Rôle |
|---------|------|
| `js/config/constants.js` | Toutes les valeurs tunable — source unique |
| `js/scenes/GameScene.js` | Orchestration de tous les systèmes + game loop |
| `js/systems/CombatSystem.js` | Base du feeling combat — doit être juste avant M2 |
| `js/entities/Player.js` | State machine + input buffering — cœur du gameplay |
| `js/config/animations.js` | Frame counts incorrects = bugs silencieux partout |

---

## Vérification / test par milestone

- **M1** : `npm run dev` → `localhost:8080` → joueur visible, walk/idle, scale change avec Y, barrel en profondeur
- **M2** : punch enemy → stagger + mort (fade) ; enemy attaque joueur → HP bar diminue
- **M3** : collecter ethereum → compteur HUD monte ; timer → game over ; atteindre EXTRACT → win screen
- **M4** : enchaîner jab×2 → kick auto ; jump + X en descente = dive kick ; wave 2 spawn après wave 1 clear
- **M5** : ramasser screwdriver → loot verrouillé s'ouvre ; porter barrel → lancer → ennemi se prend le barrel
- **M6** : `npm run server` + 2 onglets → 2 joueurs visibles, mouvement synchro, loot disparaît pour les deux
