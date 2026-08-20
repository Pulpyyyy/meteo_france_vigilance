"""Base commune aux entités : le rattachement aux appareils.

Deux niveaux d'appareils, et c'est délibéré : un appareil « service » pour
l'entrée, qui porte les vignettes nationales, et un appareil par département, qui
porte ses deux capteurs. Suivre trois départements donne donc trois appareils
nommés, au lieu d'une liste de six capteurs à distinguer par leur nom.
"""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import BASINS, DOMAIN, department_name
from .coordinator import VigilanceCoordinator


def hub_device_info(entry: ConfigEntry) -> DeviceInfo:
    """L'appareil de l'entrée elle-même : la source, et ses cartes."""
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name="Vigilance Météo France",
        manufacturer="Météo France",
        model="DPVigilance V6",
        entry_type=DeviceEntryType.SERVICE,
        configuration_url="https://vigilance.meteofrance.fr/fr",
    )


def department_device_info(entry: ConfigEntry, code: str) -> DeviceInfo:
    """L'appareil d'un domaine suivi — département ou bassin d'outre-mer."""
    basin = BASINS.get(code)
    if basin:
        # Le site range les bassins sous un nom, pas sous un code — et n'en
        # publie pas pour tous : à défaut, l'accueil vaut mieux qu'un lien mort.
        page = basin.get("page")
        return DeviceInfo(
            identifiers={(DOMAIN, f"{entry.entry_id}_{code}")},
            name=f"Vigilance {basin['name']}",
            manufacturer="Météo France",
            model="Vigilance outre-mer",
            entry_type=DeviceEntryType.SERVICE,
            via_device=(DOMAIN, entry.entry_id),
            configuration_url=(
                f"https://vigilance.meteofrance.fr/fr/{page}"
                if page
                else "https://vigilance.meteofrance.fr/fr"
            ),
        )

    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}_{code}")},
        name=f"Vigilance {department_name(code)}",
        manufacturer="Météo France",
        model=f"Département {code}",
        entry_type=DeviceEntryType.SERVICE,
        via_device=(DOMAIN, entry.entry_id),
        configuration_url=f"https://vigilance.meteofrance.fr/fr/{code}",
    )


class VigilanceEntity(CoordinatorEntity[VigilanceCoordinator]):
    """Ce que toutes les entités partagent : la source et son nom."""

    _attr_has_entity_name = True
    _attr_attribution = "Données Météo France — vigilance.meteofrance.fr"

    def __init__(self, coordinator: VigilanceCoordinator) -> None:
        """Rattacher l'entité au coordinateur de son entrée."""
        super().__init__(coordinator)
        self._entry = coordinator.entry
