"""Constantes de Vigilance Météo France.

Tout ce qui décrit la donnée publiée par l'API DPVigilance v1 est ici : les
phénomènes, les couleurs, les départements. Le reste du composant ne fait que
lire ces tables — un identifiant inconnu (Météo France en a déjà ajouté, la
carte est en version V6) retombe donc sur un libellé générique plutôt que de
faire tomber la mise à jour.
"""

from __future__ import annotations

from typing import Any, Final

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

# ── Actions ───────────────────────────────────────────────────────────────────
SERVICE_REFRESH: Final = "refresh"

# ── Version de l'API ──────────────────────────────────────────────────────────
# La version du système de vigilance que ce composant sait lire — celle que
# décrivent les tables PHENOMENA et COLORS ci-dessous. Chaque bulletin annonce
# la sienne (`product.version_vigilance`) : un écart est signalé en journal et
# en réparation plutôt que de passer inaperçu — voir _check_api_version.
SUPPORTED_VIGILANCE_VERSION: Final = "V6"

# Vigilance outre-mer : l'interface du site vigilance.meteofrance.fr, faute
# d'API publiée pour ces territoires. Le jeton est celui que le site publie
# dans ses pages — il n'engage personne et peut être renouvelé sans préavis.
API_OM_BASE: Final = "https://webservice.meteofrance.com"
API_OM_TOKEN: Final = "__Wj7dVSTjV9YGu1guveLyDq0g7S7TfTjaHBTPTpO0kj8__"

# ── Configuration ─────────────────────────────────────────────────────────────
CONF_API_KEY: Final = "api_key"
CONF_DEPARTMENTS: Final = "departments"
CONF_BASINS: Final = "basins"
CONF_SCAN_INTERVAL: Final = "scan_interval"
CONF_MAPS: Final = "maps"

# La carte est réémise à 6 h et 16 h, et corrigée entre-temps en cas
# d'aggravation. Trente minutes suivent ces corrections sans peser sur le quota
# (60 requêtes/minute sur l'offre publique, ici 3 requêtes par cycle au plus).
DEFAULT_SCAN_INTERVAL: Final = 30
MIN_SCAN_INTERVAL: Final = 5
MAX_SCAN_INTERVAL: Final = 720

# Quand le bulletin est périmé, un rafraîchissement de rattrapage est tiré à un
# instant aléatoire de cette fenêtre (secondes). Toutes les installations font
# le même constat à la même heure : le hasard étale leurs appels au lieu de
# faire pilonner l'API par des milliers de clients à la même seconde.
EXPIRED_RETRY_WINDOW: Final = 30 * 60

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

# ── Outre-mer ─────────────────────────────────────────────────────────────────
# La vigilance outre-mer est un service distinct de DPVigilance, avec ses
# propres tables — et elles ne sont pas les mêmes d'un bassin à l'autre : les
# pluies-orages portent le numéro 2 aux Antilles et 12 dans l'océan Indien, et
# le violet est la couleur 5 ici, 10 là-bas. Ce qui suit indexe donc tout par
# échelle, et normalise vers les quatre couleurs de la métropole : l'état d'un
# capteur reste « vert / jaune / orange / rouge » partout, pour qu'une
# automation écrite pour la Gironde vaille aussi pour la Guadeloupe. Le niveau
# réel du bassin, lui, est publié en attribut — voir `color_native`.

SCALE_METROPOLE: Final = "metropole"
SCALE_ANTILLES: Final = "antilles"
SCALE_INDIAN: Final = "indian_ocean"

# Bassins outre-mer, par identifiant de domaine de l'API.
# `page` est l'adresse du bassin sur vigilance.meteofrance.fr, vérifiée une à
# une : le site n'en publie pas pour tous les territoires, et un bassin sans
# page renvoie à l'accueil plutôt que vers un lien mort.
BASINS: Final[dict[str, dict[str, Any]]] = {
    "VIGI971": {"name": "Guadeloupe", "scale": SCALE_ANTILLES, "page": "guadeloupe"},
    "VIGI972": {"name": "Martinique", "scale": SCALE_ANTILLES, "page": "martinique"},
    # La Guyane suit l'échelle antillaise, mais son dictionnaire ne publie pas
    # de phénomène « cyclone » : elle est hors de la zone d'aléa cyclonique.
    "VIGI973": {
        "name": "Guyane",
        "scale": SCALE_ANTILLES,
        "page": "guyane",
        "cyclone": False,
    },
    "VIGI974": {"name": "La Réunion", "scale": SCALE_INDIAN, "page": "la-reunion"},
    "VIGI976": {"name": "Mayotte", "scale": SCALE_INDIAN, "page": "mayotte"},
    # Le site ne publie pas de page pour les îles du Nord.
    "VIGI978-977": {
        "name": "Saint-Martin et Saint-Barthélemy",
        "scale": SCALE_ANTILLES,
        "page": None,
    },
}

# Un phénomène outre-mer retrouve le `slug` de son équivalent métropolitain
# quand il en a un — le vent et les vagues-submersion sont les mêmes partout.
# « Fortes pluies et orages » n'en a pas : il recouvre à lui seul ce que la
# métropole sépare en pluie-inondation et orages. Lui donner `rain` serait
# commode pour les automations, mais faux — un utilisateur qui filtre sur
# `rain` croirait exclure les orages. Il porte donc son propre slug.
PHENOMENA_BY_SCALE: Final[dict[str, dict[int, str]]] = {
    SCALE_ANTILLES: {1: "wind", 2: "rain_thunderstorm", 9: "wave", 10: "cyclone"},
    SCALE_INDIAN: {1: "wind", 12: "rain_thunderstorm", 9: "wave", 10: "cyclone"},
}

# Les phénomènes que l'outre-mer connaît et la métropole non.
OM_PHENOMENA: Final[dict[str, dict[str, str]]] = {
    "cyclone": {
        "slug": "cyclone",
        "name": "Cyclone",
        "icon": "mdi:weather-hurricane",
    },
    "rain_thunderstorm": {
        "slug": "rain_thunderstorm",
        "name": "Fortes pluies et orages",
        "icon": "mdi:weather-lightning-rainy",
    },
}

# Normalisation d'un niveau de bassin vers les quatre couleurs de la
# métropole, et nom du niveau réel quand il n'a pas d'équivalent.
#
# Échelle publiée par Météo France aux Antilles : jaune, orange, rouge, puis
# violet « confinez-vous » et gris « restez prudent », ces deux derniers
# réservés aux cyclones. Le violet et le gris sont donc au-dessus du rouge et
# s'y ramènent : dans les deux cas la consigne est de ne pas sortir.
#
# Le bleu (0) n'appartient pas à l'échelle publique — c'est une valeur
# technique de l'API, comprise comme « pas de vigilance particulière » et
# ramenée au vert.
#
# Dans l'océan Indien, les niveaux 3 et 4 sont « hachurés » : une vigilance
# ordinaire doublée d'une menace cyclonique. Ils valent orange et rouge, la
# menace étant portée par le capteur de phase cyclonique.
COLORS_BY_SCALE: Final[dict[str, dict[int, dict[str, str | None]]]] = {
    SCALE_ANTILLES: {
        # Le descriptif technique est explicite : « 1 : vert ("-1" pour le
        # phénomène vagues-submersion) ». Et en alerte cyclonique orange ou
        # rouge, seuls les vagues-submersion et le cyclone portent un niveau —
        # tous les autres phénomènes valent -1. Ce n'est donc pas « sans
        # objet », c'est « rien à signaler » : le vert.
        -1: {"color": "green", "native": None, "name": "Vert"},
        0: {"color": "green", "native": "blue", "name": "Bleu"},
        1: {"color": "green", "native": None, "name": "Vert"},
        2: {"color": "yellow", "native": None, "name": "Jaune"},
        3: {"color": "orange", "native": None, "name": "Orange"},
        4: {"color": "red", "native": None, "name": "Rouge"},
        5: {"color": "red", "native": "purple", "name": "Violet"},
        6: {"color": "red", "native": "grey", "name": "Gris"},
    },
    SCALE_INDIAN: {
        -1: {"color": "green", "native": None, "name": "Vert"},
        1: {"color": "green", "native": None, "name": "Vert"},
        2: {"color": "yellow", "native": None, "name": "Jaune"},
        3: {"color": "orange", "native": "orange_hatched", "name": "Orange hachuré"},
        4: {"color": "red", "native": "red_hatched", "name": "Rouge hachuré"},
        6: {"color": "green", "native": "blue_grey", "name": "Bleu-gris"},
        7: {"color": "yellow", "native": None, "name": "Jaune"},
        8: {"color": "orange", "native": None, "name": "Orange"},
        9: {"color": "red", "native": None, "name": "Rouge"},
        10: {"color": "red", "native": "purple", "name": "Violet"},
    },
}

# Teintes des niveaux que la métropole ne connaît pas. Les quatre couleurs
# ordinaires gardent celles de COLORS, pour que la carte reste d'un seul ton.
NATIVE_HEX: Final[dict[str, str]] = {
    "blue": "#0093f4",
    "purple": "#903078",
    "grey": "#999999",
    "blue_grey": "#5f8dd3",
    "orange_hatched": "#f28c00",
    "red_hatched": "#e01f1f",
}

# Phase cyclonique, publiée en capteur séparé là où le bassin la connaît.
# C'est un dispositif préfectoral, pas une donnée d'API : l'énumération est
# donc close, et écrite ici une fois pour toutes.
# Chaque niveau cyclonique d'un bassin, et la phase qu'il nomme. Les valeurs
# sont celles de CYCLONE_PHASE_SLUGS, et rien d'autre : la liste des états
# d'un capteur d'énumération est écrite dans le registre de Home Assistant,
# qui refuse ensuite tout état absent de cette liste.
CYCLONE_PHASES: Final[dict[str, dict[int, str]]] = {
    SCALE_ANTILLES: {
        3: "orange",
        4: "red",
        5: "purple",
        6: "grey",
    },
    SCALE_INDIAN: {
        # Les niveaux « hachurés » disent une vigilance doublée d'une menace
        # cyclonique : c'est bien une phase d'alerte, à son niveau.
        3: "orange",
        4: "red",
        6: "grey",  # bleu-gris : la phase de sauvegarde, après le passage
        7: "yellow",
        8: "orange",
        9: "red",
        10: "purple",
    },
}
CYCLONE_PHASE_SLUGS: Final[list[str]] = [
    "none",
    "yellow",
    "orange",
    "red",
    "purple",
    "grey",
]


def basin_has_cyclone(domain_id: str) -> bool:
    """Si le bassin connaît l'alerte cyclonique.

    Tous la connaissent sauf la Guyane, que Météo France n'inclut pas dans le
    dispositif — publier un capteur de phase toujours vide y serait un défaut.
    """
    basin = BASINS.get(domain_id)
    if not basin:
        return False
    return bool(basin.get("cyclone", True)) and basin["scale"] in CYCLONE_PHASES


def basin_scale(domain_id: str) -> str:
    """L'échelle d'un domaine : celle de son bassin, sinon la métropole."""
    basin = BASINS.get(domain_id)
    return basin["scale"] if basin else SCALE_METROPOLE


def scale_color(scale: str, color_id: int | None) -> dict[str, Any] | None:
    """Le niveau d'un bassin, ramené à l'échelle de la métropole.

    Renvoie la couleur normalisée, le nom du niveau réel et sa teinte, ou None
    si l'identifiant est inconnu de l'échelle — auquel cas le capteur passe à
    « inconnu » plutôt que d'inventer une couleur, et une réparation le dit.
    """
    if scale == SCALE_METROPOLE:
        found = COLORS.get(color_id) if color_id else None
        if not found:
            return None
        return {
            "color": found["slug"],
            "color_name": found["name"],
            "color_hex": found["hex"],
            "native": None,
        }

    table = COLORS_BY_SCALE.get(scale, {})
    found = table.get(color_id) if color_id is not None else None
    if not found:
        return None

    native = found["native"]
    normalised = str(found["color"])
    return {
        "color": normalised,
        "color_name": found["name"],
        # La teinte du niveau réel quand il sort de l'échelle métropole, celle
        # de la couleur normalisée sinon.
        "color_hex": NATIVE_HEX.get(str(native)) if native else _hex(normalised),
        "native": native,
    }


def _hex(slug: str) -> str | None:
    """La teinte d'une couleur métropole, par son slug."""
    for entry in COLORS.values():
        if entry["slug"] == slug:
            return entry["hex"]
    return None


def scale_phenomenon(scale: str, phenomenon_id: int) -> dict[str, str]:
    """Un phénomène, quel que soit le bassin, avec le vocabulaire commun."""
    if scale == SCALE_METROPOLE:
        return phenomenon(phenomenon_id)

    slug = PHENOMENA_BY_SCALE.get(scale, {}).get(phenomenon_id)
    if slug in OM_PHENOMENA:
        return OM_PHENOMENA[slug]
    for entry in PHENOMENA.values():
        if entry["slug"] == slug:
            return entry
    return UNKNOWN_PHENOMENON


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
    # Retiré du bulletin par Météo France le 29 juin 2026 ; conservé ici
    # pour nommer les entités des installations qui le suivaient déjà.
    "99": "Andorre",
    # L'outre-mer relève du produit « Vigilance Outre-Mer », distinct de
    # DPVigilance métropole : absent du bulletin lu ici, conservé pour nommer.
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
