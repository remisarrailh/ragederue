# Correctif

##### 

Les zones de collisions sont incorrectes (trop grande) ajouter une hitbox visible dans l'éditeur de niveau pour checker ça

Resize des props consistant (pas lié au niveau mais à l'objet)

Ajouter la possibilités d'upload des props (et de les virer de la liste)

Editeur de props séparé de l'éditeur de niveau (permet d'ajouter/supprimer)

Collision actif globale pour les props (par objets par objets)

Container dans Props (container est maintenant un attribut / type de container change la loot table actif)

# 

# Planque:

* Planque Niveau Spécial : La planque, ce niveau permet de stocker ces objets dans un coffre de manière persistante (le timer n'efface pas les objets dans la planque)
* Ultérieurement il y aurait des améliorations de la planque qui nécessite des objets spécifiques
* La planque est accessible au même endroit pour chaque joueur et commune (jeu coop)
* Il n'y a pas d'ennemis ni de loots dans la planque
* La nourriture /eau / vie se régénère automatiquement quand le joueur est dans la planque



# Amélioration de la planque

* Cuisine : Augmente plus rapidement la barre de nourriture quand joueur dans la planque, permet de fabriquer des nourritures à partir d'autres nourritures
* Filtration de l'eau : Augmente plus rapidement l'eau quand joueur dans la planque, permet de créer des bouteilles d'eau
* Coffre : Permet de stocker plus d'objets
* Gym : Permet d'augmenter des compétences
* Atelier : Permet de fabriquer des armes



# Points d'expériences

Un système d'expérience permet d'améliorer ces capacités

Donner des coups de points : + de points d'endurance / + dégats poings

Donner des coups de pieds : + de points d'endurance / + de dégats pieds

Sauter / Se déplacer : Bonus vitesse / Bonus endurance

Looter : Vitesse de loots

Se soigner : Bonus soin





# Armes

* Batte
* Couteau
* Sabre
* Pistolet
* Fusil mitrailleur





# Quêtes

* Des objectifs seront à faire dans le jeu, cela peut être
* Récupérer un objet spéciale
* Récupérer X objets et les ramener à la planque
* Tuer un ennemi spéciale
* Poser un objet dans une zone



# Jeu



## Survie

* Les joueurs spawn dans leur planque au démarrage du jeu.

# Serveur

* Chaque level à sa génération des loots / ennemis
* Possibilités de paramétrer la fréquence d'apparition des ennemis - quantité par ennemis
* Au démarrage un joueur doit créer un personnage (quand il relance le jeu, il est automatiquement sélectionné.



# Personnage

Un joueur au niveau du serveur à:

* Un nom
* Un inventaire qu'il garde même s'il quitte le jeu (inventaire perdu s'il meurt, son corps reste
  avec le loot qu'il avait, il peut soit le récupérer soit un autre joueur peut le récupérer), c'est reset avec le timer du niveau



# Editeur de niveau

* Ajouter l'accès à un editeur de props depuis l'éditeur de niveau





# Editeur de loots tables

* Selon le containeurs choisir le % de chances qu'un loot apparaissent

Editeur de loots

* Permet d'ajouter/supprimer des loots du jeu
* Taille du loot (dans l'inventaire)
* Effets du loots (pour le moment vie ou argent)
