# v2.0 — Fusion métropole + outre-mer

Document de travail de la branche `v2`. La branche `main` reste la 1.x, qui
continue de recevoir les correctifs.

## Ce que la v2 apporte

1. **La vigilance outre-mer**, aujourd'hui absente : Antilles, Guyane,
   Réunion, Mayotte — et, selon le flux retenu, Saint-Martin / Saint-Barth,
   Saint-Pierre-et-Miquelon, Nouvelle-Calédonie.
2. **Les vignettes en entités `image`** au lieu de `camera` : c'est le type
   que la documentation de Home Assistant recommande pour une image statique.

Les deux sont cassants — d'où la version majeure.

## Le point bloquant : par où arrivent les données ?

Le descriptif technique officiel (`descriptif_technique_vigilance_outre_mer_v5`,
10/04/2025) décrit un **fichier ZIP unique**, mis à jour toutes les minutes, à
`vigilance.meteofrance.com/data/vigilance_OM.zip`, accompagné d'un fichier de
contrôle portant un checksum (on ne retélécharge le ZIP que si le checksum a
changé).

**Ce flux ne répond plus** : le domaine `.com` ne résout pas, et son équivalent
`.fr` répond 403 — l'accès semble désormais réservé aux titulaires d'une
licence de diffusion. La fiche « Vigilance Outre-mer temps réel » de
donneespubliques évoque un accès « via l'API du portail » sans nommer d'API.

**Première tâche, avec un compte connecté** : ouvrir
<https://portail-api.meteofrance.fr/devportal/apis> et vérifier s'il existe une
API outre-mer souscriptible. Trois issues possibles :

* une API REST outre-mer existe → cas idéal, on la traite comme DPVigilance ;
* seule `DonneesPubliquesVigilance` existe et couvre aussi l'outre-mer → à
  vérifier en interrogeant le bulletin avec un domaine `VIGI971` ;
* rien de tel → la v2 se limite à la bascule `image`, et l'outre-mer attend une
  ouverture de Météo France (à documenter comme tel, sans promesse).

Tant que ce point n'est pas tranché, aucun code outre-mer n'est écrit.

## Ce qui change dans le modèle

Le format outre-mer n'est pas celui de la métropole :

| | Métropole (1.x) | Outre-mer |
|---|---|---|
| Domaines | `dd`, `dd10` (littoral) | `VIGI971`, `VIGI972`… découpés en zones (`-01` terre, `-51` et suivants : zones côtières) |
| Phénomènes | 9 | 4 : vent (1), pluie-orages (2), vagues-submersion (9), **cyclone (10)** |
| Couleurs | 4 (vert → rouge) | **7** : + violet (5), gris (6), bleu (0), et `-1` pour vagues-submersion sans objet |
| Échéances | `J`, `J1` | découpage propre au bassin |

Conséquences directes :

* `COLORS` s'étend à sept valeurs — donc l'énumération des capteurs, les
  quatre thèmes de la carte et les traductions d'états.
* `PHENOMENA` accueille le cyclone.
* La notion de « département » devient « domaine », avec des zones à
  l'intérieur : c'est le changement de vocabulaire le plus profond.

Un capteur métropole doit continuer d'exposer exactement ce qu'il expose
aujourd'hui : aucune migration d'entité pour les installations existantes,
hors le renommage `camera.` → `image.`.

## La bascule `camera` → `image`

* `async_camera_image()` → `async_image()`, `_attr_content_type` à `image/png`.
* `maps_updated` du coordinateur alimente `_attr_image_last_updated` — la
  documentation interdit de le modifier depuis `async_image()`, ce que notre
  architecture respecte déjà : l'horodatage est posé au téléchargement.
* `frame_interval` disparaît : il ne compensait que la cadence MJPEG des
  caméras.
* La carte Lovelace doit résoudre `camera.*` **et** `image.*` le temps de la
  transition.
* Les entités `camera.vigilance_*` deviennent `image.vigilance_*` : à
  annoncer clairement dans les notes de version, avec un rappel dans le
  README pour les tableaux de bord qui les référencent en dur.

## Ordre de marche

1. Trancher la question de l'accès aux données (ci-dessus).
2. Basculer les vignettes en entités `image`, carte comprise — indépendant de
   l'outre-mer, donc livrable même si le point 1 échoue.
3. Étendre le modèle : couleurs, phénomènes, domaines et zones.
4. Client et lecture du flux outre-mer.
5. Configuration : choisir un bassin comme on choisit un département.
6. Carte : sept couleurs, zones, et le cyclone.
