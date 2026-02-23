Voici la suite du guide, avec une explication détaillée du rôle de chaque fichier. C'est idéal pour s'y retrouver rapidement quand on cherche à modifier une fonctionnalité précise.

Vous pouvez copier-coller cette section à la fin du document Markdown généré précédemment.

---

## 7. Explication détaillée des fichiers (Architecture du projet)

### 📂 À la racine du projet

Ces fichiers servent à configurer, lancer et déployer le projet.

* **`index.html`** : Le point d'entrée web du jeu. Il charge le moteur Phaser depuis un CDN et lance le script principal (`main.js`).
* **`server.html`** : Le tableau de bord (dashboard) du serveur. Ouvrez-le dans un navigateur pour voir les statistiques en temps réel (joueurs, RAM, tickrate).
* **`package.json` & `vite.config.js**` : La configuration Node.js et Vite. Gèrent les dépendances et les scripts de lancement (`npm run dev`, `npm run server`).
* **`docker-compose.yml` & `Dockerfile**` : Fichiers permettant de déployer facilement le serveur de jeu sur un serveur distant via Docker.
* **`gamedesign2.md`** : Le document de conception (Game Design Document) contenant les idées, les correctifs à faire et les évolutions prévues.

---

### 📂 `js/` — Le Client (Frontend)

Tout ce qui s'exécute dans le navigateur du joueur.

* **`main.js`** : Le cœur du client. Initialise Phaser, configure la taille de l'écran, la physique et déclare toutes les scènes du jeu.

#### 📁 `js/config/` (Configurations et Données)

* **`constants.js`** : Toutes les constantes d'équilibrage (vitesse, points de vie, dégâts, dimensions, timers). À modifier pour ajuster le gameplay.
* **`animations.js`** : Déclare les animations des sprites (joueur et ennemis) à partir des planches d'images (spritesheets).
* **`lootTable.js`** : Contient les définitions de tous les objets (soin, valeur, taille dans l'inventaire) et les probabilités de drop.
* **`levels.js` & `levels/**` : Fichiers générés automatiquement par l'éditeur de niveau. Ils décrivent le contenu (ennemis, objets, murs) de chaque carte.
* **`backgrounds.js`** : Détecte automatiquement les images de fond dans le dossier assets.

#### 📁 `js/entities/` (Objets du jeu)

* **`Player.js`** : Gère la logique du joueur local (contrôles, mouvements, déclenchement des attaques, jauge d'endurance/faim/soif).
* **`Enemy.js`** : La classe de base d'un ennemi (animations, réception des dégâts).
* **`RemoteEnemy.js`** : L'ennemi tel qu'il est vu par le client. Il n'a pas d'IA locale, il se contente de glisser (interpoler) vers les coordonnées envoyées par le serveur.
* **`Loot.js`** : Représente un objet ramassable tombé au sol (gère l'animation de flottement et le visuel).
* **`Container.js`** : Un conteneur fouillable (comme un tonneau).

#### 📁 `js/network/` (Réseau côté Client)

* **`NetworkManager.js`** : S'occupe de la connexion WebSocket. Contient les fonctions pour envoyer ses actions (`sendState`, `sendHitEnemy`) et recevoir les données du serveur.
* **`NetProtocol.js`** : Le traducteur Binaire ↔ JavaScript. Permet de compresser les données réseau pour éviter le lag.
* **`RemotePlayer.js`** : Représente les autres joueurs connectés. Se contente d'afficher leur sprite et de lisser leurs mouvements.

#### 📁 `js/scenes/` (Les Écrans du jeu)

* **`PreloadScene.js`** : L'écran de chargement. Charge toutes les images et musiques en mémoire.
* **`TitleScene.js`** : L'écran d'accueil du jeu.
* **`CharacterScene.js`** : L'écran de création et de sélection du personnage.
* **`GameScene.js`** : La boucle principale du jeu. C'est ici que le monde est instancié et que l'action se déroule.
* **`game/WorldBuilder.js`** : Génère le décor et les zones de transition (portes).
* **`game/InputController.js`** : Gère les entrées clavier/manette brutes.
* **`game/NetworkHandlers.js`** : Lie les événements réseaux à la scène principale.


* **`HUDScene.js`** : L'interface utilisateur par-dessus le jeu (barres de vie, timer, thune).
* **`InventoryScene.js`** : L'écran de l'inventaire sous forme de grille.
* **`SearchScene.js`** : L'interface d'attente et de fouille quand on ouvre un conteneur ou un cadavre.
* **`HideoutChestScene.js`** : L'interface du coffre persistant dans la planque (Safehouse).
* **`LevelEditorScene.js`** : L'éditeur de niveaux intégré au jeu.
* **`MobileControlsScene.js`** : Les boutons tactiles et le joystick qui s'affichent sur smartphone.
* **`PauseScene.js`** : Le menu des paramètres (Volume, Choix de la manette).
* **`WinScene.js` & `GameOverScene.js**` : Les écrans de fin de partie (Victoire ou Défaite).

#### 📁 `js/systems/` (Logique découplée)

* **`CombatSystem.js`** : Vérifie à chaque image si une "Hitbox" (poing/pied) touche une "Hurtbox" (corps d'un ennemi).
* **`DepthSystem.js`** : Gère la fausse 3D ("2.5D"). Trie les sprites pour que les personnages plus bas sur l'écran s'affichent par-dessus ceux qui sont derrière.
* **`Inventory.js`** : La structure de données de l'inventaire (tableau 2D gérant les objets qui prennent 1x1 ou 2x2 cases).
* **`LootSystem.js`** : Vérifie quel est le conteneur ou le cadavre le plus proche du joueur pour afficher l'invite "Appuyez sur E".

---

### 📂 `server/` — Le Backend (Node.js)

Tout ce qui tourne sur le serveur distant et qui dicte les règles.

* **`index.js`** : Le point d'entrée principal. Démarre le serveur Web (pour les stats) et le serveur WebSocket. Il répartit les joueurs dans les bonnes `Rooms`.
* **`Room.js`** : Représente une instance de niveau (ex: la rue). Contient la boucle principale du serveur (`_tick()` à 20Hz), gère le chronomètre, et stocke la liste des ennemis et des loots.
* **`ServerEnemy.js`** : L'Intelligence Artificielle d'un ennemi (Patrouille -> Poursuite -> Attaque). Calcule les déplacements purs sans aucun affichage.
* **`WaveSpawner.js`** : Le système d'apparition des ennemis. Gère l'apparition par vagues et disperse les ennemis si la rue est vide.
* **`CharacterStore.js`** : Gère la sauvegarde et la lecture de la base de données.
* **`characters.json`** : La base de données (très simple) qui stocke les personnages, leurs identifiants et le contenu de leur coffre.
* **`Protocol.js`** : Le jumeau exact de `NetProtocol.js` côté client. Il permet au serveur de comprendre le binaire envoyé par les joueurs.
* **`Broadcaster.js`** : Gère l'envoi des messages de masse (ex: dire à tout le monde "le joueur X s'est déplacé ici") et calcule les statistiques de bande passante.
* **`editor-server.js`** : Un mini serveur HTTP indépendant (port 9001). Il sert uniquement lorsque l'éditeur de niveau est utilisé pour intercepter les modifications et écrire les fichiers `.js` de configuration de niveau de manière permanente sur le disque.
