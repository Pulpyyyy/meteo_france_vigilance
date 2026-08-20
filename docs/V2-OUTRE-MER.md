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

`warning/dictionary` donne les tables officielles, à reprendre telles quelles
plutôt qu'à recopier à la main :

* **Phénomènes** : 1 Vents Forts · 9 Vagues-submersion · **10 Alerte
  Cyclonique** · 12 Fortes pluies / Orages. Numérotation distincte de la
  métropole : le 12 outre-mer correspond au 2 métropolitain, et le 2
  métropolitain n'existe pas ici.
* **Couleurs** : 1 vert · 2 jaune · 3 orange · 4 rouge, puis l'échelle
  cyclonique propre à l'outre-mer — 6 bleu-gris, 7 blanc, 8 orange, 9 rouge,
  10 violet. La valeur `-1` signale un phénomène sans objet à cet instant.

Les teintes du dictionnaire diffèrent légèrement de celles de la carte
métropole (`#31aa35` contre `#2e9e37` pour le vert) : garder les nôtres pour
la cohérence visuelle, et n'utiliser le dictionnaire que pour les libellés et
la structure.

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
