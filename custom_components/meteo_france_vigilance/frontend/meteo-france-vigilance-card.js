/*!
 * meteo-france-vigilance-card — la vigilance d'un département, aujourd'hui et
 * demain : la vignette nationale, la couleur du département, et les phénomènes
 * qui la justifient.
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
 * le capteur de demain et les deux caméras — par l'identifiant d'entrée que
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
const ALERT_LEVEL = 3;

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
      "Vigilance d'un département : carte nationale, couleur et phénomènes, aujourd'hui et demain.",
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
    tapAction: "Au clic",
    holdAction: "À l'appui long",
    doubleTapAction: "Au double clic",
    layoutHint: {
      duo: "Deux colonnes, aujourd'hui et demain : chacune sa vignette nationale et ses phénomènes.",
      focus: "Une seule grande vignette, aujourd'hui, nom et niveau en surimpression. Demain tient sur une ligne.",
      compact: "Aucune vignette : une ligne par jour, icônes des phénomènes à droite. Pour empiler des départements.",
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
      "One department's vigilance: national map, level and phenomena, today and tomorrow.",
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
    tapAction: "Tap action",
    holdAction: "Hold action",
    doubleTapAction: "Double tap action",
    layoutHint: {
      duo: "Two columns, today and tomorrow: each with its national map and its phenomena.",
      focus: "One large map, today, name and level overlaid. Tomorrow fits on a single line.",
      compact: "No map: one line per day, phenomenon icons on the right. For stacking departments.",
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

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const levelName = (state, hass) => {
  const level = LEVELS[state];
  return level ? level[isFrench(hass) ? "fr" : "en"] : "—";
};

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

    // Une caméra désignée renvoie au capteur du même département : la carte se
    // configure avec un capteur, mais on ne peut pas reprocher à quelqu'un
    // d'avoir cliqué sur la vignette.
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
    const rows = {
      compact: 1,
      chronologie: 4,
      focus: this._config.show_map ? 6 : 2,
      duo: this._config.show_map ? 5 : 2,
    }[this._config.layout];
    return { columns: 12, min_columns: 6, rows };
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

    const found = { key, sensors: {}, cameras: {} };

    for (const [id, state] of Object.entries(hass.states)) {
      const attrs = state.attributes;
      if (attrs.entry_id !== entryId) continue;

      if (id.startsWith("sensor.") && attrs.department === department) {
        found.sensors[attrs.period] = id;
      } else if (id.startsWith("camera.") && attrs.integration === INTEGRATION) {
        found.cameras[attrs.period] = id;
      }
    }

    // Le capteur donné fait foi même si la boucle ne l'a pas reconnu : une
    // carte configurée doit afficher ce qu'on lui a demandé.
    found.sensors[base.attributes.period || "today"] ??= this._config.entity;
    found.department = department;
    found.name = base.attributes.department_name || department;
    found.ids = [...Object.values(found.sensors), ...Object.values(found.cameras)];
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

  /** La couleur la plus grave parmi les périodes affichées. */
  _worst(resolved) {
    return Math.max(
      0,
      ...this._periods().map(
        (period) => this._state(resolved, period)?.attributes.color_id || 0
      )
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
      this._config.alert_only && !this.preview && this._worst(resolved) < ALERT_LEVEL;
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

  /** L'en-tête d'une période : pastille, nom, niveau. */
  _headHTML(label) {
    return `
      <div class="head">
        <span class="dot"></span>
        <span class="label">${escapeHtml(label)}</span>
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
            <span class="level"></span>
          </div>
          <div class="map-wrap" style="display:none">
            <img class="map" alt="${t[main]}" />
            <div class="inset-mask"></div>
            <div class="overlay">
              <span class="dot"></span>
              <span class="label">${t[main]}</span>
              <span class="level"></span>
            </div>
            <div class="stale" style="display:none">${t.expired}</div>
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
      this._config.theme === "plein" && (attrs.color_id || 0) >= ALERT_LEVEL;
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
    // du bandeau, l'aplat du plein, l'anneau du sobre.
    parts.node.style.setProperty(
      "--level-color",
      level ? level.color : "var(--disabled-text-color)"
    );
    parts.node.classList.toggle(
      "alerted",
      (attrs.color_id || 0) >= ALERT_LEVEL
    );

    // Toutes les pastilles du bloc : le focus en a deux — celle du bandeau et
    // celle posée sur la vignette — et une seule colorée serait un défaut vu.
    for (const dot of parts.node.querySelectorAll(".dot")) {
      dot.style.background = level ? level.color : "var(--disabled-text-color)";
    }
    for (const node of parts.node.querySelectorAll(".level")) {
      node.textContent = levelName(state?.state, this._hass);
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
    const cameraId = resolved.cameras[period];
    const camera = cameraId ? this._hass.states[cameraId] : null;
    const picture = camera?.attributes.entity_picture;
    // Masquée tant qu'aucune image n'est arrivée, ce que faisait la condition
    // de visibilité des `picture-entity`.
    const show = this._config.show_map && picture && camera.state !== "unavailable";

    parts.mapWrap.style.display = show ? "" : "none";
    if (!show) return;

    if (parts.src !== picture) {
      parts.map.src = picture;
      // La même adresse pour le calque d'encre du thème sombre : c'est ce qui
      // rend le procédé gratuit, le navigateur ne retéléchargera rien.
      parts.mapWrap.style.setProperty("--map-src", `url("${picture}")`);
      parts.src = picture;
    }
    // La vignette porte les mêmes actions que le bloc, mais sur la caméra :
    // « more-info » sans entité y ouvre l'image, pas le capteur.
    this._bindActions(parts.map, cameraId);
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
      ha-card { padding: 12px; overflow: hidden; }
      .title {
        font-size: var(--ha-card-header-font-size, 24px);
        font-weight: 400;
        color: var(--ha-card-header-color, var(--primary-text-color));
        padding: 4px 4px 12px;
      }
      .error { padding: 8px; color: var(--error-color); }

      /* ── Blocs communs ──────────────────────────────────────────────── */
      .period { display: flex; flex-direction: column; gap: 8px; cursor: pointer; }
      .head { display: flex; align-items: center; gap: 8px; }
      .dot {
        width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto;
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22);
      }
      .label { font-weight: 500; color: var(--primary-text-color); }
      .level { margin-left: auto; font-size: 0.9em; color: var(--secondary-text-color); }
      .icon-row { display: flex; align-items: center; gap: 4px; }
      .icon-row ha-icon { --mdc-icon-size: 18px; }
      /* isolation enferme le mélange du calque d'encre ci-dessous : sans elle,
         mix-blend-mode irait chercher le fond du tableau de bord. */
      .map-wrap { position: relative; isolation: isolate; }
      img.map {
        width: 100%; display: block;
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--secondary-background-color);
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

      .stale {
        position: absolute; top: 6px; left: 6px;
        padding: 2px 8px; border-radius: 12px;
        font-size: 0.75em; color: #fff;
        background: var(--error-color, #e01f1f);
      }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
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
      .empty, .comment, .foot, .tl-quiet {
        font-size: 0.8em; color: var(--secondary-text-color);
      }
      .foot:not(:empty) { padding-top: 10px; text-align: right; }

      /* ── Disposition : duo ──────────────────────────────────────────── */
      .grid {
        display: grid; gap: 12px;
        /* Deux colonnes quand la place le permet, une seule sinon : la carte
           est souvent posée dans une colonne étroite de tableau de bord. */
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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
      .tl-name { display: flex; justify-content: space-between; gap: 8px; font-size: 0.82em; }
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
