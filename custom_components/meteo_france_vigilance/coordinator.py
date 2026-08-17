"""Récupération et mise en forme du bulletin de vigilance.

Un seul coordinateur par entrée de configuration : le bulletin est national,
donc suivre trois départements ne coûte pas plus d'une requête que d'en suivre
un. Les vignettes suivent le même cycle, mais ne sont retéléchargées que si le
bulletin a changé — elles pèsent 55 ko chacune et ne bougent qu'avec lui.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .api import VigilanceApi, VigilanceApiError, VigilanceAuthError
from .const import (
    COLORS,
    CONF_API_KEY,
    CONF_DEPARTMENTS,
    CONF_MAPS,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    PERIODS,
    color,
    department_name,
    phenomenon,
)

_LOGGER = logging.getLogger(__name__)


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
        # Conservées d'une mise à jour à l'autre : une vignette absente doit
        # laisser la précédente affichée, pas vider la caméra.
        self._maps: dict[str, bytes | None] = {p: None for p in PERIODS}
        self._maps_updated: dict[str, datetime | None] = {p: None for p in PERIODS}
        self._maps_stamp: str | None = None

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
        return data

    # ── Vignettes ─────────────────────────────────────────────────────────────

    async def _async_refresh_maps(self, product: dict[str, Any]) -> None:
        """Retélécharger les PNG uniquement si le bulletin a été réémis."""
        stamp = str(product.get("update_time") or "")
        missing = [p for p in PERIODS if self._maps.get(p) is None]
        if stamp and stamp == self._maps_stamp and not missing:
            return

        # Une seule période échoue rarement seule ; on tente les deux et on ne
        # remplace que ce qui est arrivé, pour ne jamais afficher une carte de
        # ce matin à côté d'une carte de la veille sans le dire.
        fetched = 0
        for period in PERIODS:
            try:
                self._maps[period] = await self.api.async_get_map(period)
                self._maps_updated[period] = dt_util.utcnow()
                fetched += 1
            except VigilanceApiError as err:
                _LOGGER.warning(
                    "Vignette « %s » indisponible, la précédente est conservée : %s",
                    period,
                    err,
                )

        if fetched == len(PERIODS):
            self._maps_stamp = stamp

    # ── Lecture du bulletin ───────────────────────────────────────────────────

    def _parse(self, payload: dict[str, Any]) -> VigilanceData:
        """Transformer la réponse de l'API en données d'entités."""
        product = payload.get("product", {})
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
