/*!
 * meteo-france-vigilance-card — la vigilance d'un département ou d'un
 * territoire d'outre-mer, aujourd'hui et demain : la carte, la couleur du
 * domaine suivi, et les phénomènes qui la justifient.
 *
 * Remplace l'empilement qui rendait ce même écran : deux `picture-entity` avec
 * leur condition de visibilité, un `auto-entities` piloté par un modèle Jinja
 * de vingt lignes, et autant de `mushroom-template-card` que de phénomènes —
 * soit trois cartes personnalisées à installer, et des tables de noms, d'icônes
 * et de couleurs recopiées dans le tableau de bord.
 *
 * Ici, rien de tout cela n'est dans la configuration : les noms, les icônes et
 * les couleurs viennent des attributs du capteur, où le composant les a déjà
 * mis. La carte ne reçoit qu'une entité, et retrouve seule les trois autres —
 * le capteur de demain et les deux vignettes — par l'identifiant d'entrée que
 * chacune porte en attribut.
 *
 * DEUX AXES DE PRÉSENTATION, indépendants l'un de l'autre :
 *
 *   `layout` — ce qui occupe la place :
 *      duo          les deux jours à égalité, chacun sa vignette
 *      focus        aujourd'hui en grand, demain sur une ligne
 *      compact      une ligne, pas de vignette
 *      chronologie  une barre de 24 h par phénomène, sans vignette
 *
 *   `theme` — la force avec laquelle la couleur de vigilance s'impose :
 *      officiel  chaque puce porte sa couleur, très atténuée
 *      bandeau   une seule couleur, sur la tranche
 *      plein     la carte prend la couleur de l'alerte, à partir de l'orange
 *      sobre     aucun aplat : anneau, soulignement, icône teintée
 *
 * Les seize combinaisons se choisissent en vignettes dans l'éditeur graphique,
 * en bas de ce fichier.
 *
 * Livrée par le composant lui-même, qui la sert à
 * /meteo_france_vigilance_frontend/meteo-france-vigilance-card.js et
 * l'enregistre dans les ressources Lovelace : rien à copier dans www/. Elle est
 * donc autonome — aucune dépendance à mushroom, auto-entities ou card-mod.
 */

const CARD_NAME = "meteo-france-vigilance-card";
const EDITOR_NAME = "meteo-france-vigilance-card-editor";
const INTEGRATION = "meteo_france_vigilance";
const PERIODS = ["today", "tomorrow"];

const LAYOUTS = ["duo", "focus", "compact", "chronologie"];
const THEMES = ["officiel", "bandeau", "plein", "sobre"];

// À partir de l'orange, la vigilance demande une action. C'est le seuil du
// thème « plein » et de l'option `alert_only`.
//
// Le seuil porte sur la COULEUR, jamais sur son identifiant : outre-mer, les
// échelles diffèrent d'un bassin à l'autre — « 3 » y est un orange cyclonique
// et « 7 » un jaune. Le composant normalise tout vers ces quatre couleurs.
const ALERT_COLORS = ["orange", "red"];
const alerted = (state) => ALERT_COLORS.includes(state);

// Les couleurs officielles de la vigilance. Elles ne suivent pas le thème :
// une vigilance orange est orange, c'est la convention que tout le monde lit.
const LEVELS = {
  green: { color: "#2e9e37", fr: "Vert", en: "Green" },
  yellow: { color: "#f2d600", fr: "Jaune", en: "Yellow" },
  orange: { color: "#f28c00", fr: "Orange", en: "Orange" },
  red: { color: "#e01f1f", fr: "Rouge", en: "Red" },
};

const DEFAULTS = {
  layout: "duo",
  theme: "officiel",
  periods: "both",
  show_map: true,
  show_phenomena: true,
  show_comment: false,
  hide_green: false,
  alert_only: false,
  hide_map_inset: false,
  // Le comportement d'avant, mais dit à voix haute et donc remplaçable : un
  // clic ouvre la fiche de ce qu'on a cliqué — le capteur sur le bloc du jour,
  // la caméra sur la vignette. C'est ce que « more-info » sans `entity` fait.
  tap_action: { action: "more-info" },
  hold_action: { action: "more-info" },
  double_tap_action: { action: "none" },
};

const ACTION_KEYS = {
  tap: "tap_action",
  hold: "hold_action",
  double: "double_tap_action",
};

/* Combien de temps le doigt doit rester posé pour que ce soit un appui long,
 * et combien de temps on attend un second clic avant de conclure au simple.
 * Les valeurs du frontend de Home Assistant, pour que la carte réagisse comme
 * les autres. */
const HOLD_MS = 500;
const DOUBLE_MS = 250;

/** Ce que la carte sait exécuter, et donc ce que l'éditeur propose. */
const ACTIONS = ["more-info", "toggle", "navigate", "url", "perform-action", "none"];

/* Le seul libellé de l'encart « Paris - Petite couronne », pas l'encart.
 *
 * Mesuré sur la vignette nationale, qui fait 500 × 500 et place toujours les
 * mêmes choses aux mêmes endroits :
 *
 *   libellé            x 17,4 % → 49,0 %   y  5,4 % →  7,6 %
 *   bord du cadre                          y  8,6 %
 *   département dedans                     y  9,6 % → 19,2 %
 *   France, hors encart                    y 13,2 % et plus bas
 *
 * D'où une bande qui déborde le texte de quelques dixièmes de part et
 * d'autre, et s'arrête un point avant le cadre : le département reste au
 * milieu de son cadre, et rien de la France n'est rogné.
 *
 * En pourcentage et non en pixels, parce que la carte redimensionne la
 * vignette. Réglable sans toucher au code par les variables CSS que la règle
 * plus bas nomme en premier. */
const INSET_BOX = { left: "15%", top: "4%", width: "36%", height: "4.4%" };

/* Les contours des territoires d'outre-mer, tracés depuis les données
 * publiques (IGN pour les départements, OpenStreetMap pour les îles du Nord)
 * et simplifiés pour rester lisibles à la taille d'une icône.
 *
 * Ils sont ici parce que Météo France ne publie de vignette que pour trois
 * bassins sur six : la dessiner nous-mêmes est le seul moyen de traiter les
 * six pareil — et de rendre le violet et le gris, que ses vignettes ne
 * peignent jamais.
 *
 * Saint-Martin et Saint-Barthélemy partagent un domaine mais sont distantes
 * de 82 km : chacune est cadrée dans son coin, comme la vignette nationale
 * place la Corse. */
const OM_SHAPES = {
  "VIGI971":
    "M4.4 39.2L4 38.6L4.8 37.9L4.8 35.4L5.6 34.8L4.9 33.9L6.3 33.1L6.4 31.5L7.5 30.7L7.6 29.9L10.5 29.4L11.2 28.5L13.3 29.4L14.4 31.3L16.6 31.6L17.5 32.8L18.3 32.4L19.1 33.5L21.4 33.2L22.4 33.7L22.1 34.6L24 35.4L26.6 35.2L25.3 37.5L24.6 37.5L25 37L24.6 36.4L24.8 37L23.9 37.8L24.2 38.4L25.5 37.9L25.4 39.2L26.2 39L27 37.6L27.1 39.4L28.6 39L29.4 37.3L30.1 37.7L30.7 37.1L31.7 37.3L31.9 38L31.1 38.1L31.6 38.6L32.3 38.1L32.6 40.5L32 41.3L32.3 43.2L33.2 43.3L32.6 43.7L32.9 44L32.1 44.2L31.3 42.9L30.7 43.3L29 42.7L28.1 44.6L28.7 46.4L27.9 47.7L28.4 49.1L29 49.3L28.5 50.6L28.8 51.9L29.7 52.5L29.3 53.4L31.1 54.7L30.1 56.7L31.1 58.1L31.1 62.4L31.7 63.6L29.8 67.1L25.5 70.6L24.7 72.8L23.1 73.4L21.6 73L20.4 74.1L20 73.7L19.3 73.9L18.1 75.2L15.1 75.4L14.3 71.6L11 68.5L10.4 65.7L8.4 62.9L8.7 59.5L8 59.3L7.8 57.9L8.3 54.8L7.2 53.7L7.8 52.7L7.7 50.2L6.8 49.6L7 48.3L6.4 47.5L7 45.3L6.5 43.8L4.9 42L4.4 39.2ZM34.4 44.9L34.2 44.5L35 45L35.2 44.5L34.6 44.7L34.1 43L32.3 41L32.6 37.8L31.8 36.9L32.8 36.4L33.3 36.7L32.6 35.4L33.7 34.8L33.9 32L34.5 31.1L35.3 30.4L36.9 30.8L37.1 29.9L38.4 29.4L37.8 29.3L38.2 28.6L37.6 28.3L38.3 26.9L37.1 25.5L36.7 25.9L34.9 24.8L33.7 20.2L33.2 19.9L33.9 18L36.9 15.8L37.3 14.7L39.2 13.8L40.6 11.6L41.6 11.2L41.4 12.1L41.9 12.3L41.9 12.9L43.9 12.8L44.1 14.2L45 14.3L47.5 16.6L48.9 21.5L48.5 23.3L48 23.4L48 26L50.9 30.6L52.2 31.2L52.1 31.5L54.6 31.5L55 32.2L55.8 31.7L58.1 31.9L59 32.7L59.9 32.4L59.9 33L61.1 33.1L63.9 35.1L65.7 38.6L69.7 40.6L70.5 40.3L71.9 40.8L73.3 41.8L64.4 40.6L60.1 42L55.3 42.1L51.9 43.3L50.9 44.4L49.7 44.2L49.3 45L48.3 44.9L46 46L44.5 45.9L43.8 46.6L41.6 47.3L39.3 46.3L36.9 46.2L36.6 45.1L35.3 45.5L34.4 44.9ZM57 75.3L57.5 72.3L58.8 72L58.8 71.2L60.5 69.2L62.2 68.8L64.7 70.5L65.9 70.6L65.7 71L66.8 71.2L67.8 73.7L70.4 75.8L71 77.5L70.7 79.1L69.9 80.8L68.5 81.5L66.7 83.3L61.8 84.8L57.9 83.2L56.2 81.2L55.5 76.2L57 75.3ZM91.2 29.9L92 31.5L91.7 32L89.5 32.8L86.9 34.7L84.2 35.2L81.6 36.6L81.5 35.2L82.3 34.2L83.7 34.2L84 33.4L85.2 33.3L91.2 29.9Z",
  "VIGI972":
    "M30.7 49.7L27.5 48.7L27.1 47.2L24.9 45.9L24.5 44.6L23.8 44.4L23.5 43L19.7 37.5L18.9 34.9L20.2 28.1L18.8 26.1L16.5 24.4L15.3 22L13.7 21.6L11.5 17.9L11.1 14.3L11.6 12.6L15.1 7.1L18.4 5.9L19.7 4.7L27 4.2L34.2 6.8L35.6 8.6L37.1 8.9L38.9 10.4L40.1 10.4L41.3 12.1L42.7 12.3L43.9 11.6L44.7 12.8L46.3 12.8L45.8 14.1L47.4 14.3L48.1 16.6L49.4 17L50.2 16.2L50.2 16.8L51.2 16.9L50.7 18.7L51.7 19.4L51.9 20.6L53 20.9L53.6 22.3L55 22.4L54.4 23L57.1 25.5L57.1 26.9L58.1 27.8L58 29.4L58.8 29.8L59.4 29.6L59.8 27.7L60.6 26.7L62.9 25.3L64.5 25L65.4 25.9L66.9 25.1L67.4 24L67.6 24.6L69.4 23.7L71 21.9L71.6 22.6L73.5 22.9L73.1 23.1L73.8 23.4L73.7 24.1L73.2 24.6L73.8 25.9L72.7 26L71.9 24.2L70.5 24.4L70.2 25.3L69.6 25.4L69.5 25.9L71 26.8L70.6 27.8L69.9 27.5L69.1 28.5L70.6 29.2L70.4 30L69.6 29.8L69.8 30.4L68.5 29.7L67.2 30L66.9 28.5L64.4 27.3L62.6 27.3L61.8 28.7L61.4 28.6L61.2 29.7L62.4 30.3L61.2 30.4L61.1 32.3L62.9 33.7L63.5 32.6L64.5 32.6L63 34.3L63.2 35.1L64.7 35L65.8 33.6L66.5 33.5L66.5 36L67.5 36.6L68.6 36.1L68.9 36.7L68.6 37.3L67.8 37.2L67 38.7L66.7 38L64 38.8L63.9 39.6L64.6 40.4L62.6 39.5L61.4 42.1L62.8 42.9L63.9 45L65.5 44.8L66 43.2L66.9 42.7L67.4 43.4L67.9 43.3L67.9 42.6L68.6 43.4L69.5 42.8L69.1 43.5L70.1 44L70.6 43.8L70.7 42.7L72 42.8L71.5 45.1L71 44.4L70.7 45.5L69.6 45.8L68.5 45.1L68.7 45.6L67.9 45.9L69.7 47.2L71 47.2L69.9 47.6L70 48.2L70.6 48.1L70.6 49L69.3 49.5L69.2 50.8L70.9 51.2L71.2 50.8L71.3 51.9L73 50.8L74.2 51.1L74.4 51.5L73.2 51.8L72.9 52.4L74.6 54.4L73.9 54.7L73.8 55.3L74.7 56.4L76.3 56.6L77.5 55.6L78.1 56.9L77.7 57.3L78.4 57.8L77.5 57.8L77.4 58.3L79.1 58.5L77.2 59.1L77.5 60.4L79 59.9L78 60.7L78.1 61.1L79.4 60.7L78.6 62L79.3 62L81.3 60.2L82.1 60.4L79.8 63.8L81.9 66L81.6 66.6L80 66.8L80.8 67.1L81.9 66.7L82.3 67.5L82 68.9L81.3 68.4L80.5 68.7L80.7 69.6L80.1 70.7L80.5 71L81.6 70.1L82.4 70.5L82.5 73.6L82.9 74.1L83.5 73.7L84.7 76.5L84.1 77.7L83.3 78L83 77.1L82.4 78L83.3 78.5L84.1 80L84.9 80.1L83.8 80.1L82.4 81.5L82.1 84.2L80.6 85L80.5 86.9L79.5 87L79.1 86.1L78 86.1L77.9 87.1L79 87.3L78.6 88.1L79.9 88.4L79.8 89.1L78.5 88.6L77 90.2L76.8 91.5L74.5 92L72.9 91.5L73.1 90.8L71.7 90.2L71.2 89.2L71.6 88.5L70.2 87.5L72.5 84L71.8 81.6L72.9 82.6L73.9 82.2L73.8 80.7L75.3 81L74.7 80.4L75.6 79.6L75 78.2L73.9 78.5L73.1 77.9L72.9 78.7L72 79L69.2 82.3L69 81.6L67 80L67.2 78.5L66.2 78.6L65.9 78L65.7 78.8L63 79.7L61.4 79L59.1 79.1L57.6 77.8L55.9 78.6L55.2 78.1L55.7 77.3L54.9 76.1L54.1 76.6L54.1 77.8L52.9 76.7L52.9 79L51.5 78.4L50.7 76.7L50 77.6L50.3 78.1L48.1 76.4L45.7 77L43.7 78.1L42.9 80.4L41.5 81.2L39.9 80.5L39 78.6L37.4 78.5L36.8 77.6L37.5 76.5L37.4 74.8L35.4 74.2L35.6 73.3L36.6 73L36.4 71.9L33.6 71.4L34.4 70.3L34.8 68.4L36 67.9L36 66.6L37.9 65.2L39.5 65.6L40.1 65.2L40.6 63.6L42 63.3L42.2 61.5L42.4 62.4L42.8 62L42.3 63.5L44.6 62.5L44.9 63.7L43.6 64.4L44.3 65.3L46.1 65.4L45.8 66.2L46.6 66.5L47.4 65.6L48.3 65.8L48.5 66.6L49 66.5L49.9 65.2L50.4 65.5L50.1 66.3L51.3 64.8L52.5 64.4L51.9 63.5L52.6 63.4L53.1 64.2L53.2 63.7L52.2 62.9L51.8 61.7L49.4 61.7L49.5 60.6L48.9 60L49.7 58.6L47.1 57.4L47.3 56.1L48.5 55.4L48 54.5L49 54.4L47.6 54.1L48.1 52.5L47.2 52.3L45.9 53.6L44.4 53.5L44.9 56L44.2 55.4L43.2 55.7L42.8 54.9L40.8 55.6L41 53.9L40.6 54.6L39.8 54.2L39.8 55.2L39 54.1L35.5 54.9L33 51.2L30.7 49.7Z",
  "VIGI973":
    "M39.3 8.4L43.9 8.9L44.6 9.5L43.5 8.8L44 8.4L50.8 11.6L50.7 10.9L52.1 11.2L66 24L67.5 23.3L70.3 26.4L74.7 29.3L78.8 30.4L79.9 32L80.8 36.2L82.3 36.7L81.6 37.7L81.8 38.7L83 40.8L84 41.4L83.3 44.4L82.7 45.4L80.2 46.9L79.7 49L76.7 51.6L76.7 53L75.5 53.4L75.1 55.3L70.2 63.3L69.2 64.7L68.6 64.4L67.8 65L67.5 66.3L66.9 66.3L66.3 67.4L67 68.6L65.3 71.8L65.7 72.6L64.6 73.1L62 78.9L61.4 79.2L62.1 80.6L61.3 81.4L61.5 82.1L59.9 83.2L60.1 83.7L59.2 84.2L58.9 85.6L54.1 87.9L53 90.2L51 90.6L48.7 89.3L47.5 89.2L44 90.1L43.9 89.4L45.2 88.3L43.4 87.3L43 86.3L42.1 86.3L41.7 87.1L39.5 88.6L37.5 88.6L34.8 87.9L34.6 87.4L32.8 87.3L33.2 86.2L32.2 85.6L30.5 86.7L31 87.2L29.3 87.2L28.8 88.4L28.1 87.9L27.8 89.5L25.9 90.3L24.9 89.9L24.1 92L22.4 91.6L22 90.4L21.1 91.1L18.2 91L17.8 89.6L16.5 90L16.2 89.5L15 89.5L14.5 88.7L13.3 88.2L14.1 87.9L13.5 86.8L12 86.5L12.7 86.1L14.3 86.5L15 84.2L16.4 84.1L17.2 83.3L20.1 77.2L21.5 75.9L21.5 74.6L22.2 73.9L21.9 72.3L22.6 71.2L21.8 68.9L22.3 68.7L22.3 67.8L21.3 66.9L23.2 64L25 62.9L25.1 61.2L26.2 60.1L26.3 57.5L27 55.8L26.3 54.8L25.4 55.2L24.5 54.2L24.6 53.2L23.6 51.3L21.7 51L21.9 50L20.8 49.7L20.5 48.5L19.5 47.8L18.8 45.9L17.9 45.1L18.7 42.8L17.1 41.8L17.1 37.7L15.8 37.3L16.1 35.1L15.6 33.6L16.5 31.6L15.9 30.7L16.2 29L15.2 28.4L14.9 24.4L15.8 23.5L16.5 20L17.4 19.5L19.8 15.7L22.1 14.2L26 9.5L26.1 6.3L27.3 4L31.4 4.6L36.3 7.3L39.3 8.4Z",
  "VIGI974":
    "M9.3 44.8L6 42L4.6 39.9L4.7 37L5.3 36.3L4 33.9L6.7 30.9L8.3 31.2L9.7 30.6L12.5 28.3L13.4 24.8L12.6 21.3L13.2 18.6L13.4 19.8L14.3 18.3L13.8 17.6L13.9 18.4L13.5 18.3L13.5 17L14 16.5L16.5 17.4L18.4 17.2L18.6 17.7L17.9 18L19.4 18.3L18.9 16.9L20.2 17.2L22.2 16.3L23.2 14.7L29.3 10.2L33 9L35.8 9.4L37.3 8.6L39.9 10.5L42.7 10.8L44.6 10.2L50.1 12.1L51.4 12.2L52.6 11.6L55.8 12.5L57.3 12.3L61.3 14.6L65.2 15.3L67.8 16.9L70.2 19.7L72.2 22.9L73 30.9L73.7 32.4L75.2 33.1L77.2 35.7L77.1 37.3L78.1 39L82.7 44.4L84 46.7L86.8 47.5L88.2 49L90.5 50L91.8 52.5L91.5 54.2L92 56L90.5 56.5L90.3 59.1L88.8 60.7L88 62.8L87 67.7L88 71.9L87.3 75.3L88.1 78.5L87.8 79.4L86.4 81.5L83.3 83.8L80.6 83.4L79.8 84.1L76.4 84.4L73.9 85.4L70 85.2L68.5 86.5L66.8 86.4L65.1 87.4L63.2 86.3L59.7 87L56.5 84.7L54.4 85.3L52.1 84.6L51.5 85.1L49.7 83.5L47.6 83.1L44.4 81.5L42 81.8L41.2 80.4L38.5 80L37.8 78.6L37 78.1L34.3 77.8L32.8 77.1L28.7 72.6L20.9 70.4L20.2 67.5L18.7 66.6L18.8 66L17.4 64.7L14.8 63.1L13.1 58.9L14 56L14 52.6L13.2 51.5L12 51L11.7 48.2L9.2 45.5L9.3 44.8Z",
  "VIGI976":
    "M30.8 42.1L31.1 40.8L32.8 40.3L33.5 40.8L33.9 40.1L33 39.3L32.1 39.8L30.3 39.7L30 39L30.4 37.7L29.9 38.3L29.3 37.7L31.3 36.6L31.4 33.2L29.5 33.1L29.6 34.1L29 34.4L27.7 32.7L26.1 32.5L25.7 33.3L25.2 33.2L24.4 32.8L24.2 31.9L22.2 30.8L21 29.2L19.7 29.5L19 30.6L18.4 29.4L16.9 28.6L16.7 27.5L19.5 25.3L20.5 23.2L19.8 22.3L16 22L16.9 21.7L18.6 19.5L18.9 18.3L18.3 17.5L18.9 16.4L21.6 16.9L23.3 15.5L22.8 14.9L23.5 15.2L24.1 14.4L24.2 12.8L22.6 11.6L25 12.3L26.2 11.7L26.8 11.1L26.5 9.1L27.3 8.8L27.4 7.9L29.2 7.1L29 5.6L30.4 5.8L32.1 4L32.6 4.5L31.7 5L31.4 6.1L32.2 6.9L29.6 7.6L27.9 8.9L32 10.5L31.1 11.4L31.3 12L32.8 12.1L33 12.8L33.8 13L34.2 13.4L33.6 13.6L33.6 14.2L34.4 15.3L37.3 16.7L38.3 16.5L38.3 17.4L37.2 17L36.4 17.8L36.8 19.3L38 20.2L38 21.4L38.6 21.7L37.5 22.3L36.1 22.2L37.6 22.4L37.1 23.3L38.1 23.3L38.4 24.2L40.1 24.2L40.7 25.1L40.2 24.4L41.2 24.9L41.7 24.2L40.9 23.4L42.6 23.5L43.3 23.8L43.3 25.1L44.3 25.6L46 24.6L45.9 23.4L46.9 22.9L46.4 22.2L47.2 22.5L47.3 21.9L46.5 21.4L47.1 20.8L48 22.9L49.7 24L50.3 24.1L51.3 23.2L52 23.8L52.9 23.5L54.5 24.3L56.4 24L57.1 24.5L57 25.1L57.9 25.4L58.9 24.6L58.3 26L58.7 26.7L60.6 27.6L61.6 27.3L62.4 29L64.5 29.9L64 30.7L65.2 32.2L64.2 32.7L63.9 34.9L62.7 34.8L63.7 33.4L62.8 32.1L62.9 33.1L63.3 33.2L62.6 33.8L62.2 33.5L62.6 33.9L62.1 34.1L62.1 35.1L61.7 35.2L63.7 35.6L63.5 36.5L64.8 37L64.7 37.8L64.3 38.1L63.9 37.4L62.8 37.6L62.9 38.2L62.1 38.1L61 39.4L60.5 39L61 39.4L59.4 40.3L59.1 42L56.2 44L56.7 44.7L56.3 46.5L54.1 47.7L53.5 49.5L54.8 49.3L54.5 49.9L52.8 51.3L51.8 51.3L52 52L51.5 52.2L54.3 52.9L54.1 53.8L54.6 55.2L55 55.6L55.5 55.2L55.9 55.9L55.8 57.4L58.4 57.5L57.9 58.9L58.7 60L60.8 59.7L59.3 62.1L59.6 63.3L58.1 64.6L54.4 66.1L54.8 66.6L54.3 68.4L54.3 67.7L53.5 68.2L54.4 68.7L54.1 69.4L54.5 69.4L54.7 70.4L56.6 71.9L52.1 71.1L51.4 72.2L51.7 72.9L50.4 73.3L49.5 75L50.4 76.7L50.3 77.7L49 77.2L47.9 77.6L47.7 79.3L49.3 81L49.7 83.3L53.1 84.7L53.7 85.9L56.5 85.6L55.6 87.2L54.1 87.9L53.9 88.8L51.9 87.9L50.6 88L49.9 89.6L50 90.7L49.4 90.6L48.5 86.5L47.2 85.7L45.9 85.9L46.3 85.7L45.7 85.1L45.1 86.2L45.4 86.3L44.6 87L45 89.1L42.9 91.9L41.1 91.9L40.5 89.8L39.2 89.2L38.6 90.3L37.3 90.9L37 86.9L36.8 87.5L35.6 87L34.3 87.4L33 90.4L32.2 88.8L32.9 87.4L32.4 85.5L33.5 83.9L33.5 82.1L32.9 81.2L31.8 81.4L30.8 83L29 83.5L26.7 82.2L25.6 82.5L29.6 80.2L31.1 78.3L31.2 76.2L31.9 75.1L30.3 73.1L27.7 74.3L28.1 73.1L27.6 72.3L26.7 72.3L25.3 68.1L23.8 67.3L23.7 66.6L30.6 66.4L31.5 67.9L31.4 71.3L32.2 72.6L36.7 74.1L37 75.2L39.8 75.9L39.9 76.4L40.2 75.8L42 75.8L42.9 75.2L44.3 72.7L44 71.1L42.8 69.7L42.9 68.8L41.7 68L42 66.9L40.9 65.5L40.9 66.3L40.3 64.5L38.7 64L38.2 62.9L38.6 62.8L36.7 62.2L33.6 57.6L31.9 57.5L29.1 55L29.3 54.3L30.5 54.1L31.5 52.6L34.6 52.8L36.1 51.6L31.1 50.2L31.6 46.8L32.4 46.5L32.3 45L30.7 43.5L30.8 42.1ZM72.9 39.9L70.8 38.3L70.2 38.5L70.2 38L68.6 37.3L68.8 36.8L69.3 36.7L69.8 37.6L72.1 38.9L72.2 38.2L73 38L72.9 37.4L74.3 34.9L73.9 34.4L76.2 31.2L78.3 33.8L78.5 35.5L79.5 36.4L78.9 37.1L79.9 37.3L79.8 37.9L79.3 37.4L78.5 38.5L79 39.3L78.7 39.8L79.2 40.2L78.2 41.4L76.8 41.5L76.3 42.3L76.1 44.3L77 45.9L76.6 46.1L76 45L74.9 44.5L74.7 42.8L72.9 39.9Z",
  "VIGI978-977":
    "M18.2 39.7L18.3 40.4L19.7 41.1L20 42.1L20.5 41.7L22.1 41.5L23.5 41.9L23.7 43.6L25.1 42.6L26.3 44L27 44.1L28.2 43.2L29.6 43.5L30 44L29.7 44.5L30 45.5L30.4 44.4L30 43L31.1 41.8L32.7 41.6L34.4 42L35.5 42.8L35.2 43.3L34.6 43.2L35.2 43.4L35.1 43.9L34.4 43.6L34.8 43.9L34.8 44.8L34.3 45L35.1 45.7L34.7 47.8L35.2 48L36.4 47.8L37.5 46.4L37.5 45.6L38.7 45.5L39 44.8L39.6 44.5L39.8 43.6L40.9 43.3L40.1 41.8L42.2 40.3L42 39.7L42.7 39.3L42.5 39L41.7 38.9L41.6 37.7L42.4 36.4L43.3 36.1L43.4 35.3L44.1 34.7L43.6 32.9L44.7 31.7L43.6 32L42.8 31L43.4 30.6L44.1 30.7L44.4 31.2L45.1 31.1L45 31.7L45.4 31.8L45.8 31.2L44.7 29L45.3 28.3L45.3 27.6L44.5 27.2L44 27.4L42.7 25.3L43.7 23.6L44.3 23.6L44.5 24.1L45.8 21.9L45 22.1L43.1 20.8L42 19.4L41.5 18.1L42 15.6L41.1 14.8L41.1 14.2L41.9 13.3L43 13.8L43.6 13.1L43.5 12.5L42.8 12.3L42.5 11.6L42.4 9.5L42.9 8.7L42.2 8.8L40.8 8L39.4 8.2L39 8.6L38.5 8.3L36.8 8.3L36.2 9.9L37.5 11.8L37.5 12.3L36.9 12.4L37.1 11.5L36.7 10.8L36.5 11.2L35.7 11.5L35 10.6L34.5 10.8L32.6 9.9L31.9 13.4L32.1 13.9L30.7 15.7L29.9 16.2L28.2 16.3L27.7 16.2L26.9 15.1L26.2 15.6L26.2 16.2L25.1 16.4L25.6 17.1L25.4 18L24.9 18.5L24.1 18.5L23.1 20.1L21.8 20.8L22.1 21.5L21.6 21.8L22.1 21.7L23.3 23.3L22.2 25.2L20.5 26L20.4 26.5L20.7 25.8L21.4 25.9L21.3 26.7L20.5 26.6L21.1 26.8L21.5 26.4L21.5 27L20.5 28L18.4 28.8L19.4 29.5L19.5 29L19.7 29.5L20.4 28.6L21.5 28L20.2 32.7L19.5 32.6L18.9 32L18.6 32.8L18.9 33.3L20.2 33.4L20.9 34.1L20.3 35.3L20.7 36.4L21.9 37.6L22.2 39.7L21.5 39.4L20.9 38.4L20.3 38.6L19.2 37.7L18.6 38.2L19.2 38.3L19.3 39.1L18.2 39.7ZM52 60.4L52.2 60.9L52.6 60.7L53.8 61.3L54.1 63L55.6 63.7L55.8 64.4L56.2 64.4L58.3 66.9L60.2 66.7L60.6 67L60.7 67.9L62 68.6L62.3 69.3L62 69.7L61.7 69.5L61.8 69.8L64 72.9L63.3 73.3L62.7 71.7L62 71.4L61.4 72L61.8 73L63.2 74.4L64.5 74.7L64.5 75.8L65.5 77.1L66.7 77.8L67.3 79.3L68 79.7L67.9 80.6L69 81.5L69.7 81.5L70.5 79.1L70.8 79.2L71.1 78.5L72.1 78.2L72.8 78.7L73 79.6L73.8 80.6L74.3 78.9L75.5 79.4L75.7 77.6L77.6 76.7L78.4 76.9L78.7 77.9L79.6 77.7L79.6 78.7L80.6 79.8L82.2 78.7L82.1 76.6L82.5 76.3L82.4 75.4L83 74.9L86.4 73.5L87.1 72.6L88.6 72.1L89.2 72.2L89.7 73.4L90.2 73.7L90.8 72.9L90.5 70.2L91.3 69.7L91.8 68.6L91.5 67.6L92 66.7L91.8 65.6L91.5 65.4L90.4 66.9L89.6 67.1L89.6 68L89.2 68.1L88.2 67.5L88.7 66.1L87.9 64.6L87.1 65.1L87.2 66L86.4 66.7L85.1 65.6L85.4 64.4L85.9 64.3L85.6 63.9L83.9 64.7L83.6 65.7L82.7 65.7L82.2 65L83.6 63.5L82.9 63L82.9 62L82.7 62.8L80.9 63.2L80.3 62.5L80.3 61.5L79.9 61.1L78.7 62.2L78.7 64L76.9 66.8L75.6 67.4L74.3 67.4L73.8 66.8L74.1 66.1L73.3 66.1L71 67.9L71.5 68.7L71.3 69.1L70.2 69.5L70 69.1L69.4 69.3L67.9 68.4L67.5 67.4L68.2 66.6L68 65.7L66.5 65.6L65.7 64L66.4 63.4L66.1 62.5L65.7 62.3L64.6 62.6L64.1 62.3L63.3 59.9L61.4 60.3L61.3 61L60 61.4L58.9 61.2L57.9 59.9L57.8 60.7L57 61L56.2 60L56.1 59L55.1 58.5L55.6 57.6L55 56.8L55.2 56.6L54.8 56.5L53.4 56.8L52.8 57.4L54.3 57.8L54.8 58.4L54.4 60L52 60.4Z",
};

/* Les consignes des niveaux que la métropole ne connaît pas. Ce sont celles
 * du dispositif de Météo France outre-mer : le violet ordonne le confinement,
 * le gris annonce que le danger s'éloigne sans avoir disparu. */
/* Les noms des niveaux que la métropole ne connaît pas : le composant les
 * publie en français, l'écran suit la langue de Home Assistant. */
const NATIVE_NAMES = {
  fr: {
    purple: "Violet",
    grey: "Gris",
    blue: "Bleu",
    blue_grey: "Bleu-gris",
    orange_hatched: "Orange cyclonique",
    red_hatched: "Rouge cyclonique",
  },
  en: {
    purple: "Purple",
    grey: "Grey",
    blue: "Blue",
    blue_grey: "Blue-grey",
    orange_hatched: "Cyclonic orange",
    red_hatched: "Cyclonic red",
  },
};

const NATIVE_NOTICE = {
  fr: {
    purple: "Confinez-vous",
    grey: "Restez prudent",
    blue_grey: "Phase de sauvegarde",
    blue: "Pas de vigilance particulière",
  },
  en: {
    purple: "Stay indoors",
    grey: "Remain cautious",
    blue_grey: "Recovery phase",
    blue: "No particular vigilance",
  },
};

const WORDS = {
  fr: {
    today: "Aujourd'hui",
    tomorrow: "Demain",
    noData: "Aucune donnée de vigilance",
    noEntity: "Indiquez un capteur de vigilance dans la configuration de la carte.",
    expired: "Bulletin périmé",
    updated: "Mis à jour",
    nothing: "Aucun phénomène signalé",
    allGreen: "Vert toute la journée",
    quiet: "%s — vert sur toute la période.",
    titleFor: "Vigilance %s",
    cardName: "Vigilance Météo France",
    cardDescription:
      "Vigilance d'un département ou d'un territoire d'outre-mer : carte, "
      + "couleur et phénomènes, aujourd'hui et demain.",
    loaded: "chargée",
    entity: "Capteur de vigilance",
    title: "Titre",
    periods: "Périodes affichées",
    both: "Aujourd'hui et demain",
    layout: "Disposition",
    theme: "Thème",
    showMap: "Afficher la carte",
    showPhenomena: "Afficher les phénomènes",
    showComment: "Afficher le commentaire national",
    hideGreen: "Masquer les phénomènes verts",
    alertOnly: "Masquer la carte tant que rien n'est signalé",
    hideMapInset: "Masquer le libellé « Paris - Petite couronne »",
    mapWidth: "Largeur maxi de la carte (px)",
    tapAction: "Au clic",
    holdAction: "À l'appui long",
    doubleTapAction: "Au double clic",
    layoutHint: {
      duo: "Deux colonnes, aujourd'hui et demain : chacune sa carte et ses phénomènes.",
      focus: "Une seule grande carte, aujourd'hui, nom et niveau en surimpression. Demain tient sur une ligne.",
      compact: "Aucune carte : une ligne par jour, icônes des phénomènes à droite. Pour empiler des départements ou des territoires.",
      chronologie: "Aucune vignette : une barre de 24 h par phénomène, colorée aux heures concernées.",
    },
    themeHint: {
      officiel: "Chaque puce porte sa propre couleur, en fond très atténué.",
      bandeau: "Une seule couleur, sur la tranche gauche. Les puces redeviennent neutres. Se lit de loin.",
      plein:
        "La journée en alerte prend la couleur : bandeau plein, texte blanc, fond teinté. " +
        "Seulement à partir de l'orange — au vert et au jaune, identique à « officiel ».",
      sobre: "Aucun aplat : la pastille devient un anneau, les puces un soulignement.",
    },
  },
  en: {
    today: "Today",
    tomorrow: "Tomorrow",
    noData: "No vigilance data",
    noEntity: "Set a vigilance sensor in the card configuration.",
    expired: "Outdated bulletin",
    updated: "Updated",
    nothing: "No phenomenon reported",
    allGreen: "Green all day",
    quiet: "%s — green for the whole period.",
    titleFor: "%s vigilance",
    cardName: "Météo-France Vigilance",
    cardDescription:
      "Vigilance for one mainland department or overseas territory: map, level "
      + "and phenomena, today and tomorrow.",
    loaded: "loaded",
    entity: "Vigilance sensor",
    title: "Title",
    periods: "Periods shown",
    both: "Today and tomorrow",
    layout: "Layout",
    theme: "Theme",
    showMap: "Show map",
    showPhenomena: "Show phenomena",
    showComment: "Show national comment",
    hideGreen: "Hide green phenomena",
    alertOnly: "Hide the card while nothing is reported",
    hideMapInset: "Hide the “Paris - Petite couronne” label",
    mapWidth: "Map max width (px)",
    tapAction: "Tap action",
    holdAction: "Hold action",
    doubleTapAction: "Double tap action",
    layoutHint: {
      duo: "Two columns, today and tomorrow: each with its national map and its phenomena.",
      focus: "One large map, today, name and level overlaid. Tomorrow fits on a single line.",
      compact: "No map: one line per day, phenomenon icons on the right. For stacking departments or territories.",
      chronologie: "No map: a 24-hour bar per phenomenon, coloured over the hours concerned.",
    },
    themeHint: {
      officiel: "Each chip carries its own colour, as a heavily muted fill.",
      bandeau: "A single colour, on the left edge. Chips turn neutral. Reads from afar.",
      plein:
        "The alerted day takes the colour: solid band, white text, tinted background. " +
        "From orange up only — at green and yellow, identical to “officiel”.",
      sobre: "No fills: the dot becomes a ring, the chips an underline.",
    },
  },
};

/* La langue de Home Assistant d'abord. À défaut celle du navigateur : le
 * sélecteur de cartes et le message de chargement parlent avant que `hass`
 * n'existe, et l'anglais sec y serait un choix par accident. */
const words = (hass) =>
  WORDS[(hass?.locale?.language || navigator.language || "en").split("-")[0]] ||
  WORDS.en;

const isFrench = (hass) => (hass?.locale?.language || "fr").startsWith("fr");

/** Événement du frontend Home Assistant : composé, donc franchit le shadow DOM. */
const fireEvent = (node, type, detail = {}) => {
  const event = new Event(type, { bubbles: true, cancelable: false, composed: true });
  event.detail = detail;
  node.dispatchEvent(event);
};

const moreInfo = (node, entityId) => fireEvent(node, "hass-more-info", { entityId });

/* L'encre qui se lira le mieux sur un fond donné.
 *
 * Le seuil d'accessibilité demande un contraste de 4,5 contre 1 pour du
 * texte : le blanc ne l'atteint pas sur le gris d'une phase de sauvegarde
 * (2,85) quand l'encre sombre y monte à 5,48. Sur le violet d'un confinement,
 * c'est l'inverse — 7,29 pour le blanc. On mesure donc plutôt que de
 * supposer, et la règle vaudra aussi pour les couleurs à venir. */
const readableInk = (background) => {
  const hex = String(background || "").replace("#", "");
  if (hex.length !== 6) return "#fff";
  const channel = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  // Luminance relative, telle que la définit la norme d'accessibilité.
  const l = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  const withWhite = 1.05 / (l + 0.05);
  const withInk = (l + 0.05) / 0.05;
  return withWhite >= withInk ? "#fff" : "#12161d";
};

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

/* Le nom du niveau tel qu'il sera lu.
 *
 * Outre-mer, l'échelle va au-delà du rouge : le violet dit « confinez-vous »
 * et le gris « restez prudent ». Le composant ramène ces niveaux à `red` pour
 * que les automations restent portables, mais l'écran, lui, doit dire le
 * niveau réel — sans quoi une carte grise s'annoncerait « Rouge ».
 *
 * `color_name` vient du composant, déjà dans la langue de Météo France. */
const levelName = (state, hass, attrs) => {
  if (attrs?.color_native) {
    const table = NATIVE_NAMES[isFrench(hass) ? "fr" : "en"];
    return table[attrs.color_native] || attrs.color_name || "—";
  }
  const level = LEVELS[state];
  return level ? level[isFrench(hass) ? "fr" : "en"] : "—";
};

/* Une teinte publiée par le composant, et rien d'autre : ce qui atteint un
 * style se refuse en bloc si ce n'est pas une couleur hexadécimale. */
const safeHex = (value) =>
  /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : null;

const hour = (value, hass) =>
  value
    ? new Date(value).toLocaleTimeString(hass?.locale?.language || "fr", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

class MeteoFranceVigilanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = { ...DEFAULTS };
    this._hass = null;
    // La structure est construite une fois et mise à jour ensuite : refaire le
    // DOM à chaque état ferait clignoter les images, qui sont rechargées dès
    // que leur `src` est réécrit, même à l'identique.
    this._built = false;
    this._parts = {};
    this._resolved = null;
  }

  static getConfigElement() {
    return document.createElement(EDITOR_NAME);
  }

  /**
   * Configuration proposée quand la carte est ajoutée.
   *
   * Home Assistant passe les entités présélectionnées — celles cochées dans le
   * sélecteur de cartes, ou celle depuis laquelle « ajouter au tableau de
   * bord » a été lancé. On sert ce qu'on nous désigne avant d'aller chercher
   * nous-mêmes : sans cela, ajouter la carte depuis le Loiret proposerait les
   * Bouches-du-Rhône parce qu'elles viennent en premier dans les états.
   */
  static getStubConfig(hass, entities, entitiesFallback) {
    const ours = (id) => {
      const attrs = hass.states[id]?.attributes;
      return Boolean(attrs?.entry_id && (attrs.department || attrs.integration === INTEGRATION));
    };

    // Une vignette désignée renvoie au capteur du même département : la carte
    // se configure avec un capteur, mais on ne peut pas reprocher à quelqu'un
    // d'avoir cliqué sur l'image.
    const toSensor = (id) => {
      if (id.startsWith("sensor.")) return id;
      const entryId = hass.states[id]?.attributes.entry_id;
      return Object.keys(hass.states).find(
        (other) =>
          other.startsWith("sensor.") &&
          hass.states[other].attributes.entry_id === entryId &&
          hass.states[other].attributes.period === "today"
      );
    };

    const preferred = [...(entities || []), ...(entitiesFallback || [])].filter(ours);
    const anySensor = () =>
      Object.keys(hass.states).find(
        (id) =>
          id.startsWith("sensor.") &&
          hass.states[id].attributes.period === "today" &&
          hass.states[id].attributes.department
      );

    // Parmi les entités proposées, le capteur d'aujourd'hui d'abord : c'est
    // celui qui porte les deux journées dans ses attributs.
    const chosen =
      preferred.find(
        (id) => id.startsWith("sensor.") && hass.states[id].attributes.period === "today"
      ) ||
      (preferred[0] && toSensor(preferred[0])) ||
      anySensor();

    return { type: `custom:${CARD_NAME}`, entity: chosen || "" };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error(words(this._hass).noEntity);
    }
    const merged = { ...DEFAULTS, ...config };
    // Une valeur inconnue — faute de frappe dans le YAML — retombe sur le
    // défaut plutôt que de rendre une carte vide sans rien dire.
    if (!LAYOUTS.includes(merged.layout)) merged.layout = DEFAULTS.layout;
    if (!THEMES.includes(merged.theme)) merged.theme = DEFAULTS.theme;
    this._config = merged;

    // La disposition décide de la structure : elle est refaite, l'état la
    // remplira.
    this._built = false;
    this._resolved = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    const previous = this._hass;
    this._hass = hass;
    // Home Assistant réaffecte `hass` à chaque changement d'état de la maison,
    // soit plusieurs fois par seconde. Redessiner à chaque fois relirait les
    // images et referait les puces pour une lampe allumée à l'autre bout du
    // logement : on ne redessine que si l'une de NOS entités a bougé.
    if (previous && !this._touched(previous, hass)) return;
    this._render();
  }

  /** Vrai si une entité utilisée par la carte a changé depuis le dernier rendu. */
  _touched(previous, next) {
    if (previous.locale !== next.locale) return true;
    // Basculer clair/sombre ne change aucune entité : sans cette ligne, la
    // vignette garderait son encre d'avant jusqu'au prochain bulletin.
    if (previous.themes?.darkMode !== next.themes?.darkMode) return true;
    const watched = [this._config.entity, ...(this._resolved?.ids || [])];
    return watched.some((id) => previous.states[id] !== next.states[id]);
  }

  getCardSize() {
    if (this._config.layout === "compact") return 1;
    if (this._config.layout === "chronologie") return 4;
    return this._config.show_map ? 6 : 3;
  }

  /** Vues « sections » : la hauteur suit ce que la disposition demande. */
  getGridOptions() {
    // Ce que la carte demande dépend de ce qu'elle montre : une ligne compacte
    // se contente d'un quart de vue, une chronologie de deux journées réclame
    // de la hauteur. `rows` n'est qu'une proposition — min et max activent les
    // poignées de redimensionnement des vues « sections ».
    const deux = this._periods().length > 1;
    const carte = this._config.show_map;
    const spec = {
      compact: { rows: deux ? 2 : 1, min_rows: 1, min_columns: 3, columns: 6 },
      chronologie: { rows: deux ? 8 : 4, min_rows: 3, min_columns: 6, columns: 12 },
      focus: { rows: carte ? 6 : 2, min_rows: 2, min_columns: 4, columns: 12 },
      duo: { rows: carte ? 5 : 3, min_rows: 2, min_columns: 4, columns: 12 },
    }[this._config.layout];
    return { ...spec, max_rows: 12 };
  }

  // ── Résolution des entités ──────────────────────────────────────────────
  // La carte ne reçoit qu'un capteur ; les trois autres entités sont retrouvées
  // par les attributs que le composant leur donne — `entry_id` pour savoir
  // qu'elles viennent de la même intégration, `department` et `period` pour
  // savoir laquelle est laquelle. Aucun nom d'entité n'est deviné.

  _resolve() {
    const hass = this._hass;
    const base = hass.states[this._config.entity];
    if (!base) {
      this._resolved = null;
      return null;
    }

    const entryId = base.attributes.entry_id;
    const department = base.attributes.department;

    // Le balayage des états est refait seulement si l'entité visée a changé
    // d'entrée ou de département, ou si l'une des entités trouvées a disparu —
    // pas à chaque rendu.
    const key = `${entryId}|${department}`;
    if (
      this._resolved &&
      this._resolved.key === key &&
      this._resolved.ids.every((id) => hass.states[id])
    ) {
      return this._resolved;
    }

    const found = { key, sensors: {}, maps: {} };

    for (const [id, state] of Object.entries(hass.states)) {
      const attrs = state.attributes;
      if (attrs.entry_id !== entryId) continue;

      if (id.startsWith("sensor.") && attrs.department === department) {
        found.sensors[attrs.period] = id;
      } else if (
        // `image.` depuis la v2, `camera.` avant elle : une carte doit
        // continuer d'afficher les vignettes d'une installation qui n'a pas
        // encore migré.
        (id.startsWith("image.") || id.startsWith("camera.")) &&
        attrs.integration === INTEGRATION
      ) {
        found.maps[attrs.period] = id;
      }
    }

    // Le capteur donné fait foi même si la boucle ne l'a pas reconnu : une
    // carte configurée doit afficher ce qu'on lui a demandé.
    found.sensors[base.attributes.period || "today"] ??= this._config.entity;
    found.department = department;
    found.name = base.attributes.department_name || department;
    found.ids = [...Object.values(found.sensors), ...Object.values(found.maps)];
    this._resolved = found;
    return found;
  }

  _periods() {
    if (this._config.periods === "today") return ["today"];
    if (this._config.periods === "tomorrow") return ["tomorrow"];
    return PERIODS;
  }

  _state(resolved, period) {
    const id = resolved.sensors[period];
    return id ? this._hass.states[id] : null;
  }

  /** Vrai si l'une des périodes affichées atteint le seuil d'alerte. */
  _worst(resolved) {
    return this._periods().some((period) =>
      alerted(this._state(resolved, period)?.state)
    );
  }

  // ── Rendu ────────────────────────────────────────────────────────────────

  _render() {
    if (!this._hass) return;
    if (!this._built) this._build();

    // Home Assistant tient ce drapeau à jour tout seul — thème choisi à la
    // main comme thème suivant le système. La carte n'a qu'à le recopier :
    // c'est lui qui allume le calque d'encre de la vignette.
    this._parts.card.classList.toggle("dark", Boolean(this._hass.themes?.darkMode));

    if (this._config.map_width) {
      this._parts.card.style.setProperty(
        "--mfv-map-width",
        `${Number(this._config.map_width)}px`
      );
    } else {
      this._parts.card.style.removeProperty("--mfv-map-width");
    }


    const resolved = this._resolve();
    if (!resolved) {
      this.style.display = "";
      this._parts.error.textContent = `${this._config.entity} — ${words(this._hass).noData}`;
      this._parts.error.style.display = "";
      this._parts.body.style.display = "none";
      return;
    }

    // `alert_only` : la carte s'efface entièrement du tableau de bord tant que
    // rien n'atteint l'orange. Jamais dans l'éditeur, où l'on doit pouvoir la
    // configurer même par temps calme.
    const hidden =
      this._config.alert_only && !this.preview && !this._worst(resolved);
    this.style.display = hidden ? "none" : "";
    if (hidden) return;

    this._parts.error.style.display = "none";
    this._parts.body.style.display = "";

    const title = this._config.title ?? this._defaultTitle(resolved);
    this._parts.title.textContent = title;
    this._parts.title.style.display = title ? "" : "none";

    const updater = {
      duo: () => this._updateColumns(resolved),
      focus: () => this._updateFocus(resolved),
      compact: () => this._updateCompact(resolved),
      chronologie: () => this._updateChrono(resolved),
    }[this._config.layout];
    updater();

    // La date d'émission est la même pour toutes les périodes : lue une fois.
    const stamp = this._state(resolved, this._periods()[0])?.attributes.update_time;
    this._parts.foot.textContent = stamp
      ? `${words(this._hass).updated} ${new Date(stamp).toLocaleString(
          this._hass.locale?.language || "fr",
          { dateStyle: "short", timeStyle: "short" }
        )}`
      : "";
  }

  _defaultTitle(resolved) {
    // En compact sur une seule période, le nom du département tient déjà dans
    // la ligne : un titre au-dessus la doublerait.
    if (this._config.layout === "compact" && this._periods().length === 1) return "";
    return words(this._hass).titleFor.replace("%s", resolved.name);
  }

  // ── Construction : une structure par disposition ─────────────────────────

  _build() {
    const t = words(this._hass);
    const periods = this._periods();
    const body = {
      duo: () => this._buildColumns(t, periods),
      focus: () => this._buildFocus(t, periods),
      compact: () => this._buildCompact(t, periods),
      chronologie: () => this._buildChrono(t, periods),
    }[this._config.layout]();

    this.shadowRoot.innerHTML = `
      <style>${MeteoFranceVigilanceCard.styles}</style>
      <ha-card class="theme-${this._config.theme} layout-${this._config.layout}${
        this._config.hide_map_inset ? " hide-inset" : ""
      }">
        <div class="title"></div>
        <div class="error" style="display:none"></div>
        <div class="body">${body}</div>
        <div class="foot"></div>
      </ha-card>`;

    const root = this.shadowRoot;
    this._parts = {
      card: root.querySelector("ha-card"),
      title: root.querySelector(".title"),
      error: root.querySelector(".error"),
      body: root.querySelector(".body"),
      foot: root.querySelector(".foot"),
      periods: Object.fromEntries(
        periods.map((period) => {
          const node = root.querySelector(`.period[data-period="${period}"]`);
          return [
            period,
            {
              node,
              dot: node.querySelector(".dot"),
              label: node.querySelector(".label"),
              level: node.querySelector(".level"),
              mapWrap: node.querySelector(".map-wrap"),
              map: node.querySelector("img.map"),
              stale: node.querySelector(".stale"),
              chips: node.querySelector(".chips"),
              icons: node.querySelector(".icon-row"),
              rows: node.querySelector(".rows"),
              scale: node.querySelector(".tl-scale"),
              quiet: node.querySelector(".tl-quiet"),
              comment: node.querySelector(".comment"),
              // Ce que l'image affiche déjà, pour ne réécrire `src` que si
              // l'adresse a réellement changé.
              src: null,
            },
          ];
        })
      ),
    };
    this._built = true;
  }

  /** L'en-tête d'une période : pastille, nom, consigne, niveau. */
  _headHTML(label) {
    return `
      <div class="head">
        <span class="dot"></span>
        <span class="label">${escapeHtml(label)}</span>
        <span class="notice inline" style="display:none"></span>
        <span class="level"></span>
      </div>`;
  }

  _buildColumns(t, periods) {
    return `
      <div class="grid" style="--columns:${periods.length}">
        ${periods
          .map(
            (period) => `
          <div class="period" data-period="${period}">
            ${this._headHTML(t[period])}
            <div class="map-wrap" style="display:none">
              <img class="map" alt="${t[period]}" />
              <div class="inset-mask"></div>
              <div class="stale" style="display:none">${t.expired}</div>
              <div class="notice on-map" style="display:none"></div>
            </div>
            <div class="chips"></div>
            <div class="comment" style="display:none"></div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  _buildFocus(t, periods) {
    const [main, ...rest] = periods;
    return `
      <div class="focus">
        <div class="period main" data-period="${main}">
          <div class="head bare">
            <span class="dot"></span>
            <span class="label">${t[main]}</span>
            <span class="notice inline" style="display:none"></span>
            <span class="level"></span>
          </div>
          <div class="map-wrap" style="display:none">
            <img class="map" alt="${t[main]}" />
            <div class="inset-mask"></div>
            <div class="overlay">
              <span class="dot"></span>
              <span class="label">${t[main]}</span>
              <span class="notice inline" style="display:none"></span>
              <span class="level"></span>
            </div>
            <div class="stale" style="display:none">${t.expired}</div>
            <div class="notice on-map" style="display:none"></div>
          </div>
          <div class="chips"></div>
          <div class="comment" style="display:none"></div>
        </div>
        ${rest
          .map(
            (period) => `
          <div class="period strip" data-period="${period}">
            <div class="head">
              <span class="dot"></span>
              <span class="label">${t[period]}</span>
              <span class="notice inline" style="display:none"></span>
              <span class="level"></span>
              <span class="icon-row"></span>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  _buildCompact(t, periods) {
    return `
      <div class="compact">
        ${periods
          .map(
            (period) => `
          <div class="period" data-period="${period}">
            <div class="head">
              <span class="dot"></span>
              <span class="label"></span>
              <span class="notice inline" style="display:none"></span>
              <span class="level"></span>
              <span class="icon-row"></span>
            </div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  _buildChrono(t, periods) {
    return `
      <div class="chrono">
        ${periods
          .map(
            (period) => `
          <div class="period" data-period="${period}">
            ${this._headHTML(t[period])}
            <div class="rows"></div>
            <div class="tl-scale"></div>
            <div class="tl-quiet" style="display:none"></div>
          </div>`
          )
          .join("")}
      </div>`;
  }

  // ── Mise à jour, par disposition ─────────────────────────────────────────

  _updateColumns(resolved) {
    for (const period of this._periods()) {
      const parts = this._parts.periods[period];
      const attrs = this._common(period, resolved, parts);
      this._setMap(parts, resolved, period, attrs);
      this._setChips(parts.chips, attrs, resolved.sensors[period]);
      this._setComment(parts, attrs);
    }
  }

  _updateFocus(resolved) {
    const [main, ...rest] = this._periods();
    const parts = this._parts.periods[main];
    const attrs = this._common(main, resolved, parts);
    this._setMap(parts, resolved, main, attrs);

    // L'en-tête est posée sur l'image quand elle est là — sauf en thème plein
    // et à partir de l'orange, où elle redevient le bandeau coloré au-dessus
    // de la vignette : c'est tout l'objet de ce thème.
    const mapShown = parts.mapWrap.style.display !== "none";
    const banded =
      this._config.theme === "plein" && alerted(this._state(resolved, main)?.state);
    const overlaid = mapShown && !banded;
    parts.node.querySelector(".head.bare").style.display = overlaid ? "none" : "";
    parts.node.querySelector(".overlay").style.display = overlaid ? "" : "none";
    this._setChips(parts.chips, attrs, resolved.sensors[main]);
    this._setComment(parts, attrs);

    for (const period of rest) {
      const strip = this._parts.periods[period];
      const stripAttrs = this._common(period, resolved, strip);
      this._setIcons(strip.icons, stripAttrs);
    }
  }

  _updateCompact(resolved) {
    const periods = this._periods();
    const t = words(this._hass);
    for (const period of periods) {
      const parts = this._parts.periods[period];
      const attrs = this._common(period, resolved, parts);
      // Sur une seule période, la ligne porte le nom du département — c'est
      // alors un badge, et « Aujourd'hui » n'apprendrait rien.
      parts.label.textContent =
        periods.length === 1 && this._config.title === undefined
          ? resolved.name
          : t[period];
      this._setIcons(parts.icons, attrs);
    }
  }

  _updateChrono(resolved) {
    for (const period of this._periods()) {
      const parts = this._parts.periods[period];
      const attrs = this._common(period, resolved, parts);
      this._setTimeline(parts, attrs, resolved.sensors[period]);
    }
  }

  // ── Briques communes ─────────────────────────────────────────────────────

  /** En-tête, couleur de thème, ouverture de la fiche : vrai pour toutes. */
  _common(period, resolved, parts) {
    const sensorId = resolved.sensors[period];
    const state = sensorId ? this._hass.states[sensorId] : null;
    const attrs = state?.attributes || {};
    const level = LEVELS[state?.state] || null;

    // La couleur du bloc alimente les quatre thèmes : la pastille, la tranche
    // du bandeau, l'aplat du plein, l'anneau du sobre. Outre-mer, c'est la
    // teinte du niveau réel — le violet d'un confinement, le gris d'une phase
    // de sauvegarde — que le composant publie dans `color_hex`.
    const teinte = (attrs.color_native && safeHex(attrs.color_hex)) ||
      (level ? level.color : "var(--disabled-text-color)");
    parts.node.style.setProperty("--level-color", teinte);
    parts.node.classList.toggle("alerted", alerted(state?.state));

    // Toutes les pastilles du bloc : le focus en a deux — celle du bandeau et
    // celle posée sur la vignette — et une seule colorée serait un défaut vu.
    for (const dot of parts.node.querySelectorAll(".dot")) {
      dot.style.background = teinte;
    }
    for (const node of parts.node.querySelectorAll(".level")) {
      node.textContent = levelName(state?.state, this._hass, attrs);
    }

    // La consigne d'un niveau exceptionnel : dire « Violet » n'apprend rien à
    // qui ne connaît pas l'échelle antillaise, « Confinez-vous » si.
    const consigne =
      NATIVE_NOTICE[isFrench(this._hass) ? "fr" : "en"][attrs.color_native];
    // Sur l'image quand il y en a une, dans la ligne sinon : deux badges qui
    // disent la même sorte de chose ne doivent pas s'afficher à deux endroits.
    //
    // La décision se prend sur la configuration, non sur ce que le bloc
    // affiche déjà : cette méthode passe avant celle qui pose l'image, et
    // interroger le style ne dirait que l'état du rendu précédent.
    const surImage =
      Boolean(parts.mapWrap) &&
      this._config.show_map &&
      !["compact", "chronologie"].includes(this._config.layout);
    const fond = safeHex(attrs.color_hex) || "#e01f1f";
    for (const node of parts.node.querySelectorAll(".notice")) {
      const sien = node.classList.contains("on-map") ? surImage : !surImage;
      node.textContent = consigne || "";
      node.style.display = consigne && sien ? "" : "none";
      node.style.background = fond;
      node.style.color = readableInk(fond);
    }
    if (parts.stale) parts.stale.style.display = attrs.expired ? "" : "none";
    this._bindActions(parts.node, sensorId);

    return attrs;
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  // Les trois actions du frontend de Home Assistant — clic, appui long, double
  // clic — avec la même grammaire de configuration que les cartes livrées.
  // L'entité par défaut est celle de l'endroit cliqué, pas une entité unique :
  // la vignette ouvre la caméra, le bloc du jour ouvre le capteur.

  _runAction(actionConfig, entityId) {
    const config = actionConfig || {};
    const target = config.entity || entityId;

    switch (config.action || "more-info") {
      case "none":
        return;

      case "more-info":
        if (target) moreInfo(this, target);
        return;

      case "toggle":
        if (target) {
          this._hass.callService("homeassistant", "toggle", { entity_id: target });
        }
        return;

      case "navigate":
        if (!config.navigation_path) return;
        history.pushState(null, "", config.navigation_path);
        // Ce que le routeur de Lovelace écoute pour changer de vue sans
        // recharger la page.
        fireEvent(window, "location-changed", {});
        return;

      case "url":
        if (!config.url_path) return;
        if (config.new_tab === false) {
          window.open(config.url_path, "_self");
        } else {
          // noopener : l'onglet ouvert ne doit pas garder la main sur le
          // tableau de bord (window.opener). Pas en _self, où certains
          // navigateurs le traduiraient par « nouvelle fenêtre ».
          window.open(config.url_path, "_blank", "noopener");
        }
        return;

      // « call-service » est l'ancien nom de « perform-action » : les deux sont
      // acceptés, un tableau de bord écrit avant le renommage doit continuer.
      case "perform-action":
      case "call-service": {
        const name = config.perform_action || config.service;
        const [domain, service] = String(name || "").split(".");
        if (!domain || !service) return;
        this._hass.callService(
          domain,
          service,
          config.data || config.service_data || {},
          config.target
        );
        return;
      }

      default:
        // « fire-dom-event » et tout ce qui viendra : l'événement que les
        // greffons du tableau de bord écoutent.
        fireEvent(this, "ll-custom", config);
    }
  }

  /**
   * Brancher les trois actions sur un nœud.
   *
   * Le double clic n'est attendu que s'il mène quelque part : sinon chaque
   * simple clic serait retardé de 250 ms pour rien, et la carte paraîtrait
   * molle là où elle ne faisait qu'ouvrir une fiche.
   */
  _bindActions(node, entityId) {
    if (!node) return;
    node._mfvUnbind?.();

    const config = this._config;
    const wanted = (key) => config[ACTION_KEYS[key]] || DEFAULTS[ACTION_KEYS[key]];
    const doubled = (wanted("double").action || "none") !== "none";

    let holdTimer = null;
    let clickTimer = null;
    let held = false;

    // La vignette est dans le bloc du jour, et les deux portent des actions :
    // sans arrêter la remontée dès l'appui, un appui long sur l'image armerait
    // aussi celui du bloc, et les deux partiraient.
    const down = (event) => {
      event.stopPropagation();
      held = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        held = true;
        this._runAction(wanted("hold"), entityId);
      }, HOLD_MS);
    };
    const cancel = (event) => {
      event.stopPropagation();
      clearTimeout(holdTimer);
    };
    const click = (event) => {
      // La vignette est dans le bloc du jour : sans cela, cliquer l'image
      // déclencherait les deux.
      event.stopPropagation();
      clearTimeout(holdTimer);
      if (held) return;

      if (!doubled) {
        this._runAction(wanted("tap"), entityId);
        return;
      }
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        this._runAction(wanted("double"), entityId);
        return;
      }
      clickTimer = setTimeout(() => {
        clickTimer = null;
        this._runAction(wanted("tap"), entityId);
      }, DOUBLE_MS);
    };

    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup", cancel);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("pointerleave", cancel);
    node.addEventListener("click", click);
    node.style.cursor = "pointer";

    // Rebrancher sans empiler : la configuration change à chaque clic dans
    // l'éditeur, et les écouteurs d'avant doivent partir avec elle.
    node._mfvUnbind = () => {
      clearTimeout(holdTimer);
      clearTimeout(clickTimer);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", cancel);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("pointerleave", cancel);
      node.removeEventListener("click", click);
      node._mfvUnbind = null;
    };
  }

  _setMap(parts, resolved, period, attrs) {
    // Un territoire d'outre-mer n'a pas de vignette nationale : la carte
    // dessine sa silhouette, peinte de la couleur du bulletin.
    const shape = OM_SHAPES[attrs.domain];
    if (shape) {
      this._setShape(parts, attrs, shape, resolved.sensors[period]);
      return;
    }

    const mapId = resolved.maps[period];
    const map = mapId ? this._hass.states[mapId] : null;
    const picture = map?.attributes.entity_picture;
    // Masquée tant qu'aucune image n'est arrivée, ce que faisait la condition
    // de visibilité des `picture-entity`.
    const show = this._config.show_map && picture && map.state !== "unavailable";

    parts.mapWrap.style.display = show ? "" : "none";
    if (!show) return;

    if (parts.src !== picture) {
      parts.map.src = picture;
      // La même adresse pour le calque d'encre du thème sombre : c'est ce qui
      // rend le procédé gratuit, le navigateur ne retéléchargera rien.
      parts.mapWrap.style.setProperty("--map-src", `url("${picture}")`);
      parts.src = picture;
    }
    // La vignette porte les mêmes actions que le bloc, mais sur l'image :
    // « more-info » sans entité y ouvre la vignette, pas le capteur.
    this._bindActions(parts.map, mapId);
  }

  /**
   * La silhouette d'un territoire, peinte de sa couleur de vigilance.
   *
   * `color_hex` vient du composant : il porte la teinte du niveau réel —
   * le violet d'un confinement, le gris d'une phase de sauvegarde — là où la
   * couleur normalisée dirait seulement « rouge ».
   */
  _setShape(parts, attrs, shape, sensorId) {
    if (!this._config.show_map) {
      parts.mapWrap.style.display = "none";
      return;
    }
    parts.mapWrap.style.display = "";

    const colour = safeHex(attrs.color_hex) || "var(--disabled-text-color)";
    // Le domaine, pas la longueur du tracé : deux territoires pourraient un
    // jour partager la même, et la clé doit dire ce qu'elle identifie.
    const signature = `${attrs.domain}|${colour}`;
    if (parts.shapeSignature !== signature) {
      parts.shapeSignature = signature;
      parts.map.style.display = "none";
      let svg = parts.node.querySelector("svg.shape");
      if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "shape");
        svg.setAttribute("viewBox", "0 0 96 96");
        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        svg.appendChild(path);
        parts.mapWrap.insertBefore(svg, parts.mapWrap.firstChild);
      }
      const path = svg.querySelector("path");
      path.setAttribute("d", shape);
      path.setAttribute("fill", colour);
    }

    this._bindActions(parts.mapWrap, sensorId);
  }

  _phenomena(attrs) {
    const list = attrs.phenomena || [];
    return this._config.hide_green ? list.filter((p) => (p.color_id || 0) > 1) : list;
  }

  _setChips(container, attrs, sensorId) {
    if (!container) return;
    container.style.display = this._config.show_phenomena ? "" : "none";
    if (!this._config.show_phenomena) return;

    const shown = this._phenomena(attrs);
    const t = words(this._hass);

    if (!shown.length) {
      container.innerHTML = `<div class="empty">${t.nothing}</div>`;
      container.dataset.signature = "";
      return;
    }

    // Reconstruit seulement quand la liste change : sa signature suffit à le
    // savoir, et un bulletin ne bouge que deux fois par jour.
    const signature = shown.map((p) => `${p.phenomenon_id}:${p.color_id}`).join(",");
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;

    container.innerHTML = shown
      .map(
        (item) => `
        <div class="chip" style="--chip-color:${LEVELS[item.color]?.color || "var(--disabled-text-color)"}"
             title="${escapeHtml(item.phenomenon)} — ${escapeHtml(item.color_name || "?")}">
          <ha-icon icon="${escapeHtml(item.icon)}"></ha-icon><span>${escapeHtml(item.phenomenon)}</span>
        </div>`
      )
      .join("");

    // Les puces suivent les actions configurées, comme le reste du bloc :
    // cliquer un phénomène et cliquer à côté ne doivent pas faire deux choses
    // différentes.
    for (const chip of container.querySelectorAll(".chip")) {
      this._bindActions(chip, sensorId);
    }
  }

  /** Les icônes seules — ce que montrent le compact et le bandeau du focus. */
  _setIcons(container, attrs) {
    if (!container) return;
    if (!this._config.show_phenomena) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";

    // Seulement ce qui n'est pas vert : la pastille dit déjà « rien à signaler »,
    // et neuf icônes vertes ne se distinguent pas les unes des autres.
    const shown = (attrs.phenomena || []).filter((p) => (p.color_id || 0) > 1);
    const signature = shown.map((p) => `${p.phenomenon_id}:${p.color_id}`).join(",");
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;

    container.innerHTML = shown
      .map(
        (item) => `
        <ha-icon icon="${escapeHtml(item.icon)}"
                 title="${escapeHtml(item.phenomenon)} — ${escapeHtml(item.color_name || "?")}"
                 style="color:${LEVELS[item.color]?.color || "currentColor"}"></ha-icon>`
      )
      .join("");
  }

  /**
   * La barre de 24 heures. Chaque créneau est positionné dans la fenêtre de
   * validité de la période, en pourcentage : les trous — un phénomène qui
   * n'est pas suivi toute la journée — restent visibles en gris plutôt que
   * d'être comblés par la couleur du créneau voisin.
   */
  _setTimeline(parts, attrs, sensorId) {
    const t = words(this._hass);
    const begin = attrs.begin_time ? new Date(attrs.begin_time).getTime() : null;
    const end = attrs.end_time ? new Date(attrs.end_time).getTime() : null;
    const span = begin && end && end > begin ? end - begin : null;

    const all = attrs.phenomena || [];
    const active = all.filter((p) => (p.color_id || 0) > 1);
    const quiet = all.filter((p) => (p.color_id || 0) <= 1);
    // Rien d'actif : la barre par phénomène n'apprendrait rien, on l'annonce
    // en une ligne.
    const shown = active.length ? active : [];

    const signature = `${begin}|${span}|${all
      .map((p) => `${p.phenomenon_id}:${p.color_id}:${(p.timeline || []).length}`)
      .join(",")}`;
    if (parts.rows.dataset.signature !== signature) {
      parts.rows.dataset.signature = signature;
      parts.rows.innerHTML = shown
        .map((item) => {
          const slots = (span ? item.timeline || [] : [])
            .map((slot) => {
              const from = slot.begin_time ? new Date(slot.begin_time).getTime() : null;
              const to = slot.end_time ? new Date(slot.end_time).getTime() : null;
              if (!from || !to || to <= from) return "";
              const left = Math.max(0, ((from - begin) / span) * 100);
              const width = Math.min(100 - left, ((to - from) / span) * 100);
              if (width <= 0) return "";
              return `<i style="left:${left}%;width:${width}%;background:${
                LEVELS[slot.color]?.color || "var(--disabled-text-color)"
              }"></i>`;
            })
            .join("");

          return `
            <div class="tl-row">
              <ha-icon icon="${escapeHtml(item.icon)}"
                       style="color:${LEVELS[item.color]?.color || "currentColor"}"></ha-icon>
              <div class="tl-body">
                <div class="tl-name">
                  <span>${escapeHtml(item.phenomenon)}</span>
                  <span>${escapeHtml(item.color_name || "")} ${hour(item.begin_time, this._hass)} – ${hour(
                    item.end_time,
                    this._hass
                  )}</span>
                </div>
                <div class="tl-bar">${slots}</div>
              </div>
            </div>`;
        })
        .join("");
    }

    // L'échelle porte les vraies heures de la période, pas un 0–24 h de
    // convenance : la journée « demain » couvre 22 h → 22 h.
    if (span) {
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
        hour(new Date(begin + span * ratio), this._hass)
      );
      parts.scale.innerHTML = ticks.map((tick) => `<span>${tick}</span>`).join("");
      parts.scale.style.display = shown.length ? "" : "none";
    } else {
      parts.scale.style.display = "none";
    }

    const rest = quiet.map((p) => p.phenomenon).join(", ");
    const message = shown.length
      ? rest && t.quiet.replace("%s", rest)
      : t.allGreen;
    parts.quiet.style.display = message ? "" : "none";
    parts.quiet.textContent = message || "";

    this._bindActions(parts.rows, sensorId);
  }

  _setComment(parts, attrs) {
    if (!parts.comment) return;
    const comment = this._config.show_comment ? attrs.comment : null;
    parts.comment.style.display = comment ? "" : "none";
    parts.comment.textContent = comment || "";
  }

  static get styles() {
    return `
      /* La carte remplit la hauteur que la vue lui accorde — en vue
         « sections », celle que l'utilisateur règle à la poignée — et son
         contenu s'y ajuste au lieu de déborder. */
      :host { display: block; min-width: 0; }
      ha-card {
        padding: 12px; overflow: hidden;
        height: 100%; box-sizing: border-box;
        display: flex; flex-direction: column;
        /* Sans quoi rien ne se resserre : un élément flex refuse de descendre
           sous la largeur de son contenu, et la carte déborde des deux côtés
           dans un panneau latéral ou sur un téléphone. */
        min-width: 0;
      }
      .body { flex: 1 1 auto; min-height: 0; min-width: 0; }
      /* Sans vignette pour absorber le manque de place, le contenu défile
         plutôt que d'être coupé : sur une carte d'alerte, ne pas savoir ce
         qu'on ne voit pas est le pire des défauts. */
      .layout-chronologie .body, .layout-compact .body {
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .period, .head, .chips, .grid, .focus, .compact, .chrono { min-width: 0; }
      .grid, .focus, .compact, .chrono { height: 100%; min-height: 0; }
      .title {
        font-size: var(--ha-card-header-font-size, 24px);
        font-weight: 400;
        color: var(--ha-card-header-color, var(--primary-text-color));
        padding: 4px 4px 12px;
        /* « Vigilance Saint-Martin et Saint-Barthélemy » doit pouvoir passer
           à la ligne plutôt que d'élargir la carte. */
        overflow-wrap: anywhere;
      }
      .error { padding: 8px; color: var(--error-color); }

      /* ── Blocs communs ──────────────────────────────────────────────── */
      .period {
        display: flex; flex-direction: column; gap: 8px; cursor: pointer;
        /* Sans quoi un bloc flex refuse de se réduire sous la taille de son
           contenu, et la carte déborde au lieu de tenir dans sa hauteur. */
        min-height: 0;
      }
      /* La vignette est la seule à céder de la place : elle prend ce qui
         reste une fois l'en-tête et les puces servis, et se réduit en gardant
         son format carré. C'est ce qui évite d'avoir à faire défiler. */
      .period .map-wrap { flex: 1 1 auto; min-height: 0; }
      .period .head, .period .chips, .period .comment { flex: 0 0 auto; }
      .head {
        display: flex; align-items: center; gap: 8px; min-width: 0;
        /* Dans une colonne étroite, la ligne passe à deux plutôt que de
           pousser le niveau hors du cadre. */
        flex-wrap: wrap; row-gap: 4px;
      }
      /* Quand la place manque, le nom du jour cède le premier : la couleur et
         les phénomènes portent l'information, pas le mot « Aujourd'hui ». */
      .head .label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      /* Le niveau peut disparaître avant les icônes : la pastille dit déjà la
         couleur. */
      .head .level { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .dot {
        width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22);
      }
      .label { font-weight: 500; color: var(--primary-text-color); }
      .level { margin-left: auto; font-size: 0.9em; color: var(--secondary-text-color); }
      .icon-row {
        display: flex; align-items: center; gap: 4px;
        /* Une tempête peut déclencher six phénomènes : la rangée se replie
           plutôt que de pousser le reste hors du cadre. */
        flex-wrap: wrap; justify-content: flex-end;
      }
      .icon-row ha-icon { --mdc-icon-size: 18px; }
      /* isolation enferme le mélange du calque d'encre ci-dessous : sans elle,
         mix-blend-mode irait chercher le fond du tableau de bord. */
      .map-wrap {
        position: relative; isolation: isolate;
        /* La vignette de Météo France est carrée : le conteneur l'est aussi,
           et se borne en hauteur pour tenir dans la place accordée. Ainsi le
           masque de l'encart parisien et le calque d'encre du thème sombre,
           tous deux posés en pourcentages, restent alignés sur l'image. */
        aspect-ratio: 1 / 1;
        /* Deux bornes, même effet : l'option map_width de l'utilisateur, et
           la hauteur que la disposition laisse. La plus contraignante gagne,
           et le format carré reste tenu. */
        max-width: var(--mfv-map-width, none);
        max-height: var(--mfv-map-height, none);
        margin-inline: auto;
      }
      /* La silhouette d'un territoire d'outre-mer, dessinée faute de
         vignette officielle. Même encombrement qu'une image, pour que les
         deux dispositions se comportent pareil. */
      /* La silhouette d'un territoire n'a pas à occuper un carré : la
         Guadeloupe et les îles du Nord y flottent, alors que la Guyane le
         remplit. Une hauteur fixe les met toutes à la même échelle
         apparente, et laisse la carte garder la hauteur de ses voisines.

         Le cadre prend toute la largeur disponible, sans quoi il se
         resserrerait autour du dessin : le badge, qui se cale sur lui,
         paraîtrait alors flotter au milieu plutôt que dans le coin. */
      .map-wrap:has(svg.shape) {
        aspect-ratio: auto;
        /* Une hauteur souhaitée, non imposée : quand la vue est basse, la
           silhouette cède comme le ferait une vignette, au lieu de chasser
           les phénomènes qu'elle illustre. */
        height: var(--mfv-shape-height, 190px);
        min-height: 90px;
        max-height: var(--mfv-shape-height, 190px);
        flex: 1 1 auto;
        width: 100%;
        /* L'option de largeur vaut aussi ici : elle était annulée, et le
           curseur de l'éditeur ne faisait rien sur un territoire. */
        max-width: var(--mfv-map-width, none);
        margin-inline: 0;
      }
      svg.shape {
        width: 100%; height: 100%; display: block;
        padding: 4px;
        box-sizing: border-box;
      }
      /* En focus, la silhouette prend la place que la vignette occuperait. */
      .layout-focus .map-wrap:has(svg.shape) { height: var(--mfv-shape-height, 280px); }
      img.map {
        width: 100%; height: 100%; display: block;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--secondary-background-color);
        object-fit: contain;
      }

      /* ── L'encre de la vignette en thème sombre ──────────────────────────
         Le PNG de Météo-France est transparent et son encre est noire :
         l'encart « Paris · Petite couronne », les numéros de départements et
         les frontières sont dessinés pour du papier blanc. Sur fond sombre,
         ils disparaissent.

         Repeindre le fond en blanc réglerait le texte mais sortirait la
         vignette du thème. Un invert() sur l'image entière abîmerait les
         couleurs officielles — le jaune #f2d600 en ressort brun #583c00.

         Alors on superpose la MÊME image (donc rien de plus à télécharger :
         le navigateur la sert depuis son cache) réduite à sa seule encre :
           invert + grayscale  → l'encre devient claire, les aplats sombres
           brightness + contrast → seuil dur, il ne reste que l'encre en blanc
         et on la pose en screen, où le noir est neutre : seul le blanc
         s'ajoute. Les aplats de vigilance dessous ne sont pas touchés. */
      .map-wrap::after {
        content: "";
        position: absolute; inset: 0;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--map-src) center / 100% 100% no-repeat;
        filter: invert(1) grayscale(1) brightness(0.6) contrast(20);
        mix-blend-mode: screen;
        pointer-events: none;
        display: none;
      }
      .dark .map-wrap::after { display: block; }

      /* ── Le masque du libellé de l'encart Paris ──────────────────────────
         Le texte est dans le PNG : on ne peut pas l'enlever, seulement le
         recouvrir. Le masque est peint dans la couleur du fond de la vignette,
         qui est unie : il ne se voit donc pas comme un rectangle rapporté,
         mais comme du vide — et il suit le thème sans rien de plus.

         Posé au-dessus du calque d'encre, sinon l'encre blanchie de l'encart
         traverserait le masque. Sous la pastille « périmé » et sous la
         surimpression du focus, qui doivent rester lisibles. */
      .inset-mask {
        position: absolute;
        left: var(--inset-left, ${INSET_BOX.left});
        top: var(--inset-top, ${INSET_BOX.top});
        width: var(--inset-width, ${INSET_BOX.width});
        height: var(--inset-height, ${INSET_BOX.height});
        background: var(--secondary-background-color);
        z-index: 1;
        display: none;
      }
      .hide-inset .inset-mask { display: block; }

      /* Au-dessus du calque d'encre et du masque : ils portent leur propre
         couleur et n'ont rien à voir avec la vignette. */
      .stale, .overlay { z-index: 2; }

      /* La consigne d'un niveau exceptionnel, à côté du jour : elle doit se
         voir sans écraser le reste, et vaut dans toutes les dispositions —
         y compris la compacte, qui n'a pas de vignette où poser un badge. */
      /* La consigne et le « bulletin périmé » disent la même sorte de chose —
         une mise en garde qui prime sur le reste — et se ressemblent donc :
         même taille, même arrondi, même épaisseur. Seules la place et la
         couleur les distinguent. */
      .notice, .stale {
        /* Les mêmes proportions que les puces de phénomènes, qui se lisent
           juste en dessous : même hauteur de texte, même arrondi, même
           épaisseur. Une bordure transparente tient la place de celle des
           puces, pour que les hauteurs coïncident au pixel près. */
        display: inline-flex; align-items: center;
        padding: 3px 10px; border-radius: 16px;
        border: 1px solid transparent;
        font-size: 0.8em; line-height: 1.4; font-weight: 600;
        letter-spacing: 0.01em; white-space: nowrap;
      }
      /* Posée sur l'image, la consigne se lit en bas à gauche — le badge
         « périmé » occupe le haut, et les deux ne se rencontrent jamais. */
      .notice.on-map {
        position: absolute;
        /* Au bord du bloc, comme les puces de phénomènes juste en dessous :
           un décalage, même de huit pixels, se voit quand deux rangées se
           suivent. Le badge « périmé », lui, garde sa marge — il est seul en
           haut de l'image, et un texte clair collé au bord se lirait mal. */
        bottom: 6px; left: 0;
        z-index: 2;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
      }
      /* Sans image, elle reprend sa place dans la ligne, après le nom
         qu'elle qualifie. */
      .notice.inline { margin-right: auto; }

      /* En compact, la ligne porte le nom du domaine, qui peut être long —
         « Saint-Martin et Saint-Barthélemy » tient mal à côté d'une consigne
         et de trois icônes. Le nom cède donc la place le premier, en
         s'abrégeant, plutôt que de rejeter les icônes à la ligne suivante. */
      /* La ligne compacte se replie elle aussi quand la place manque : mieux
         vaut deux lignes qu'un nom réduit à trois lettres. */
      .compact .head { flex-wrap: wrap; row-gap: 4px; }
      .compact .label {
        flex: 1 1 6em;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* La consigne ne se comprime pas : elle porte une consigne de sécurité.
         Le niveau et les icônes, eux, cèdent — la pastille et les puces disent
         déjà l'essentiel. Une seule marge automatique dans la ligne, sinon les
         deux se partagent l'espace et écartent le badge de son nom. */
      .compact .notice { flex: 0 0 auto; margin-right: 0; }
      .compact .level { flex: 0 1 auto; }
      .compact .icon-row { flex: 0 1 auto; min-width: 0; overflow: hidden; }

      .stale {
        position: absolute; top: 8px; left: 8px;
        z-index: 2;
        color: #fff;
        background: var(--error-color, #e01f1f);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
      }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
      /* « Vagues-submersion » est plus large qu'une colonne étroite : la puce
         se resserre sur son texte plutôt que de dépasser du bloc. */
      .chip { min-width: 0; max-width: 100%; }
      .chip span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 10px 3px 6px;
        border-radius: 16px;
        font-size: 0.8em; line-height: 1.4;
        color: var(--primary-text-color);
        /* Le fond reprend la couleur de vigilance, très atténué : lisible sur
           un thème clair comme sur un thème sombre, là où la couleur pleine ne
           l'est sur aucun des deux. */
        background: color-mix(in srgb, var(--chip-color) 18%, transparent);
        border: 1px solid color-mix(in srgb, var(--chip-color) 55%, transparent);
      }
      .chip ha-icon { --mdc-icon-size: 16px; color: var(--chip-color); }

      /* Au doigt, une icône de dix-huit pixels se rate. On agrandit la zone
         sensible sans toucher au dessin : la marge négative reprend ce que le
         remplissage ajoute. */
      @media (pointer: coarse) {
        .icon-row { gap: 10px; }
        .icon-row ha-icon { padding: 8px; margin: -8px; }
        .chip { padding-block: 8px; margin-block: -5px; }
        .tl-row { padding: 9px 0; margin-block: -5px; }
      }
      .empty, .comment, .foot, .tl-quiet {
        font-size: 0.8em; color: var(--secondary-text-color);
      }
      .foot:not(:empty) { padding-top: 10px; text-align: right; }

      /* ── Disposition : duo ──────────────────────────────────────────── */
      .grid {
        display: grid; gap: 12px;
        /* Deux colonnes quand la place le permet, une seule sinon : la carte
           est souvent posée dans une colonne étroite de tableau de bord.
           Le seuil tient compte de ce qu'une colonne doit contenir — une
           vignette, un en-tête et des puces —, non de la seule vignette. */
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      }

      /* ── Disposition : focus ────────────────────────────────────────── */
      .focus { display: flex; flex-direction: column; gap: 10px; }
      .focus .overlay {
        position: absolute; left: 0; right: 0; bottom: 0;
        display: flex; align-items: center; gap: 8px;
        padding: 24px 10px 8px;
        border-radius: 0 0 var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px);
        background: linear-gradient(to top, rgba(0, 0, 0, 0.62), transparent);
      }
      .focus .overlay .label { color: #fff; }
      .focus .overlay .level { color: rgba(255, 255, 255, 0.82); }
      .focus .strip { border-top: 1px solid var(--divider-color); padding-top: 8px; }
      .focus .strip .icon-row { margin-left: 8px; }

      /* ── Disposition : compact ──────────────────────────────────────── */
      .compact { display: flex; flex-direction: column; gap: 6px; }
      .compact .level { margin-left: 0; }
      .compact .icon-row { margin-left: auto; }
      /* La classe est portée par la carte elle-même : une ligne n'a pas besoin
         des douze pixels que réclame une vignette. */
      ha-card.layout-compact { padding: 10px 14px; }

      /* ── Disposition : chronologie ──────────────────────────────────── */
      .chrono { display: flex; flex-direction: column; gap: 14px; }
      .rows { display: flex; flex-direction: column; gap: 2px; }
      .tl-row { display: grid; grid-template-columns: 20px 1fr; gap: 8px; align-items: center; padding: 4px 0; }
      .tl-row ha-icon { --mdc-icon-size: 18px; }
      .tl-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .tl-name {
        display: flex; justify-content: space-between; gap: 8px;
        font-size: 0.82em; min-width: 0;
      }
      /* L'heure de l'alerte est ce qu'on vient chercher : c'est le nom du
         phénomène qui s'abrège, jamais elle. */
      .tl-name > span:first-child {
        min-width: 0; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tl-name span:last-child {
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .tl-bar {
        position: relative; height: 7px; border-radius: 4px; overflow: hidden;
        background: var(--divider-color, #e0e0e0);
      }
      .tl-bar > i { position: absolute; top: 0; bottom: 0; display: block; }
      .tl-scale {
        display: flex; justify-content: space-between;
        font-size: 0.68em; color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        padding-left: 28px;
      }

      /* ── Thème : bandeau ────────────────────────────────────────────── */
      /* Une seule couleur, sur la tranche. Les puces redeviennent neutres :
         seules leurs icônes restent teintées. */
      .theme-bandeau .period {
        border-left: 3px solid var(--level-color, var(--divider-color));
        padding-left: 10px;
      }
      .theme-bandeau .chip {
        background: transparent;
        border-color: var(--divider-color);
      }

      /* ── Thème : plein ──────────────────────────────────────────────── */
      /* Seulement à partir de l'orange : en vert et en jaune, la carte reste
         celle de tous les jours. */
      .theme-plein .period.alerted {
        background: color-mix(in srgb, var(--level-color) 13%, transparent);
        border-radius: var(--ha-card-border-radius, 12px);
        padding: 8px;
      }
      .theme-plein .period.alerted > .head {
        margin: -8px -8px 0;
        padding: 6px 10px;
        border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0;
        background: var(--level-color);
      }
      .theme-plein .period.alerted > .head .label { color: #fff; font-weight: 600; }
      .theme-plein .period.alerted > .head .level { color: rgba(255, 255, 255, 0.85); }
      .theme-plein .period.alerted > .head .dot { display: none; }
      .theme-plein .period.alerted .chip { background: var(--card-background-color); }

      /* ── Thème : sobre ──────────────────────────────────────────────── */
      /* Aucun aplat : un anneau, un soulignement, une icône teintée. */
      .theme-sobre .dot {
        background: transparent !important;
        box-shadow: inset 0 0 0 2px var(--level-color, var(--disabled-text-color));
      }
      .theme-sobre .chip {
        background: transparent;
        border: 0;
        border-bottom: 2px solid var(--chip-color);
        border-radius: 0;
        padding: 2px 2px 3px;
      }
    `;
  }
}

/* ══ ÉDITEUR ═══════════════════════════════════════════════════════════════
 * Les seize combinaisons se choisissent en vignettes plutôt qu'en listes
 * déroulantes : une disposition se reconnaît à sa silhouette, pas à son nom.
 * Chaque vignette est un schéma dessiné en CSS — le vrai rendu, lui, est déjà
 * dans l'aperçu que Home Assistant affiche à côté de l'éditeur, et qui se met
 * à jour au clic.
 */
class MeteoFranceVigilanceCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    // Une fois l'éditeur monté, `hass` est réaffecté à chaque changement d'état
    // de la maison. Repasser par `_render` réécrirait `data` du formulaire sous
    // les doigts de qui est en train de saisir un titre.
    if (this._form) {
      this._form.hass = hass;
      return;
    }
    this._render();
  }

  _emit(changes) {
    this._config = { ...this._config, ...changes };
    fireEvent(this, "config-changed", { config: this._config });
    this._paint();
  }

  _schema(t) {
    return [
      {
        name: "entity",
        required: true,
        // Restreint aux capteurs de cette intégration : les caméras et les
        // capteurs des autres composants n'ont rien à faire dans cette liste.
        selector: { entity: { integration: INTEGRATION, domain: "sensor" } },
      },
      { name: "title", selector: { text: {} } },
      {
        name: "periods",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "both", label: t.both },
              { value: "today", label: t.today },
              { value: "tomorrow", label: t.tomorrow },
            ],
          },
        },
      },
      {
        type: "grid",
        schema: [
          { name: "show_map", selector: { boolean: {} } },
          { name: "show_phenomena", selector: { boolean: {} } },
          { name: "show_comment", selector: { boolean: {} } },
          { name: "hide_green", selector: { boolean: {} } },
          { name: "alert_only", selector: { boolean: {} } },
          { name: "hide_map_inset", selector: { boolean: {} } },
        ],
      },
      {
        name: "map_width",
        selector: {
          number: { min: 100, max: 500, step: 10, mode: "box", unit_of_measurement: "px" },
        },
      },
      // `ui_action` est le sélecteur d'action du frontend : on hérite de son
      // formulaire complet — service, cible, navigation, URL — sans le récrire.
      // La liste est restreinte à ce que la carte sait vraiment faire : offrir
      // « assist » pour ne rien déclencher serait pire que ne pas l'offrir.
      { name: "tap_action", selector: { ui_action: { actions: ACTIONS } } },
      { name: "hold_action", selector: { ui_action: { actions: ACTIONS } } },
      { name: "double_tap_action", selector: { ui_action: { actions: ACTIONS } } },
    ];
  }

  _render() {
    if (!this._hass || !this._config) return;
    const t = words(this._hass);

    if (!this._built) {
      this.innerHTML = `
        <style>${MeteoFranceVigilanceCardEditor.styles}</style>
        <div class="mfv-editor">
          <div class="mfv-group" data-key="layout">
            <div class="mfv-legend">${t.layout}</div>
            <div class="mfv-picker">
              ${LAYOUTS.map(
                (value) => `
                <button type="button" class="mfv-option" data-value="${value}"
                        title="${escapeHtml(t.layoutHint[value])}">
                  <span class="mfv-thumb mfv-thumb-${value}">${LAYOUT_THUMBS[value]}</span>
                  <span class="mfv-name">${value}</span>
                </button>`
              ).join("")}
            </div>
            <div class="mfv-hint" data-hint="layout"></div>
          </div>

          <div class="mfv-group" data-key="theme">
            <div class="mfv-legend">${t.theme}</div>
            <div class="mfv-picker">
              ${THEMES.map(
                (value) => `
                <button type="button" class="mfv-option" data-value="${value}"
                        title="${escapeHtml(t.themeHint[value])}">
                  <span class="mfv-thumb mfv-thumb-${value}">${THEME_THUMBS[value]}</span>
                  <span class="mfv-name">${value}</span>
                </button>`
              ).join("")}
            </div>
            <div class="mfv-hint" data-hint="theme"></div>
          </div>
        </div>`;

      for (const group of this.querySelectorAll(".mfv-group")) {
        const key = group.dataset.key;
        for (const option of group.querySelectorAll(".mfv-option")) {
          option.addEventListener("click", () =>
            this._emit({ [key]: option.dataset.value })
          );
        }
      }

      this._form = document.createElement("ha-form");
      this._form.computeLabel = (schema) =>
        ({
          entity: t.entity,
          title: t.title,
          periods: t.periods,
          show_map: t.showMap,
          show_phenomena: t.showPhenomena,
          show_comment: t.showComment,
          hide_green: t.hideGreen,
          alert_only: t.alertOnly,
          hide_map_inset: t.hideMapInset,
          map_width: t.mapWidth,
          tap_action: t.tapAction,
          hold_action: t.holdAction,
          double_tap_action: t.doubleTapAction,
        })[schema.name] || schema.name;
      this._form.addEventListener("value-changed", (event) => {
        // Le formulaire ne connaît pas les vignettes : ses valeurs sont
        // fusionnées, jamais substituées à la configuration entière.
        this._config = { ...this._config, ...event.detail.value };
        fireEvent(this, "config-changed", { config: this._config });
      });
      this.querySelector(".mfv-editor").appendChild(this._form);
      this._built = true;
    }

    this._form.hass = this._hass;
    this._form.schema = this._schema(t);
    this._form.data = this._config;
    this._paint();
  }

  /** Marquer la vignette retenue et afficher sa phrase d'explication. */
  _paint() {
    const t = words(this._hass);
    for (const group of this.querySelectorAll(".mfv-group")) {
      const key = group.dataset.key;
      const value = this._config[key];
      for (const option of group.querySelectorAll(".mfv-option")) {
        option.classList.toggle("selected", option.dataset.value === value);
      }
      const hint = group.querySelector(".mfv-hint");
      hint.textContent =
        (key === "layout" ? t.layoutHint : t.themeHint)[value] || "";
    }
  }

  static get styles() {
    return `
      .mfv-editor { display: flex; flex-direction: column; gap: 18px; }
      .mfv-group { display: flex; flex-direction: column; gap: 8px; }
      .mfv-legend {
        font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em;
        color: var(--secondary-text-color);
      }
      .mfv-picker {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
        gap: 8px;
      }
      .mfv-option {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 8px 4px 6px;
        border: 1px solid var(--divider-color);
        border-radius: 10px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
      }
      .mfv-option:hover { border-color: var(--primary-color); }
      .mfv-option:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
      .mfv-option.selected {
        border-color: var(--primary-color);
        box-shadow: inset 0 0 0 1px var(--primary-color);
      }
      .mfv-name { font-size: 0.72rem; color: var(--secondary-text-color); }
      .mfv-option.selected .mfv-name { color: var(--primary-color); font-weight: 500; }
      /* Deux lignes réservées : la phrase la plus longue ne doit pas faire
         sauter le formulaire qui la suit à chaque clic sur une vignette. */
      .mfv-hint {
        font-size: 0.78rem; color: var(--secondary-text-color);
        min-height: 2.6em; line-height: 1.3;
      }

      /* Les schémas : des rectangles, pas des captures. Ils disent la
         silhouette de la disposition, ce qu'un nom ne dit pas. */
      .mfv-thumb {
        display: block; width: 56px; height: 38px;
        border-radius: 5px;
        background: var(--secondary-background-color);
        padding: 4px;
        box-sizing: border-box;
      }
      .mfv-thumb svg { width: 100%; height: 100%; display: block; }
      .mfv-thumb .fill { fill: var(--disabled-text-color); }
      .mfv-thumb .line { fill: var(--secondary-text-color); }
      .mfv-thumb .warn { fill: #f28c00; }
      .mfv-thumb .ok { fill: #2e9e37; }
    `;
  }
}

/* Schémas des dispositions : deux vignettes côte à côte, une grande et une
 * barre, une ligne seule, des barres horizontales. */
const LAYOUT_THUMBS = {
  duo: `<svg viewBox="0 0 48 30">
      <rect class="fill" x="0" y="0" width="22" height="16" rx="2"/>
      <rect class="fill" x="26" y="0" width="22" height="16" rx="2"/>
      <rect class="warn" x="0" y="19" width="10" height="4" rx="2"/>
      <rect class="ok" x="12" y="19" width="8" height="4" rx="2"/>
      <rect class="ok" x="26" y="19" width="9" height="4" rx="2"/>
      <rect class="ok" x="37" y="19" width="7" height="4" rx="2"/>
    </svg>`,
  focus: `<svg viewBox="0 0 48 30">
      <rect class="fill" x="0" y="0" width="48" height="18" rx="2"/>
      <rect class="warn" x="0" y="21" width="11" height="4" rx="2"/>
      <rect class="ok" x="13" y="21" width="9" height="4" rx="2"/>
      <circle class="ok" cx="42" cy="23" r="2.5"/>
      <rect class="line" x="26" y="21.5" width="12" height="3" rx="1.5"/>
    </svg>`,
  compact: `<svg viewBox="0 0 48 30">
      <circle class="warn" cx="4" cy="9" r="3"/>
      <rect class="line" x="10" y="7" width="20" height="4" rx="2"/>
      <circle class="warn" cx="40" cy="9" r="2.5"/>
      <circle class="ok" cx="46" cy="9" r="2.5"/>
      <circle class="ok" cx="4" cy="21" r="3"/>
      <rect class="line" x="10" y="19" width="16" height="4" rx="2"/>
      <circle class="ok" cx="46" cy="21" r="2.5"/>
    </svg>`,
  chronologie: `<svg viewBox="0 0 48 30">
      <circle class="warn" cx="3.5" cy="5" r="3"/>
      <rect class="fill" x="10" y="3" width="38" height="4" rx="2"/>
      <rect class="warn" x="10" y="3" width="16" height="4" rx="2"/>
      <circle class="warn" cx="3.5" cy="15" r="3"/>
      <rect class="fill" x="10" y="13" width="38" height="4" rx="2"/>
      <rect class="warn" x="24" y="13" width="12" height="4" rx="2"/>
      <circle class="ok" cx="3.5" cy="25" r="3"/>
      <rect class="fill" x="10" y="23" width="38" height="4" rx="2"/>
      <rect class="ok" x="10" y="23" width="38" height="4" rx="2"/>
    </svg>`,
};

/* Schémas des thèmes : la même carte, quatre traitements de la couleur. */
const THEME_THUMBS = {
  officiel: `<svg viewBox="0 0 48 30">
      <circle class="warn" cx="4" cy="5" r="3"/>
      <rect class="line" x="10" y="3" width="20" height="4" rx="2"/>
      <rect class="warn" x="0" y="13" width="20" height="7" rx="3.5" opacity="0.35"/>
      <rect class="ok" x="23" y="13" width="16" height="7" rx="3.5" opacity="0.35"/>
      <rect class="warn" x="0" y="23" width="14" height="5" rx="2.5" opacity="0.35"/>
    </svg>`,
  bandeau: `<svg viewBox="0 0 48 30">
      <rect class="warn" x="0" y="0" width="4" height="30" rx="2"/>
      <circle class="warn" cx="12" cy="5" r="3"/>
      <rect class="line" x="18" y="3" width="18" height="4" rx="2"/>
      <rect class="fill" x="8" y="13" width="20" height="7" rx="3.5" opacity="0.4"/>
      <rect class="fill" x="31" y="13" width="15" height="7" rx="3.5" opacity="0.4"/>
    </svg>`,
  plein: `<svg viewBox="0 0 48 30">
      <rect class="warn" x="0" y="0" width="48" height="30" rx="3" opacity="0.16"/>
      <rect class="warn" x="0" y="0" width="48" height="9" rx="3"/>
      <rect class="fill" x="4" y="14" width="19" height="6" rx="3" opacity="0.55"/>
      <rect class="fill" x="26" y="14" width="16" height="6" rx="3" opacity="0.55"/>
    </svg>`,
  sobre: `<svg viewBox="0 0 48 30">
      <circle cx="4" cy="5" r="3" fill="none" stroke="#f28c00" stroke-width="1.6"/>
      <rect class="line" x="10" y="3" width="20" height="4" rx="2"/>
      <rect class="line" x="0" y="14" width="18" height="3" rx="1.5" opacity="0.7"/>
      <rect class="warn" x="0" y="19" width="18" height="2" rx="1"/>
      <rect class="line" x="24" y="14" width="14" height="3" rx="1.5" opacity="0.7"/>
      <rect class="ok" x="24" y="19" width="14" height="2" rx="1"/>
    </svg>`,
};

if (!customElements.get(CARD_NAME)) {
  customElements.define(CARD_NAME, MeteoFranceVigilanceCard);
  customElements.define(EDITOR_NAME, MeteoFranceVigilanceCardEditor);
}

// Inscription au sélecteur de cartes : sans cela la carte existe mais reste
// introuvable autrement qu'en tapant son type à la main.
// Ici `hass` n'existe pas encore : c'est la langue du navigateur qui décide.
const loadWords = words(null);

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === CARD_NAME)) {
  window.customCards.push({
    type: CARD_NAME,
    name: loadWords.cardName,
    description: loadWords.cardDescription,
    preview: true,
    documentationURL: "https://vigilance.meteofrance.fr/fr",
  });
}

console.info(
  `%c MÉTÉO-FRANCE-VIGILANCE-CARD %c ${loadWords.loaded} `,
  "color:#fff;background:#f28c00;font-weight:700",
  "color:#f28c00;background:transparent"
);
