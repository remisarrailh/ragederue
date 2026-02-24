# Correctif

* Joueur dans la planque n'est pas synchro (il faut que le déplacement des joueurs soit synchro)
* Retirer la limite du coffre
* Image des objets dans le coffre plutôt que texte
* Coffre commun à tous les joueurs
* Tri des objets par type (soin/argent etc...)



# Warp

* Un warp doit redirigé vers un autre warp d'un autre niveau , pas un niveau 
* mécanique à l'air partiellement implémenté mais pas claire (nommé zone\_xxxxxx au lieu du nom donné à la warp+niveau)
* Elle n'a pas l'air de fonctionné





# Compatibilité mobile

* Optimiser version mobile (mal positionner / pas sur tout l'écran)
* Menu end game non géré
* Inventaire ne marche pas sur mobile
* Contrôle trop petit sur mobile



# Planque:

* Gérer les améliorations



# Amélioration de la planque

* Cuisine : Augmente plus rapidement la barre de nourriture quand joueur dans la planque, permet de fabriquer des nourritures à partir d'autres nourritures
* Filtration de l'eau : Augmente plus rapidement l'eau quand joueur dans la planque, permet de créer des bouteilles d'eau
* Coffre : Permet de stocker plus d'objets
* Gym : Permet d'augmenter des compétences
* Atelier : Permet de fabriquer des armes



Les améliorations demandent des objets (vis/clous/tuyaux/etc...) et peuvent avoir 1 à 3 niveau



# Points d'expériences



# Armes

* Batte
* Couteau
* Sabre
* Pistolet
* Fusil mitrailleur



# Ennemis

* Ajouter des nouveaux types d'ennemis
* Ajouter des boss à des positions semi aléatoire (position fixe possible multiples)





# Quêtes

* Des objectifs seront à faire dans le jeu, cela peut être
* Récupérer un objet spéciale
* Récupérer X objets et les ramener à la planque
* Tuer un ennemi spéciale
* Poser un objet dans une zone
* Quêtes avec mini jeu (un joueur doit faire un mini jeu et les autres le défendre



# Jeu

* Les zones de collisions sont incorrectes (trop grande) ajouter une hitbox visible dans l'éditeur de niveau pour checker ça
* Par exemple l'objet ne doit pas avoir une hitbox trop basique, sinon on ne peut pas passer au dessus et au dessous
* Possibilité de revive un joueur qui est à terre
* Possibilité de se soigner entre joueur



# Serveur

* Chaque level à sa génération des loots / ennemis (nombre défini par apport au conteneurs et nombre d'ennemis et type d'ennemis
* Possibilités de paramétrer la fréquence d'apparition des ennemis - quantité par ennemis par niveau

# Editeur de niveau

Editeur de props séparé de l'éditeur de niveau (permet d'ajouter/supprimer)

Ajouter la possibilités d'upload des props (et de les virer de la liste)

Collision actif globale pour les props (pas objets par objets)



# Editeur de Props

Container dans Props (container est maintenant un attribut / type de container change la loot table actif)



# Editeur de loots tables



# Editeur de loots

* Permet d'ajouter/supprimer des loots du jeu
* Impossible de changer le nom d'un item et ces attributs
* Impossible de changer la texture d'un item
* Save dans la loot editor ne ramène pas à l'éditeur de niveau
