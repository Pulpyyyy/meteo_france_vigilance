# Regénérer les captures d'écran

Note de maintenance — volontairement absente du README.

[`screenshot-harness.html`](screenshot-harness.html) charge la **vraie carte**
du composant (`custom_components/.../frontend/meteo-france-vigilance-card.js`)
avec un `hass` factice et un bulletin d'exemple, puis Chrome headless
photographie chaque page :

```bash
chrome --headless=new --disable-gpu --allow-file-access-from-files \
  --hide-scrollbars --force-device-scale-factor=2 --window-size=540,530 \
  --screenshot=hero-light.png "screenshot-harness.html?page=hero&mode=light"
```

| Page | Contenu | Taille fenêtre |
|---|---|---|
| `hero` | duo/officiel, orange + rouge | 540,530 |
| `levels` | 4 cartes, une par couleur | 720,1180 |
| `themes` | les 4 thèmes, sans vignette | 760,590 |
| `layout-duo` | disposition duo | 470,525 |
| `layout-focus` | disposition focus | 470,680 |
| `layout-compact` | disposition compact | 470,200 |
| `layout-chrono` | disposition chronologie | 470,600 |
| `outre-mer` | les six territoires, un état chacun | 980,1120 |
| `outre-mer-compact` | les six territoires empilés en compact | 470,600 |
| `outre-mer-chrono` | chronologie d'une alerte cyclonique | 470,330 |

Chaque page existe en `mode=light` et `mode=dark`. Les fichiers vont dans
`images/` sous le nom `<page>-<mode>.png`.

Les tailles de fenêtre sont à vérifier après chaque changement de page : une
fenêtre trop courte coupe la dernière carte sans que rien ne le signale.

`?width=auto` laisse la scène et les cartes prendre la largeur de la fenêtre,
au lieu des largeurs fixes que veulent les captures. C'est le seul moyen
d'éprouver le comportement de la carte dans une colonne étroite — un panneau
latéral, un téléphone en portrait :

```bash
chrome --headless=new --window-size=250,600   --screenshot=etroit.png   "file:///…/screenshot-harness.html?page=outre-mer-compact&mode=light&width=auto"
```

Chrome veut des chemins **absolus** : une sortie relative échoue sans que la
commande le dise clairement, et l'adresse du harnais doit être une URL
`file:///` complète, faute de quoi elle est prise pour un nom de domaine.

Les pages d'outre-mer n'ont pas de vignette : la carte y dessine la silhouette
du territoire, à partir des contours embarqués dans le composant. Elles
servent donc aussi à vérifier ce que la métropole ne montre jamais — le
violet, le gris, et la chronologie d'une alerte cyclonique.

Les vignettes factices utilisent les **contours réels** des départements
([france-geojson](https://github.com/gregoiredavid/france-geojson),
`departements-version-simplifiee.geojson`), convertis en tracés SVG 500 × 500
par [`convert.py`](convert.py) → [`france-depts.js`](france-depts.js). Style
calé sur la vraie vignette : zones de couleur sans frontières visibles (chaque
département est liseré de sa propre couleur pour sceller les coutures
d'anti-aliasing), encart « Paris - Petite couronne » avec la vraie forme de la
petite couronne, encre noire seulement pour le libellé et le cadre — c'est elle
que la carte ré-encre en blanc en thème sombre.
