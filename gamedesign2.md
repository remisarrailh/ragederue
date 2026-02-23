# Correctif



# Compatibilité

Jouable sur un téléphone / tablette ?

# Planque:

* Ultérieurement il y aurait des améliorations de la planque qui nécessite des objets spécifiques

# Amélioration de la planque

* Cuisine : Augmente plus rapidement la barre de nourriture quand joueur dans la planque, permet de fabriquer des nourritures à partir d'autres nourritures
* Filtration de l'eau : Augmente plus rapidement l'eau quand joueur dans la planque, permet de créer des bouteilles d'eau
* Coffre : Permet de stocker plus d'objets
* Gym : Permet d'augmenter des compétences
* Atelier : Permet de fabriquer des armes



# Points d'expériences

Un système d'expérience permet d'améliorer ces capacités / persistant sur le serveur!

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

* Les zones de collisions sont incorrectes (trop grande) ajouter une hitbox visible dans l'éditeur de niveau pour checker ça
* Un warp doit redirigé vers un autre warp d'un autre niveau , pas un niveau (si on rentre par une porte il faut qu'on puisse ressortir par la même porte



# Serveur

* Chaque level à sa génération des loots / ennemis
* Possibilités de paramétrer la fréquence d'apparition des ennemis - quantité par ennemis
* Au démarrage un joueur doit créer un personnage (quand il relance le jeu, il est automatiquement sélectionné.



# Editeur de niveau

Editeur de props séparé de l'éditeur de niveau (permet d'ajouter/supprimer)

Ajouter la possibilités d'upload des props (et de les virer de la liste)

Collision actif globale pour les props (pas objets par objets)



# Editeur de Props

Container dans Props (container est maintenant un attribut / type de container change la loot table actif)



# Editeur de loots tables

Editeur de loots

* Permet d'ajouter/supprimer des loots du jeu

Impossible de changer le nom d'un item et ces attributs

Impossible de changer la texture d'un item

Save dans la loot editor ne ramène pas à l'éditeur de niveau



