"""Constantes de Vigilance Météo France.

Tout ce qui décrit la donnée publiée par l'API DPVigilance v1 est ici : les
phénomènes, les couleurs, les départements. Le reste du composant ne fait que
lire ces tables — un identifiant inconnu (Météo France en a déjà ajouté, la
carte est en version V6) retombe donc sur un libellé générique plutôt que de
faire tomber la mise à jour.
"""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "meteo_france_vigilance"

# Version repli si le manifeste n'est pas lisible ; sert de `?v=` à la carte.
FALLBACK_VERSION: Final = "0.0.0"

# ── API ───────────────────────────────────────────────────────────────────────
API_BASE: Final = "https://public-api.meteofrance.fr/public/DPVigilance/v1"
API_BULLETIN: Final = f"{API_BASE}/cartevigilance/encours"
# Les vignettes nationales : J = aujourd'hui, J1 = demain. Ce sont des PNG,
# renvoyés tels quels par l'API — aucun encodage intermédiaire n'est nécessaire.
API_MAP: Final = {
    "today": f"{API_BASE}/vignettenationale-J/encours",
    "tomorrow": f"{API_BASE}/vignettenationale-J1/encours",
}
# L'API répond régulièrement 502 / 200-vide quelques secondes après une bascule
# de bulletin. C'est ce que la boucle `while true` du capteur command_line
# contournait à la main ; c'est ici que ça se traite désormais.
API_RETRIES: Final = 4
API_RETRY_DELAY: Final = 2.0
API_TIMEOUT: Final = 30
# Une vignette valide pèse ~55 ko. En deçà, la réponse est une page d'erreur ou
# un PNG tronqué : on la jette et on retente, plutôt que d'afficher une image
# cassée sur le tableau de bord.
MAP_MIN_BYTES: Final = 5000

# ── Configuration ─────────────────────────────────────────────────────────────
CONF_API_KEY: Final = "api_key"
CONF_DEPARTMENTS: Final = "departments"
CONF_SCAN_INTERVAL: Final = "scan_interval"
CONF_MAPS: Final = "maps"

# La carte est réémise à 6 h et 16 h, et corrigée entre-temps en cas
# d'aggravation. Trente minutes suivent ces corrections sans peser sur le quota
# (60 requêtes/minute sur l'offre publique, ici 3 requêtes par cycle au plus).
DEFAULT_SCAN_INTERVAL: Final = 30
MIN_SCAN_INTERVAL: Final = 5
MAX_SCAN_INTERVAL: Final = 720

# ── Frontend ──────────────────────────────────────────────────────────────────
# La carte voyage avec le composant : une installation HACS ne copie que
# `custom_components/meteo_france_vigilance/`, donc rien à déposer dans `www/`
# ni de ressource Lovelace à ajouter à la main.
URL_BASE: Final = "/meteo_france_vigilance_frontend"
CARD_FILENAME: Final = "meteo-france-vigilance-card.js"
JSMODULES: Final[list[dict[str, str]]] = [
    {"name": "Vigilance Météo France Card", "filename": CARD_FILENAME},
]

# ── Périodes ──────────────────────────────────────────────────────────────────
# Clé interne → `echeance` de l'API. L'ordre compte : c'est celui des entités
# créées et celui des colonnes de la carte.
PERIODS: Final[dict[str, str]] = {"today": "J", "tomorrow": "J1"}

# ── Phénomènes ────────────────────────────────────────────────────────────────
# Identifiants de la vigilance V6. `slug` est stable et destiné aux automations
# et à la carte ; `name` est le libellé Météo France, affiché tel quel.
PHENOMENA: Final[dict[int, dict[str, str]]] = {
    1: {"slug": "wind", "name": "Vent violent", "icon": "mdi:weather-windy"},
    2: {"slug": "rain", "name": "Pluie-inondation", "icon": "mdi:weather-pouring"},
    3: {"slug": "thunderstorm", "name": "Orages", "icon": "mdi:weather-lightning"},
    4: {"slug": "flood", "name": "Crues", "icon": "mdi:home-flood"},
    5: {"slug": "snow", "name": "Neige-verglas", "icon": "mdi:snowflake-alert"},
    6: {"slug": "heat", "name": "Canicule", "icon": "mdi:sun-thermometer"},
    7: {"slug": "cold", "name": "Grand froid", "icon": "mdi:snowflake-thermometer"},
    8: {"slug": "avalanche", "name": "Avalanches", "icon": "mdi:image-filter-hdr"},
    9: {"slug": "wave", "name": "Vagues-submersion", "icon": "mdi:waves-arrow-up"},
}
UNKNOWN_PHENOMENON: Final[dict[str, str]] = {
    "slug": "unknown",
    "name": "Phénomène inconnu",
    "icon": "mdi:alert-circle-outline",
}

# ── Couleurs ──────────────────────────────────────────────────────────────────
# `slug` sert d'état au capteur : c'est une énumération traduite par Home
# Assistant, là où le `color_id` numérique restait un chiffre à interpréter.
COLORS: Final[dict[int, dict[str, str]]] = {
    1: {"slug": "green", "name": "Vert", "hex": "#2e9e37"},
    2: {"slug": "yellow", "name": "Jaune", "hex": "#f2d600"},
    3: {"slug": "orange", "name": "Orange", "hex": "#f28c00"},
    4: {"slug": "red", "name": "Rouge", "hex": "#e01f1f"},
}
COLOR_SLUGS: Final[list[str]] = [COLORS[i]["slug"] for i in sorted(COLORS)]

# ── Domaines ──────────────────────────────────────────────────────────────────
# Les `domain_id` de l'API : les départements, plus « FRA » pour le national et
# les zones littorales, codées « département + 10 » (3010 = littoral du Gard).
# Un code absent de cette table reste affichable — voir `department_name`.
DEPARTMENTS: Final[dict[str, str]] = {
    "01": "Ain",
    "02": "Aisne",
    "03": "Allier",
    "04": "Alpes-de-Haute-Provence",
    "05": "Hautes-Alpes",
    "06": "Alpes-Maritimes",
    "07": "Ardèche",
    "08": "Ardennes",
    "09": "Ariège",
    "10": "Aube",
    "11": "Aude",
    "12": "Aveyron",
    "13": "Bouches-du-Rhône",
    "14": "Calvados",
    "15": "Cantal",
    "16": "Charente",
    "17": "Charente-Maritime",
    "18": "Cher",
    "19": "Corrèze",
    "21": "Côte-d'Or",
    "22": "Côtes-d'Armor",
    "23": "Creuse",
    "24": "Dordogne",
    "25": "Doubs",
    "26": "Drôme",
    "27": "Eure",
    "28": "Eure-et-Loir",
    "29": "Finistère",
    "2A": "Corse-du-Sud",
    "2B": "Haute-Corse",
    "30": "Gard",
    "31": "Haute-Garonne",
    "32": "Gers",
    "33": "Gironde",
    "34": "Hérault",
    "35": "Ille-et-Vilaine",
    "36": "Indre",
    "37": "Indre-et-Loire",
    "38": "Isère",
    "39": "Jura",
    "40": "Landes",
    "41": "Loir-et-Cher",
    "42": "Loire",
    "43": "Haute-Loire",
    "44": "Loire-Atlantique",
    "45": "Loiret",
    "46": "Lot",
    "47": "Lot-et-Garonne",
    "48": "Lozère",
    "49": "Maine-et-Loire",
    "50": "Manche",
    "51": "Marne",
    "52": "Haute-Marne",
    "53": "Mayenne",
    "54": "Meurthe-et-Moselle",
    "55": "Meuse",
    "56": "Morbihan",
    "57": "Moselle",
    "58": "Nièvre",
    "59": "Nord",
    "60": "Oise",
    "61": "Orne",
    "62": "Pas-de-Calais",
    "63": "Puy-de-Dôme",
    "64": "Pyrénées-Atlantiques",
    "65": "Hautes-Pyrénées",
    "66": "Pyrénées-Orientales",
    "67": "Bas-Rhin",
    "68": "Haut-Rhin",
    "69": "Rhône",
    "70": "Haute-Saône",
    "71": "Saône-et-Loire",
    "72": "Sarthe",
    "73": "Savoie",
    "74": "Haute-Savoie",
    "75": "Paris",
    "76": "Seine-Maritime",
    "77": "Seine-et-Marne",
    "78": "Yvelines",
    "79": "Deux-Sèvres",
    "80": "Somme",
    "81": "Tarn",
    "82": "Tarn-et-Garonne",
    "83": "Var",
    "84": "Vaucluse",
    "85": "Vendée",
    "86": "Vienne",
    "87": "Haute-Vienne",
    "88": "Vosges",
    "89": "Yonne",
    "90": "Territoire de Belfort",
    "91": "Essonne",
    "92": "Hauts-de-Seine",
    "93": "Seine-Saint-Denis",
    "94": "Val-de-Marne",
    "95": "Val-d'Oise",
    "99": "Andorre",
    "971": "Guadeloupe",
    "972": "Martinique",
    "973": "Guyane",
    "974": "La Réunion",
    "975": "Saint-Pierre-et-Miquelon",
    "976": "Mayotte",
    "FRA": "France",
}


def department_name(code: str) -> str:
    """Nom lisible d'un `domain_id`, y compris ceux qui ne sont pas listés.

    Les zones littorales ne sont nommées nulle part dans l'API : leur code est
    celui du département suivi de « 10 ». Les reconstruire ici évite d'écrire
    quarante entrées de plus, et un code réellement inconnu revient tel quel
    plutôt que de laisser une entité sans nom.
    """
    if code in DEPARTMENTS:
        return DEPARTMENTS[code]
    if len(code) == 4 and code.endswith("10") and code[:2] in DEPARTMENTS:
        return f"Littoral {DEPARTMENTS[code[:2]]}"
    return code


def phenomenon(phenomenon_id: int) -> dict[str, str]:
    """Description d'un phénomène, jamais absente."""
    return PHENOMENA.get(phenomenon_id, UNKNOWN_PHENOMENON)


def color(color_id: int | None) -> dict[str, str] | None:
    """Description d'une couleur, ou None si l'identifiant n'en est pas une."""
    return COLORS.get(color_id) if color_id else None
