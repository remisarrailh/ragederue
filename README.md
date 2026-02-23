Gemini a dit
Voici un guide complet et illustré pour comprendre l'architecture de RAGEDERUE Online et aider un développeur débutant à y contribuer.

Ce document utilise le format Markdown et des diagrammes Mermaid (supportés nativement par GitHub et la plupart des éditeurs modernes).

📖 Guide de Contribution : RAGEDERUE Online
Bienvenue dans le code de RAGEDERUE Online !
Il s'agit d'un jeu multijoueur de type Beat'em up / Extraction (vous tapez des ennemis, fouillez des conteneurs, remplissez votre inventaire et devez vous extraire avant la fin du temps imparti).

1. Vue d'ensemble de l'Architecture
Le projet est divisé en deux parties principales :

Le Client (Frontend) : Développé en JavaScript pur avec le moteur Phaser 3. Il gère l'affichage, les animations, les collisions locales et les inputs du joueur.

Le Serveur (Backend) : Développé en Node.js avec la librairie ws. Il est autoritaire : c'est lui qui gère l'IA des ennemis, la génération du loot et le timer de la partie.

Les deux communiquent en temps réel via des WebSockets en utilisant un protocole binaire (pour optimiser la bande passante).

Extrait de code
graph TD
    subgraph Client [Client (Navigateur)]
        P3[Moteur Phaser 3]
        UI[Interface Utilisateur]
        ED[Éditeur de Niveau Intégré]
    end

    subgraph Backend [Serveur (Node.js)]
        WS[Serveur WebSocket - Port 9000]
        ROOM[Gestion des Rooms & IA]
        EDS[Serveur Éditeur API - Port 9001]
        DB[(characters.json)]
    end

    P3 <==>|Protocole Binaire (20 Hz)| WS
    WS -->|Sauvegarde Coffre/Persos| DB
    ED == POST /levels ==> EDS
    EDS -.->|Génère| FI[js/config/levels.js]
2. Structure des Dossiers
Voici où trouver les éléments clés du projet :

assets/ : Contient toutes les images (sprites, tilesets), musiques et sons.

js/ : Le code du client (Frontend).

config/ : Les constantes (constants.js), configurations des niveaux (levels.js) et des objets (lootTable.js).

entities/ : Les classes des objets en jeu (Player.js, Enemy.js, Loot.js, Container.js).

network/ : La gestion du réseau côté client (NetworkManager.js, NetProtocol.js).

scenes/ : Les différents écrans du jeu (Menu, Jeu, Inventaire, etc.).

systems/ : La logique découplée (Combats, Gestion de l'inventaire, Fausse 3D/Profondeur).

server/ : Le code du serveur (Backend).

index.js : Le point d'entrée du serveur de jeu.

Room.js : L'instance d'une carte (gère la boucle de jeu serveur, le spawn, etc.).

ServerEnemy.js & WaveSpawner.js : L'Intelligence Artificielle des ennemis.

editor-server.js : Un mini-serveur local utilisé uniquement pour sauvegarder vos modifications faites dans l'éditeur de niveau.

vite.config.js / package.json : Configuration de l'outil de build (Vite).

3. Le cycle de vie du Client (Phaser 3)
Phaser fonctionne avec un système de "Scènes" (Scenes). Voici comment le joueur navigue dans l'application :

Extrait de code
graph LR
    P([PreloadScene]) --> T([TitleScene])
    T -->|Touche Entrée| C([CharacterScene])
    T -->|Touche L| ED([LevelEditorScene])
    T -->|Touche Echap| PA([PauseScene])
    
    C -->|Choix du perso| G([GameScene])
    
    G -->|Touche E| S([SearchScene <br>ou HideoutChestScene])
    G -->|Touche Tab| I([InventoryScene])
    G -->|Touche Echap| PA
    
    G -->|Mort ou Temps écoulé| GO([GameOverScene])
    G -->|Zone d'Extraction| W([WinScene])
À noter : La GameScene est la scène principale. Quand le joueur ouvre l'inventaire (InventoryScene), cette dernière se superpose à la GameScene qui continue de tourner en arrière-plan (le jeu ne se met pas en pause).

4. Comment fonctionne le Multijoueur ?
Pour éviter la triche et synchroniser tout le monde, le jeu utilise un modèle Serveur Autoritaire avec une boucle ("Tick") tournant à 20 images par seconde (20 Hz).

Le Client envoie continuellement (à 20 Hz) sa position, ses actions et ses frappes au serveur (C_PLAYER_STATE, C_HIT_ENEMY).

Le Serveur calcule les dégâts, met à jour les points de vie, déplace les ennemis vers les joueurs, et gère le temps.

Le Serveur renvoie un "Snapshot" (une photo de la situation) à tous les clients (S_ROOM_SNAPSHOT, S_ENEMY_SNAPSHOT).

Le Client reçoit le snapshot et fait glisser doucement (interpolation) les autres joueurs (RemotePlayer) et les ennemis (RemoteEnemy) vers leur nouvelle position pour que l'affichage soit fluide.

Extrait de code
sequenceDiagram
    participant C as Client (Joueur 1)
    participant S as Serveur (Room)
    participant C2 as Client (Joueur 2)

    C->>S: C_PLAYER_STATE (x:10, y:20)
    C->>S: C_HIT_ENEMY (netId: 5, dégâts: 15)
    
    Note over S: Tick (Toutes les 50ms)
    S->>S: Met à jour IA Ennemi 5 (Perd 15 HP)
    S->>S: Génère le loot si Ennemi 5 meurt
    
    S->>C: S_ENEMY_SNAPSHOT + S_ROOM_SNAPSHOT
    S->>C2: S_ENEMY_SNAPSHOT + S_ROOM_SNAPSHOT
    
    Note over C2: Met à jour la position du Joueur 1
5. Comment contribuer ? (Tutoriels pratiques)
Voici quelques exemples classiques de ce que vous pourriez vouloir ajouter.

5.1 Ajouter un nouvel objet lootable (ex: Un Medkit)
Le jeu possède un système de données centralisé pour les loots dans js/config/lootTable.js.

Ajouter l'image : * Mettez l'image de votre medkit dans assets/Sprites/medkit.png.

Dans js/scenes/PreloadScene.js, ajoutez : this.load.image('medkit', SP + 'medkit.png');

Déclarer l'objet :

Ouvrez js/config/lootTable.js.

Ajoutez votre objet dans ITEM_DEFS :

JavaScript
medkit: {
  texture:     'medkit',
  invW: 2, invH: 2,           // Taille dans l'inventaire (ex: 2x2 cases)
  useTime:     3000,          // Temps d'utilisation (3 secondes)
  healAmount:  50,            // Soigne 50 HP
  value:       10,            // Vaut 10 ETH
  displayW: 32, displayH: 32,
  glowColor:   0xff0000,      // Halo rouge au sol
  description: 'Medkit — Soigne 50 HP',
}
L'ajouter aux tables de drop :

Toujours dans lootTable.js, ajoutez-le dans CONTAINER_LOOT_TABLE ou CORPSE_LOOT_TABLE en lui donnant un poids ("weight") pour définir sa rareté.

5.2 Utiliser l'éditeur de niveau intégré
RAGEDERUE inclut un éditeur de niveau développé directement dans le jeu. Vous n'avez pas besoin de logiciel externe pour construire la carte !

Lancez le jeu via la commande npm start (cela lance le client, le serveur de jeu ET le serveur de l'éditeur).

Sur l'écran titre, appuyez sur la touche L.

Vous êtes dans le Level Editor (LevelEditorScene).

Contrôles de l'éditeur :

A/D (ou Q/D) pour faire défiler la caméra.

Molette pour zoomer/dézoomer.

Cliquez sur les objets de la palette de gauche pour les placer (voitures, tonneaux, zones de téléportation).

Drag & Drop pour déplacer un objet.

Cliquez sur l'onglet [LOOT ED.] pour modifier visuellement la base de données des objets (Loot Table).

Appuyez sur [ SAVE ] en haut : le serveur local (port 9001) va automatiquement générer et réécrire le fichier js/config/levels/level_XX.js.

5.3 Ajouter une nouvelle fonctionnalité au Serveur
Si vous devez ajouter une interaction complexe (ex: ouvrir une porte avec une clé), vous devrez modifier le protocole réseau.

Déclarer le message : Dans js/network/NetProtocol.js (client) ET server/Protocol.js (serveur), ajoutez un identifiant :

JavaScript
export const C_OPEN_DOOR = 0x14; // Client vers Serveur
Côté Client : Dans NetworkManager.js, créez une fonction pour envoyer ce message via WebSocket (this.ws.send(...)).

Côté Serveur : Dans server/index.js, interceptez ce type de message dans la fonction ws.on('message', ...) et appliquez la logique (vérifier si le joueur a la clé, puis envoyer un message à tous les joueurs pour dire que la porte est ouverte).

6. Outils de Débogage
Serveur Monitor : Ouvrez server.html dans votre navigateur. C'est un tableau de bord qui interroge l'API http://localhost:9000/stats et vous permet de voir en temps réel les performances du serveur (RAM, ms par tick, nombre d'ennemis, positions des joueurs).

Hitboxes visuelles : Dans js/config/constants.js, passez export const DEBUG_HITBOXES = true; pour afficher les rectangles de collision (coups de poings, blessures) dans le client.
