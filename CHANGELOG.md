# Changelog

## 1.1.1 — 2026-08-20

### Corrections

- **Pulpyyyy crédité comme développeur** de l'intégration (un identifiant
  personnel apparaissait à la place).
- **Andorre retiré de la liste des départements proposés** : Météo France ne
  le publie plus depuis le 29 juin 2026. Le code `99` reste saisissable à la
  main si l'API le réintroduit un jour, et les installations qui le suivaient
  gardent leurs entités.
- **L'outre-mer retiré de la liste également** (971 à 976) : la vigilance des
  DROM est publiée par un service Météo France distinct, que cette intégration
  n'interroge pas — les choisir ne pouvait qu'aboutir à une erreur à la
  configuration.

### Améliorations

- **La hauteur de la carte se règle enfin** dans les tableaux de bord en
  sections : la poignée de redimensionnement verticale fonctionne, comme sur
  les cartes d'origine.
- **Nouvelle option « Largeur maxi de la carte »** (`map_width`) pour réduire
  la vignette France — et avec elle la hauteur totale de la carte.

## 1.1.0 — 2026-08-18

### Nouveautés

- **Un logo** : le profil de la France aux quatre couleurs de la vigilance.
  Il apparaît dans Home Assistant (à partir de la version 2026.3) et en tête
  de la documentation.
- **Action « Rafraîchir »** : forcez une mise à jour immédiate du bulletin —
  depuis une automatisation ou **Outils de développement → Actions** — sans
  attendre le prochain cycle. Utile après une coupure réseau, ou avant une
  notification qui doit partir avec des données fraîches.
- **Le bulletin périmé se rattrape tout seul** : quand le bulletin affiché
  dépasse sa période de validité, l'intégration va chercher le nouveau dans la
  demi-heure qui suit — à un instant tiré au hasard, pour que des milliers
  d'installations ne sollicitent pas Météo France à la même seconde. Le badge
  « Bulletin périmé » disparaît sans intervention.
- **Changement de clé d'API à tout moment** : le bouton **Reconfigurer** de
  l'intégration permet de saisir une nouvelle clé — par exemple avant qu'elle
  n'expire. Elle est vérifiée auprès de Météo France avant d'être enregistrée,
  et vos départements, entités et historiques restent en place.
- **Prévenu si Météo France fait évoluer son service** : si une version, un
  phénomène ou un niveau inconnus apparaissent dans les données, une alerte
  s'affiche dans **Paramètres → Réparations** pour vous inviter à vérifier
  qu'une mise à jour de l'intégration existe. En attendant, tout continue de
  fonctionner.

### Améliorations

- Mises à jour plus légères pour votre machine — sensible sur Raspberry Pi —
  et cartes de France téléchargées plus rapidement.
- À la configuration, la vérification de la clé répond en quelques secondes,
  même quand Météo France est injoignable — plus d'attente d'une minute devant
  le formulaire.
- Sécurité renforcée pour l'action « URL » de la carte : la page externe
  ouverte n'a plus aucun accès à votre tableau de bord.

## 1.0.0 — 2026-08-17

Première publication.

- Configuration entièrement graphique : clé d'API, départements, cartes
  nationales, intervalle de mise à jour.
- Deux capteurs par département (aujourd'hui / demain) : la couleur de
  vigilance en état, les phénomènes et leurs créneaux horaires en attributs,
  et un signal quand le bulletin affiché n'est plus valide.
- Deux caméras pour les cartes de France du jour et du lendemain, gardées en
  mémoire — rien n'est écrit sur le disque.
- Carte Lovelace incluse et installée automatiquement : 4 dispositions,
  4 thèmes, éditeur visuel, thème sombre, français et anglais.
