"""Récupération et mise en forme de la vigilance outre-mer.

Un coordinateur distinct de celui de la métropole, et c'est délibéré : les
deux services n'ont ni la même adresse, ni la même clé, ni la même forme de
réponse. Séparés, une panne outre-mer laisse les départements métropolitains
à jour, et réciproquement.

Ce que produit ce fichier est en revanche identique à ce que produit la
métropole : les mêmes dictionnaires, les mêmes clés, les mêmes couleurs
normalisées. Les capteurs et la carte ne savent pas d'où vient ce qu'ils
affichent, et n'ont pas à le savoir.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import VigilanceApiError
from .api_om import VigilanceOmApi
from .const import (
    BASINS,
    CONF_BASINS,
    CONF_SCAN_INTERVAL,
    CYCLONE_PHASES,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    basin_scale,
    scale_color,
    scale_phenomenon,
)
from .coordinator import PeriodInfo, VigilanceData

_LOGGER = logging.getLogger(__name__)

# Le service ne distingue pas aujourd'hui et demain comme le fait la
# métropole : il publie une chronologie continue. Tout est donc rangé sous
# « aujourd'hui », et « demain » reste vide plutôt que d'inventer un découpage.
OM_PERIOD = "today"


class VigilanceOmCoordinator(DataUpdateCoordinator[VigilanceData]):
    """Interroge la vigilance outre-mer et distribue le résultat."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Construire le coordinateur à partir de l'entrée de configuration."""
        options = {**entry.data, **entry.options}
        self.entry = entry
        self.basins: list[str] = list(options.get(CONF_BASINS, []))
        self.api = VigilanceOmApi(async_get_clientsession(hass))
        # Les libellés publiés par le service, par bassin. Chargés une fois et
        # gardés : ils ne changent pas d'un quart d'heure à l'autre, et le
        # composant doit tenir sans eux.
        self._labels: dict[str, dict[int, str]] = {}

        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=f"{DOMAIN}_om",
            update_interval=timedelta(
                minutes=int(options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL))
            ),
        )

    async def _async_update_data(self) -> VigilanceData:
        """Un cycle : un appel par bassin suivi, menés de front."""
        if not self.basins:
            return VigilanceData()

        results = await asyncio.gather(
            *(self._async_basin(code) for code in self.basins),
            return_exceptions=True,
        )

        data = VigilanceData()
        failures: list[str] = []
        for code, result in zip(self.basins, results):
            if isinstance(result, Exception):
                failures.append(f"{code} : {result}")
                continue
            data.departments[code] = result

        # Tous les bassins en échec : c'est le service qui ne répond pas, et
        # les entités doivent le dire. Un seul en échec laisse les autres à
        # jour — la panne d'un bassin n'est pas celle des autres.
        if failures and len(failures) == len(self.basins):
            raise UpdateFailed(" ; ".join(failures))
        for failure in failures:
            _LOGGER.warning("Vigilance outre-mer indisponible — %s", failure)

        data.periods[OM_PERIOD] = PeriodInfo(echeance="J")
        return data

    async def _async_basin(self, code: str) -> dict[str, dict[str, Any]]:
        """La vigilance d'un bassin, sous la forme que lisent les capteurs."""
        payload = await self.api.async_get_bulletin(code)
        await self._async_labels(code)
        return self._parse(code, payload)

    async def _async_labels(self, code: str) -> None:
        """Charger les libellés d'un bassin, sans jamais en dépendre."""
        if code in self._labels:
            return
        try:
            dictionary = await self.api.async_get_dictionary(code)
        except VigilanceApiError as err:
            # Les tables du composant suffisent à nommer : on note et on
            # continue, plutôt que de faire échouer un cycle pour des libellés.
            _LOGGER.debug("Libellés indisponibles pour %s : %s", code, err)
            self._labels[code] = {}
            return
        self._labels[code] = {
            int(item["id"]): str(item["name"])
            for item in dictionary.get("phenomenons", [])
            if item.get("id") is not None and item.get("name")
        }

    # ── Lecture ───────────────────────────────────────────────────────────────

    def _parse(self, code: str, payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Transformer la réponse d'un bassin en données d'entités."""
        scale = basin_scale(code)
        colour = scale_color(scale, _as_int(payload.get("color_max")))
        updated = _moment(payload.get("update_time"))
        end = _moment(payload.get("end_validity_time"))

        timelines = {
            _as_int(item.get("phenomenon_id")): item.get("timelaps_items") or []
            for item in payload.get("timelaps") or []
        }

        phenomena = [
            self._phenomenon(code, scale, item, timelines)
            for item in payload.get("phenomenons_items") or []
        ]
        # Le plus grave en tête, comme en métropole : l'ordre du service varie.
        phenomena.sort(key=lambda p: (-(p["color_id"] or 0), p["phenomenon_id"]))

        return {
            OM_PERIOD: {
                # `department` reste le nom de la clé : c'est ce que lisent la
                # carte et les modèles écrits avant l'outre-mer. `domain` et
                # `basin` s'ajoutent à côté pour ce qui est propre aux bassins.
                "department": code,
                "department_name": BASINS.get(code, {}).get("name", code),
                "domain": code,
                "basin": code,
                "scale": scale,
                "period": OM_PERIOD,
                "echeance": "J",
                "available": True,
                # La chronologie est continue : rien n'y est périmé au sens du
                # bulletin métropolitain, qui vaut pour une journée donnée.
                "expired": False,
                "color": (colour or {}).get("color"),
                "color_name": (colour or {}).get("color_name"),
                "color_id": _as_int(payload.get("color_max")),
                "color_hex": (colour or {}).get("color_hex"),
                "color_native": (colour or {}).get("native"),
                "begin_time": updated,
                "end_time": end,
                "comment": _comment(payload.get("text")),
                "phenomena": phenomena,
                "alerts": [p for p in phenomena if p["color"] in ("orange", "red")],
                "cyclone_phase": self._cyclone_phase(scale, phenomena),
            }
        }

    def _phenomenon(
        self,
        code: str,
        scale: str,
        item: dict[str, Any],
        timelines: dict[int | None, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        """Un phénomène du bassin, dit avec le vocabulaire de la métropole."""
        phenomenon_id = _as_int(item.get("phenomenon_id")) or 0
        meta = scale_phenomenon(scale, phenomenon_id)
        raw_color = _as_int(item.get("phenomenon_max_color_id"))
        colour = scale_color(scale, raw_color)

        slots = []
        for slot in timelines.get(phenomenon_id, []):
            slot_colour = scale_color(scale, _as_int(slot.get("color_id"))) or {}
            slots.append(
                {
                    "begin_time": _moment(slot.get("begin_time")),
                    "end_time": _moment(slot.get("end_time")),
                    "color_id": _as_int(slot.get("color_id")),
                    "color": slot_colour.get("color"),
                    "color_hex": slot_colour.get("color_hex"),
                }
            )

        # Les créneaux du niveau le plus grave, pour dire « à quelle heure ».
        matching = [s for s in slots if s["color_id"] == raw_color]
        begins = [s["begin_time"] for s in matching if s["begin_time"]]
        ends = [s["end_time"] for s in matching if s["end_time"]]

        return {
            "phenomenon_id": phenomenon_id,
            "phenomenon_max_color_id": raw_color,
            # Le libellé du service quand on l'a — outre-mer, « Fortes pluies
            # et orages » recouvre ce que la métropole sépare en pluie et
            # orages. À défaut, celui du composant, qui reste juste.
            "phenomenon": self._labels.get(code, {}).get(phenomenon_id, meta["name"]),
            "slug": meta["slug"],
            "icon": meta["icon"],
            "color_id": raw_color,
            "color": (colour or {}).get("color"),
            "color_name": (colour or {}).get("color_name"),
            "color_hex": (colour or {}).get("color_hex"),
            "color_native": (colour or {}).get("native"),
            "begin_time": min(begins) if begins else None,
            "end_time": max(ends) if ends else None,
            "timeline": slots,
        }

    @staticmethod
    def _cyclone_phase(scale: str, phenomena: list[dict[str, Any]]) -> str | None:
        """La phase cyclonique du bassin, si le bassin en connaît une.

        Distincte de l'intensité : dans l'océan Indien, « orange hachuré » est
        une vigilance orange doublée d'une menace cyclonique. C'est ce que
        publiera un capteur à part.
        """
        if scale not in CYCLONE_PHASES:
            return None
        cyclone = next((p for p in phenomena if p["slug"] == "cyclone"), None)
        if not cyclone or cyclone["color_id"] not in CYCLONE_PHASES[scale]:
            return "none"
        return cyclone["color_native"] or cyclone["color"] or "none"


def _moment(value: Any) -> datetime | None:
    """Un horodatage du service, qui les compte en secondes depuis 1970.

    Rendu conscient de son fuseau : la métropole publie des dates ISO déjà
    situées, et comparer les deux sans cela lèverait une erreur.
    """
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _comment(text: Any) -> str | None:
    """Le commentaire du bassin, dont la forme varie d'un service à l'autre."""
    if not text:
        return None
    if isinstance(text, str):
        return text
    if isinstance(text, dict):
        item = text.get("text_bloc_item")
        if isinstance(item, str):
            return item
        if isinstance(item, list):
            parts = [
                " ".join(str(line).strip() for line in (block.get("text") or []) if line)
                for block in item
                if isinstance(block, dict)
            ]
            joined = " ".join(part for part in parts if part)
            return joined or None
    return None


def _as_int(value: Any) -> int | None:
    """Entier tolérant : le service mélange « 3 » et 3 selon les champs."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
