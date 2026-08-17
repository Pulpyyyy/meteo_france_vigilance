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

Chaque page existe en `mode=light` et `mode=dark`. Les fichiers vont dans
`images/` sous le nom `<page>-<mode>.png`.

Les vignettes factices utilisent les **contours réels** des départements
([france-geojson](https://github.com/gregoiredavid/france-geojson),
`departements-version-simplifiee.geojson`), convertis en tracés SVG 500 × 500
par [`convert.py`](convert.py) → [`france-depts.js`](france-depts.js). Style
calé sur la vraie vignette : zones de couleur sans frontières visibles (chaque
département est liseré de sa propre couleur pour sceller les coutures
d'anti-aliasing), encart « Paris - Petite couronne » avec la vraie forme de la
petite couronne, encre noire seulement pour le libellé et le cadre — c'est elle
que la carte ré-encre en blanc en thème sombre.
