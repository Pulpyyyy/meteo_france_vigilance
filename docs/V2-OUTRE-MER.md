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

## Par où arrivent les données : résolu

Le flux documenté par le descriptif technique — un ZIP à
`vigilance.meteofrance.com/data/vigilance_OM.zip`, mis à jour chaque minute —
**ne répond plus** : le domaine `.com` ne résout pas, son équivalent `.fr`
répond 403. Et il n'existe **pas** d'API outre-mer sur le portail public :
`DPVigilance/v1/cartevigilance/encours` répond 401 (elle existe, clé requise),
mais `DPVigilanceOutreMer`, `DPVigilanceOM` et les variantes répondent 404.

En revanche, **l'API qui alimente le site vigilance.meteofrance.fr sert bien
l'outre-mer**, et c'est elle que retiennent les autres intégrations
Home Assistant :

```
https://webservice.meteofrance.com/warning/full?domain=<DOMAINE>&token=<TOKEN>
https://webservice.meteofrance.com/warning/dictionary?domain=<DOMAINE>&token=<TOKEN>
```

Le jeton est celui, public et figé, que le site embarque dans ses pages.

Domaines vérifiés, qui répondent tous : `VIGI971` (Guadeloupe), `VIGI972`
(Martinique), `VIGI973` (Guyane), `VIGI974` (Réunion), `VIGI976` (Mayotte),
`VIGI978-977` (Saint-Martin / Saint-Barthélemy). Ce sont les identifiants du
descriptif technique — un code numérique nu (`974`) est refusé.

**Ce que cela implique, et qui doit être dit à l'utilisateur** : cette API
n'est pas contractuelle. Elle n'est pas documentée par Météo France, son jeton
peut être renouvelé, sa forme peut changer sans préavis — à l'inverse de
DPVigilance, souscrite avec une clé personnelle. La métropole doit donc
continuer de passer par DPVigilance ; l'outre-mer utilise cette voie faute
d'alternative, et le composant doit le signaler clairement (documentation, et
libellé de l'option) plutôt que de laisser croire à un accès officiel.

## Le format réel, relevé sur l'API

Réponse de `warning/full` (relevé sur `VIGI976`) :

```
update_time, end_validity_time, domain_id, color_max,
timelaps[] -> { phenomenon_id, timelaps_items[] { begin_time, end_time, color_id } },
phenomenons_items[] -> { phenomenon_id, phenomenon_max_color_id },
advices, consequences, max_count_items, comments, text, text_avalanche
```

Les horodatages sont des entiers Unix, là où DPVigilance publie des chaînes
ISO 8601 — la conversion est à faire à la lecture.

`warning/dictionary` donne les tables officielles — et le relevé bassin par
bassin révèle le point le plus structurant du chantier : **les tables ne sont
pas les mêmes d'un bassin à l'autre.**

Phénomènes, relevés sur l'API :

| | Antilles (971, 972) | Guyane (973) | Océan Indien (974, 976) |
|---|---|---|---|
| 1 | Vents violents | Vents violents | Vents Forts |
| 2 | Fortes pluies et orages | Fortes pluies et orages | — |
| 9 | Vagues-submersion | Vagues-submersion | Vagues-submersion |
| 10 | Cyclone | *(absent)* | Alerte Cyclonique |
| 12 | — | — | Fortes pluies / Orages |

Les pluies-orages sont donc le **2** aux Antilles et le **12** dans l'océan
Indien ; la Guyane, sans littoral cyclonique exposé de la même façon, n'a pas
de phénomène 10.

Couleurs, mêmes divergences :

* **Antilles / Guyane** : 0 bleu · 1 vert · 2 jaune · 3 orange · 4 rouge ·
  **5 violet** · 6 gris · -1 blanc.
* **Océan Indien** : 1 vert · 2 jaune · 3 orange hachuré · 4 rouge hachuré ·
  6 bleu-gris · 7 jaune · 8 orange · 9 rouge · **10 violet**. Les quatre
  premières valeurs sont la vigilance ordinaire, les suivantes la phase
  cyclonique — d'où le « hachuré », qui signale une alerte doublée d'une
  menace cyclonique.

**Conséquence pour le composant** : une table unique de couleurs et de
phénomènes ne peut pas convenir. Le modèle doit être indexé par bassin, et le
plus sûr est de lire `warning/dictionary` à l'exécution plutôt que de figer
des tables qui divergeront. Nos quatre couleurs métropole restent la référence
visuelle (`#2e9e37` et suivantes) ; les teintes du dictionnaire ne servent
qu'aux niveaux que la métropole ne connaît pas.

## L'état des capteurs : la décision

Ni étendre l'énumération à tous les niveaux outre-mer, ni séparer les capteurs
métropole des capteurs outre-mer. **Les niveaux des bassins sont normalisés
vers les quatre couleurs de la métropole**, et le niveau réel est publié à
côté.

La raison est d'abord technique : la liste `options` d'un capteur d'énumération
est écrite dans le registre d'entités, et l'enregistreur d'historique refuse un
état qui n'y figure pas — l'entité tombe en erreur, pas seulement son
historique. Une énumération qui suivrait les tables lues sur l'API casserait
donc le jour où Météo France y ajoute une valeur. Et l'étendre à tous les
niveaux imaginables réécrirait les capacités de **toutes** les entités, y
compris métropolitaines : l'éditeur d'automatisations proposerait « violet » et
« gris » pour la Creuse.

Elle est ensuite d'usage : `to: "red"` doit valoir pour la Gironde comme pour
la Guadeloupe. C'est la question que l'on pose à un composant de vigilance —
« préviens-moi quand ça passe au rouge, où que ce soit ».

Donc :

* l'état reste `green`, `yellow`, `orange`, `red` partout ;
* `color_native` porte le niveau réel quand il sort de l'échelle
  (`purple`, `grey`, `blue`, `orange_hatched`…), avec `color_name` et
  `color_hex` ;
* `scale` et `basin` disent d'où vient la mesure ;
* **la phase cyclonique devient un capteur à part**, créé seulement là où le
  bassin la connaît — ni en métropole, ni en Guyane. C'est une dimension
  distincte de l'intensité : « orange hachuré » dans l'océan Indien, c'est une
  vigilance orange *et* une menace cyclonique. Son énumération est close et
  écrite en dur : les phases sont un dispositif préfectoral, pas une donnée
  d'API.

Le coût est réel et doit être dit dans la documentation : **violet et gris se
ramènent tous deux à `red`**, donc un passage de violet à gris ne change pas
l'état du capteur principal. Il change `color_native`, et le capteur de phase
cyclonique, lui, bouge.

Vérifié auprès de Météo France avant de figer les tables : aux Antilles, le
violet est « confinez-vous » et le gris « restez prudent » — tous deux
au-dessus du rouge, d'où leur normalisation vers `red`. Le bleu (0) n'existe
pas dans l'échelle publiée : c'est une valeur technique de l'API, ramenée au
vert.

Enfin, un détail qui aurait été un vrai défaut : le seuil d'alerte de la carte
compare aujourd'hui `color_id >= 3`. Dans l'océan Indien, 3 est « orange
hachuré » mais 7 est « jaune » — le seuil numérique aurait mis la carte en
alerte sur les phases basses et au calme sur les hautes. Il doit porter sur la
couleur normalisée.

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

## Le vocabulaire des phénomènes

Les identifiants diffèrent d'un bassin à l'autre, mais la plupart des
phénomènes désignent la même chose qu'en métropole : le vent et les
vagues-submersion gardent donc les mêmes `slug`, quel que soit le numéro que
leur donne le service. Une automatisation écrite pour la métropole continue
d'y retrouver ses petits.

Deux exceptions, qui portent leur propre `slug` :

* **`cyclone`**, que la métropole ne connaît pas ;
* **`rain_thunderstorm`** — « Fortes pluies et orages » outre-mer recouvre à
  lui seul ce que la métropole sépare en `rain` (pluie-inondation) et
  `thunderstorm` (orages). Lui donner `rain` aurait été commode, mais faux :
  quelqu'un qui filtre sur `rain` croirait exclure les orages. Le composant
  suit ici la lettre du descriptif technique plutôt que la commodité.

## Comment nommer ce qui est suivi

Les libellés parlaient de « département », ce qui ne convient pas à la
Guadeloupe. Le vocabulaire retenu est celui de Météo France, relevé sur son
site et dans son descriptif technique : « département » pour la métropole,
« outre-mer » comme regroupement — **il n'existe pas de terme générique
unique** couvrant les deux, le site lui-même n'en emploie aucun.

Les libellés de la carte disent donc « département ou territoire d'outre-mer »
là où les deux sont visés. Le titre reste « Vigilance <nom du domaine> », qui
convient à la Guadeloupe comme au Loiret. Le descriptif technique, lui, parle
de « domaine global » et de « zone de vigilance » — un vocabulaire d'API, trop
abstrait pour un écran.

L'attribut `department` ne bouge pas : c'est le contrat que lisent la carte et
les modèles Jinja hérités du montage d'origine. `domain` et `basin` s'ajoutent
à côté.

## L'image d'un territoire

Météo France publie une vignette par bassin — la silhouette peinte de la
couleur en cours — mais **pour trois territoires seulement** : Martinique,
Guyane et Mayotte répondent, la Guadeloupe, La Réunion et les îles du Nord
non. Un composant qui propose six territoires ne peut pas en illustrer trois.

La carte dessine donc elle-même les six silhouettes, à partir de contours
tracés depuis les données publiques — l'IGN pour les départements,
OpenStreetMap pour Saint-Martin et Saint-Barthélemy — puis simplifiés pour
rester lisibles à la taille d'une icône. Treize kilo-octets pour l'ensemble,
embarqués dans la carte.

Trois avantages sur la vignette officielle, au-delà de la couverture :

* le **violet** et le **gris** sont rendus, alors que les vignettes de Météo
  France s'arrêtent au rouge — elles sont muettes au moment précis où
  l'information compte le plus ;
* le tracé se recolorie et se redimensionne sans perte, là où un PNG carré de
  250 pixels impose une fiche aussi haute que celle de la carte de France ;
* rien ne dépend d'un service qui répond « absent » une fois sur deux.

Saint-Martin et Saint-Barthélemy partagent un domaine de vigilance mais sont
distantes de 82 km : chacune est cadrée dans son coin de la vignette, comme la
carte nationale place la Corse. Les contours d'OpenStreetMap demandent une
précaution — la recherche par nom renvoie les **eaux territoriales**, pas le
littoral ; c'est le contour de type « île » qu'il faut retenir.

## Le format des vignettes

Retour du forum (WarC0zes) : la fiche qui s'ouvre au clic sur une vignette est
beaucoup plus haute que celle d'une caméra ordinaire. La cause n'est pas le
type d'entité mais le **rapport de l'image** : Home Assistant affiche la fiche
à la largeur du dialogue et la hauteur suit le rapport. Une caméra de
surveillance est en 16:9 — large et plate ; notre vignette est carrée, en
500 × 500, donc près de deux fois plus haute à largeur égale.

Deux pistes à essayer en v2, la première étant la plus simple :

* Météo France publie aussi une vignette **1000 × 500** portant les deux
  échéances côte à côte : un rapport 2:1, exactement celui qui donne une fiche
  compacte. Reste à vérifier ce qu'elle contient et si elle se prête à un
  affichage par échéance.
* Sinon, rogner la vignette carrée, qui porte une marge blanche large autour
  de l'Hexagone.

## Ordre de marche

1. Trancher la question de l'accès aux données (ci-dessus).
2. Basculer les vignettes en entités `image`, carte comprise — indépendant de
   l'outre-mer, donc livrable même si le point 1 échoue.
3. Étendre le modèle : couleurs, phénomènes, domaines et zones.
4. Client et lecture du flux outre-mer.
5. Configuration : choisir un bassin comme on choisit un département.
6. Carte : sept couleurs, zones, et le cyclone.
