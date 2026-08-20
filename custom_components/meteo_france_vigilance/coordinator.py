"""Récupération et mise en forme du bulletin de vigilance.

Un seul coordinateur par entrée de configuration : le bulletin est national,
donc suivre trois départements ne coûte pas plus d'une requête que d'en suivre
un. Les vignettes suivent le même cycle, mais ne sont retéléchargées que si le
bulletin a changé — elles pèsent 55 ko chacune et ne bougent qu'avec lui.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
import random
from typing import Any, Final

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import VigilanceApi, VigilanceApiError, VigilanceAuthError
from .const import (
    COLORS,
    CONF_API_KEY,
    CONF_DEPARTMENTS,
    CONF_MAPS,
    COMBINED_MAP,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    EXPIRED_RETRY_WINDOW,
    PERIODS,
    SUPPORTED_VIGILANCE_VERSION,
    UNKNOWN_PHENOMENON,
    color,
    department_name,
    phenomenon,
)

_LOGGER = logging.getLogger(__name__)

# Ce que le coordinateur télécharge en images : les deux échéances, et la
# vignette qui les porte toutes deux.
MAP_KEYS: Final[tuple[str, ...]] = (*PERIODS, COMBINED_MAP)


@dataclass(slots=True)
class PeriodInfo:
    """Ce qui vaut pour toute la France sur une période."""

    echeance: str
    begin_time: datetime | None = None
    end_time: datetime | None = None
    comment: str | None = None
    counts: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class VigilanceData:
    """Le bulletin tel que les entités le lisent."""

    update_time: datetime | None = None
    global_max_color_id: int | None = None
    periods: dict[str, PeriodInfo] = field(default_factory=dict)
    # code de département → période → état complet du département.
    departments: dict[str, dict[str, dict[str, Any]]] = field(default_factory=dict)
    maps: dict[str, bytes | None] = field(default_factory=dict)
    maps_updated: dict[str, datetime | None] = field(default_factory=dict)


class VigilanceCoordinator(DataUpdateCoordinator[VigilanceData]):
    """Interroge Météo France et distribue le résultat aux entités."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Construire le coordinateur à partir de l'entrée de configuration."""
        options = {**entry.data, **entry.options}
        self.entry = entry
        self.departments: list[str] = list(options.get(CONF_DEPARTMENTS, []))
        self.maps_enabled: bool = options.get(CONF_MAPS, True)
        self.api = VigilanceApi(
            async_get_clientsession(hass), options[CONF_API_KEY]
        )
        # Les deux vignettes des échéances, plus celle qui les réunit.
        # Conservées d'une mise à jour à l'autre : une vignette absente doit
        # laisser la précédente affichée, pas vider l'entité.
        self._maps: dict[str, bytes | None] = {p: None for p in MAP_KEYS}
        self._maps_updated: dict[str, datetime | None] = {p: None for p in MAP_KEYS}
        self._maps_stamp: str | None = None
        # Rattrapage d'un bulletin périmé — voir _schedule_expired_retry.
        self._expired_retry_unsub: CALLBACK_TYPE | None = None
        # Nouveautés de l'API déjà signalées (version, phénomène, couleur) :
        # un avertissement par nouveauté et par session, pas un par cycle.
        self._reported_novelties: set[str] = set()

        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=timedelta(
                minutes=int(options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL))
            ),
        )

    async def _async_update_data(self) -> VigilanceData:
        """Un cycle : le bulletin, puis les vignettes s'il a changé."""
        try:
            payload = await self.api.async_get_bulletin()
        except VigilanceAuthError as err:
            # Relance le flux de ré-authentification plutôt que de marquer les
            # entités indisponibles en boucle sur une clé périmée.
            raise ConfigEntryAuthFailed(str(err)) from err
        except VigilanceApiError as err:
            raise UpdateFailed(str(err)) from err

        data = self._parse(payload)

        if self.maps_enabled:
            await self._async_refresh_maps(payload.get("product", {}))
        data.maps = dict(self._maps)
        data.maps_updated = dict(self._maps_updated)

        self._schedule_expired_retry(data)
        return data

    async def async_shutdown(self) -> None:
        """Annuler le rattrapage en attente avec le coordinateur."""
        self._cancel_expired_retry()
        await super().async_shutdown()

    # ── Bulletin périmé ───────────────────────────────────────────────────────

    def _schedule_expired_retry(self, data: VigilanceData) -> None:
        """Rattraper un bulletin périmé sans faire pilonner l'API.

        Quand la période du jour est dépassée, le bulletin réémis est en
        général déjà disponible : attendre l'intervalle complet prolonge
        l'affichage « périmé ». Mais toutes les installations font ce constat
        à la même heure — le rafraîchissement de rattrapage est donc tiré à un
        instant aléatoire de la demi-heure suivante, pour étaler les appels de
        milliers de clients au lieu de les concentrer à la même seconde. Si le
        bulletin est encore périmé au réveil, le cycle suivant retire au sort.
        """
        today = data.periods.get("today")
        expired = bool(
            today and today.end_time and today.end_time < dt_util.utcnow()
        )

        if not expired:
            self._cancel_expired_retry()
            return
        if self._expired_retry_unsub is not None:
            return  # un tirage attend déjà, ne pas en empiler un deuxième

        async def _retry(_now: datetime) -> None:
            self._expired_retry_unsub = None
            await self.async_request_refresh()

        delay = random.uniform(0, EXPIRED_RETRY_WINDOW)
        _LOGGER.debug("Bulletin périmé, rattrapage dans %.0f s", delay)
        self._expired_retry_unsub = async_call_later(self.hass, delay, _retry)

    def _cancel_expired_retry(self) -> None:
        """Désarmer le rattrapage, s'il y en a un."""
        if self._expired_retry_unsub is not None:
            self._expired_retry_unsub()
            self._expired_retry_unsub = None

    # ── Veille de version ─────────────────────────────────────────────────────

    def _warn_novelty(self, key: str, message: str, *args: Any) -> None:
        """Avertir une seule fois par nouveauté et par session."""
        if key in self._reported_novelties:
            return
        self._reported_novelties.add(key)
        _LOGGER.warning(message, *args)

    def _check_api_version(self, product: dict[str, Any]) -> None:
        """Comparer la version annoncée par le bulletin à celle qu'on sait lire.

        Chaque réponse porte `version_vigilance` (V6 aujourd'hui) : si Météo
        France déploie une V7, les tables de `const.py` ne décrivent plus
        forcément la donnée. Le composant continue — les identifiants inconnus
        retombent sur des libellés génériques — mais l'écart est dit une fois
        en journal et affiché dans Paramètres → Réparations, au lieu de laisser
        une carte silencieusement appauvrie.
        """
        reported = str(product.get("version_vigilance") or "")
        if not reported or reported == SUPPORTED_VIGILANCE_VERSION:
            ir.async_delete_issue(self.hass, DOMAIN, "unsupported_vigilance_version")
            return

        self._warn_novelty(
            f"version:{reported}",
            "Le bulletin annonce la vigilance « %s », ce composant est écrit "
            "pour la « %s » (version_cdp : %s) — les nouveaux phénomènes ou "
            "couleurs seront affichés de façon générique",
            reported,
            SUPPORTED_VIGILANCE_VERSION,
            product.get("version_cdp"),
        )
        ir.async_create_issue(
            self.hass,
            DOMAIN,
            "unsupported_vigilance_version",
            is_fixable=False,
            severity=ir.IssueSeverity.WARNING,
            translation_key="unsupported_vigilance_version",
            translation_placeholders={
                "reported": reported,
                "supported": SUPPORTED_VIGILANCE_VERSION,
            },
            learn_more_url="https://github.com/Pulpyyyy/meteo_france_vigilance/issues",
        )

    def _check_novelties(self, phenomena: list[dict[str, Any]]) -> None:
        """Détecter ce qu'une nouvelle version apporterait concrètement.

        Même si `version_vigilance` ne bouge pas, un phénomène ou une couleur
        ajoutés par Météo France se voient ici : c'est le filet qui attrape
        l'évolution avant qu'un utilisateur ne remarque un « Phénomène
        inconnu » sur sa carte.
        """
        for p in phenomena:
            if p["slug"] == UNKNOWN_PHENOMENON["slug"]:
                self._warn_novelty(
                    f"phenomenon:{p['phenomenon_id']}",
                    "Phénomène %s inconnu de ce composant — affiché « %s ». "
                    "Une évolution de l'API ? Signalez-le sur le dépôt",
                    p["phenomenon_id"],
                    UNKNOWN_PHENOMENON["name"],
                )
            if p["color_id"] and p["color"] is None:
                self._warn_novelty(
                    f"color:{p['color_id']}",
                    "Couleur %s inconnue de ce composant (niveaux 1 à 4 "
                    "attendus). Une évolution de l'API ? Signalez-le sur le dépôt",
                    p["color_id"],
                )

    # ── Vignettes ─────────────────────────────────────────────────────────────

    async def _async_refresh_maps(self, product: dict[str, Any]) -> None:
        """Retélécharger les PNG uniquement si le bulletin a été réémis."""
        stamp = str(product.get("update_time") or "")
        missing = [p for p in MAP_KEYS if self._maps.get(p) is None]
        if stamp and stamp == self._maps_stamp and not missing:
            return

        # Une seule période échoue rarement seule ; on tente les deux — en
        # parallèle, elles ne dépendent pas l'une de l'autre — et on ne
        # remplace que ce qui est arrivé, pour ne jamais afficher une carte de
        # ce matin à côté d'une carte de la veille sans le dire.
        async def _fetch(period: str) -> bool:
            try:
                content = await self.api.async_get_map(period)
            except VigilanceApiError as err:
                _LOGGER.warning(
                    "Vignette « %s » indisponible, la précédente est conservée : %s",
                    period,
                    err,
                )
                return False
            self._maps[period] = content
            self._maps_updated[period] = dt_util.utcnow()
            return True

        fetched = await asyncio.gather(*(_fetch(key) for key in MAP_KEYS))
        if all(fetched):
            self._maps_stamp = stamp

    # ── Lecture du bulletin ───────────────────────────────────────────────────

    def _parse(self, payload: dict[str, Any]) -> VigilanceData:
        """Transformer la réponse de l'API en données d'entités."""
        product = payload.get("product", {})
        self._check_api_version(product)
        data = VigilanceData(
            update_time=dt_util.parse_datetime(str(product.get("update_time") or ""))
            or None,
            global_max_color_id=_as_int(product.get("global_max_color_id")),
        )

        for period, echeance in PERIODS.items():
            raw = _find_period(product.get("periods", []), echeance)
            info = PeriodInfo(echeance=echeance)
            if raw is not None:
                info.begin_time = dt_util.parse_datetime(
                    str(raw.get("begin_validity_time") or "")
                )
                info.end_time = dt_util.parse_datetime(
                    str(raw.get("end_validity_time") or "")
                )
                info.comment = _comment(raw)
                info.counts = [
                    {
                        "color_id": _as_int(item.get("color_id")),
                        "color": (color(_as_int(item.get("color_id"))) or {}).get(
                            "slug"
                        ),
                        "count": _as_int(item.get("count")),
                        "text": item.get("text_count"),
                    }
                    for item in raw.get("max_count_items", [])
                ]
            data.periods[period] = info

            domains = (raw or {}).get("timelaps", {}).get("domain_ids", [])
            index = {str(d.get("domain_id")): d for d in domains}
            for code in self.departments:
                data.departments.setdefault(code, {})[period] = self._department(
                    code, period, info, index.get(code)
                )

        return data

    def _department(
        self,
        code: str,
        period: str,
        info: PeriodInfo,
        raw: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """L'état d'un département sur une période, tel qu'il sera publié.

        Le dictionnaire renvoyé est directement celui que le capteur expose en
        attributs : ce que la carte lit et ce qu'un modèle Jinja lit sont donc
        la même chose, écrite une fois.
        """
        # Le défaut qui a fait écrire tous les contournements du forum HACF :
        # une carte dont la validité est passée continue d'annoncer « vert »
        # alors que le vrai bulletin est orange. On ne masque pas la donnée —
        # une automation peut vouloir la dernière valeur connue — mais on dit
        # qu'elle est périmée, et la carte le montre.
        now = dt_util.utcnow()
        expired = bool(info.end_time and info.end_time < now)
        max_color_id = _as_int((raw or {}).get("max_color_id"))
        max_color = color(max_color_id) or {}
        phenomena = [
            _phenomenon_state(item) for item in (raw or {}).get("phenomenon_items", [])
        ]
        # L'API renvoie les phénomènes dans un ordre qui varie d'un bulletin à
        # l'autre ; trier par gravité puis par identifiant donne une carte
        # stable, où le plus grave est en tête.
        phenomena.sort(key=lambda p: (-(p["color_id"] or 0), p["phenomenon_id"]))
        self._check_novelties(phenomena)

        return {
            "department": code,
            "department_name": department_name(code),
            "period": period,
            "echeance": info.echeance,
            "available": raw is not None,
            "expired": expired,
            "color": max_color.get("slug"),
            "color_name": max_color.get("name"),
            "color_id": max_color_id,
            "color_hex": max_color.get("hex"),
            "begin_time": info.begin_time,
            "end_time": info.end_time,
            "comment": info.comment,
            "phenomena": phenomena,
            # Ce que la vigilance signale vraiment : orange (3) et rouge (4).
            "alerts": [p for p in phenomena if (p["color_id"] or 0) >= 3],
        }


def _phenomenon_state(item: dict[str, Any]) -> dict[str, Any]:
    """Un phénomène, enrichi de son libellé, de son icône et de sa couleur."""
    phenomenon_id = _as_int(item.get("phenomenon_id")) or 0
    meta = phenomenon(phenomenon_id)
    color_id = _as_int(item.get("phenomenon_max_color_id"))
    meta_color = color(color_id) or {}

    # Bornes du créneau le plus grave, pas de la période entière : c'est
    # l'information utile quand un orage n'est annoncé que pour la soirée.
    slots = [
        slot
        for slot in item.get("timelaps_items", [])
        if _as_int(slot.get("color_id")) == color_id
    ]
    begins = [dt_util.parse_datetime(str(s.get("begin_time") or "")) for s in slots]
    ends = [dt_util.parse_datetime(str(s.get("end_time") or "")) for s in slots]
    begins = [b for b in begins if b]
    ends = [e for e in ends if e]

    # Tous les créneaux, et pas seulement le plus grave : c'est ce qui permet à
    # la carte de tracer une barre de 24 heures et de répondre à « à quelle
    # heure ? », la seule question à laquelle une couleur ne répond pas.
    timeline = [
        {
            "begin_time": dt_util.parse_datetime(str(slot.get("begin_time") or "")),
            "end_time": dt_util.parse_datetime(str(slot.get("end_time") or "")),
            "color_id": _as_int(slot.get("color_id")),
            "color": (color(_as_int(slot.get("color_id"))) or {}).get("slug"),
            "color_hex": (color(_as_int(slot.get("color_id"))) or {}).get("hex"),
        }
        for slot in item.get("timelaps_items", [])
    ]

    return {
        "phenomenon_id": phenomenon_id,
        # Nom conservé sous la forme de l'API pour rester compatible avec les
        # modèles écrits avant ce composant.
        "phenomenon_max_color_id": color_id,
        "phenomenon": meta["name"],
        "slug": meta["slug"],
        "icon": meta["icon"],
        "color_id": color_id,
        "color": meta_color.get("slug"),
        "color_name": meta_color.get("name"),
        "color_hex": meta_color.get("hex"),
        "begin_time": min(begins) if begins else None,
        "end_time": max(ends) if ends else None,
        "timeline": timeline,
    }


def _find_period(periods: list[dict[str, Any]], echeance: str) -> dict[str, Any] | None:
    """La période demandée, retrouvée par son échéance.

    Par `echeance` et non par position : l'ordre du tableau n'est garanti nulle
    part, et c'est l'index en dur (`domain_ids[42]`) qui rendait la version
    command_line fausse dès que Météo France réordonnait sa réponse.
    """
    for period in periods:
        if str(period.get("echeance")) == echeance:
            return period
    return None


def _comment(period: dict[str, Any]) -> str | None:
    """Le commentaire national de la carte, s'il y en a un."""
    text = period.get("text_items", {}).get("text")
    if isinstance(text, list):
        joined = " ".join(str(t).strip() for t in text if t)
        return joined or None
    return str(text) if text else None


def _as_int(value: Any) -> int | None:
    """Entier tolérant : l'API mélange « 3 » et 3 selon les champs."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


__all__ = ["COLORS", "PeriodInfo", "VigilanceCoordinator", "VigilanceData"]
