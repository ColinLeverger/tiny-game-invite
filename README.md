# tiny-game-invite

Petit jeu pixel art en HTML et JavaScript, sans dépendance ni build. Il se termine par une
invitation au bar, après la soutenance de thèse de Ketsia, le mardi 1er décembre 2026.

Le jeu marche sur téléphone, en portrait comme en paysage, et sur ordinateur au clavier.

- Le jeu : <https://colinleverger.github.io/tiny-game-invite/>
- Le générateur de liens d'invitation : <https://colinleverger.github.io/tiny-game-invite/lien.html>

## Le jeu

- On guide Ketsia du campus de Beaulieu au centre-ville de Rennes, en évitant voitures, bus et camions.
- Le premier chat (au Thabor) garde un puzzle de partitionnement de graphe.
- Le second chat (au sud de la Vilaine) garde un puzzle d'appariement de graphes, façon Gromov-Wasserstein.
  Il est craintif : en mode difficile, il faut l'approcher « à pas de loup » (Maj, ou bouton B).
- Le rapporteur, devant le bar, pose une question de détection d'anomalie.
- Bonus : la station de vélos du campus donne un vélo, qui débloque un défi de transport optimal.
- Sur téléphone, toucher la carte fait marcher Ketsia vers le doigt ; le pavé doré reste en bas de l'écran.
- Quatre stations de métro, dont Villejean, de l'autre côté de la rocade. On peut caresser les chats qui suivent Ketsia.
- Quête annexe : retrouver les trois encadrant·es de Ketsia quelque part dans Rennes.
- Bruitages 8-bit (coupés par défaut), un pigeon voleur de tapas, une photo souvenir en PNG.
- Trois modes : Normal, Difficile, et un troisième dont on garde la surprise.
- Chaque puzzle a trois boutons : Quitter (ou Échap), Aide (guidage pas à pas) et Valider (après 15 s).
- Il y a aussi un easter egg, que ce README ne dévoile pas.
- À la fin : la carte d'invitation, un fichier agenda (.ics) et un diplôme PDF du score
  (temps, erreurs, indices, difficulté, accidents), à montrer au bar le soir même.

## Lancer en local

```sh
make         # liste des commandes
make run     # http://localhost:8000
make check   # vérification (la même que la CI)
```

Mode dieu, pour tester la fin : en jeu, toucher (ou cliquer) Ketsia 10 fois en moins de 4 secondes.
Tout se débloque et la scène du bar démarre. Le diplôme l'indique (« Mode dieu (développeur) »).

## Publication

Chaque push sur `main` déploie le site sur GitHub Pages (`.github/workflows/deploy.yml`).
À faire une seule fois : Settings → Pages → Source : **GitHub Actions**.

## Envoyer les invitations

Ouvrir `lien.html` sur le site publié. Remplir le bar, l'adresse, l'heure, le nom des deux chats et, au besoin, la
soutenance, des adresses pour manger, un petit mot et une liste de prénoms. La page produit un
lien par invité·e, avec le prénom déjà rempli.

Les adresses voyagent dans le fragment du lien (`#i=…`). Le navigateur n'envoie jamais le
fragment au serveur : les adresses ne sont ni dans le dépôt ni chez GitHub. Toute personne qui
a le lien peut en revanche les lire.
