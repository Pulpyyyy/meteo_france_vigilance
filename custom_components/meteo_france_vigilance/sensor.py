"""Capteurs de vigilance : deux par département, aujourd'hui et demain.

L'état est la couleur — `green`, `yellow`, `orange`, `red` — et non l'indice
numérique 1 à 4 que renvoie l'API. C'est une énumération traduite par Home
Assistant, donc lisible dans une automation (`state: red`) comme dans
l'historique, sans table de correspondance à retenir.

Le détail — les phénomènes, leurs créneaux, la fraîcheur du bulletin — est en
attributs. `today` et `tomorrow` y sont doublés sous la forme exacte que
renvoyait le capteur `command_line` : les modèles Jinja écrits avant ce
composant continuent de fonctionner en changeant seulement l'entité visée.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import COLOR_SLUGS, PERIODS, department_name
from .coordinator import VigilanceCoordinator
from .entity import VigilanceEntity, department_device_info

SENSORS: tuple[SensorEntityDescription, ...] = tuple(
    SensorEntityDescription(
        key=period,
        translation_key=f"vigilance_{period}",
        device_class=SensorDeviceClass.ENUM,
        options=COLOR_SLUGS,
    )
    for period in PERIODS
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Créer les capteurs de chaque département suivi."""
    coordinator: VigilanceCoordinator = entry.runtime_data
    async_add_entities(
        VigilanceSensor(coordinator, code, description)
        for code in coordinator.departments
        for description in SENSORS
    )


class VigilanceSensor(VigilanceEntity, SensorEntity):
    """La couleur de vigilance d'un département sur une période."""

    entity_description: SensorEntityDescription

    # Le détail du bulletin pèse quelques kilo-octets et serait réécrit dans la
    # base à chaque changement d'état. L'historique garde la couleur — ce qu'on
    # regarde a posteriori ; le détail, lui, ne vaut que pour le bulletin en
    # cours.
    _unrecorded_attributes = frozenset(
        {"phenomena", "alerts", "today", "tomorrow", "comment"}
    )

    def __init__(
        self,
        coordinator: VigilanceCoordinator,
        code: str,
        description: SensorEntityDescription,
    ) -> None:
        """Nommer le capteur et le rattacher à l'appareil de son département."""
        super().__init__(coordinator)
        self.entity_description = description
        self._code = code
        self._period = description.key
        self._attr_unique_id = f"{coordinator.entry.entry_id}_{code}_{description.key}"
        self._attr_device_info = department_device_info(coordinator.entry, code)

    @property
    def _state(self) -> dict[str, Any]:
        """L'état du département pour la période de ce capteur."""
        if not self.coordinator.data:
            return {}
        return self.coordinator.data.departments.get(self._code, {}).get(
            self._period, {}
        )

    @property
    def available(self) -> bool:
        """Indisponible si le bulletin ne couvre pas ce département."""
        return super().available and bool(self._state.get("available"))

    @property
    def native_value(self) -> str | None:
        """La couleur maximale du département, tous phénomènes confondus."""
        return self._state.get("color")

    @property
    def icon(self) -> str:
        """Le phénomène le plus grave, ou le bouclier quand tout est vert.

        Une icône fixe dirait la même chose en jaune qu'en rouge ; celle-ci dit
        d'un coup d'œil *ce qui* est annoncé, ce que la couleur seule ne dit pas.
        """
        alerts = self._state.get("alerts") or []
        if alerts:
            return str(alerts[0]["icon"])
        return "mdi:shield-check-outline"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Le détail du bulletin, plus les deux listes de compatibilité."""
        state = self._state
        if not state:
            return {}

        data = self.coordinator.data
        departments = data.departments.get(self._code, {}) if data else {}

        attributes: dict[str, Any] = {
            key: value
            for key, value in state.items()
            # `available` est déjà porté par l'entité elle-même.
            if key != "available"
        }
        attributes["department_name"] = department_name(self._code)
        attributes["update_time"] = data.update_time if data else None
        attributes["global_color_id"] = data.global_max_color_id if data else None
        attributes["entry_id"] = self._entry.entry_id
        # Ce que lisaient les modèles du capteur command_line, à l'identique :
        # une liste par période, chaque élément portant `phenomenon_id` et
        # `phenomenon_max_color_id`.
        for period in PERIODS:
            attributes[period] = departments.get(period, {}).get("phenomena", [])
        return attributes
