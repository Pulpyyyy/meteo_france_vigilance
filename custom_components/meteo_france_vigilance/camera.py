"""Les deux vignettes nationales, servies depuis la mémoire.

Le montage précédent écrivait ces PNG dans `www/weather/` avec `curl`, les
relisait par une caméra `local_file`, et faisait tourner une automatisation
pour tenir l'ensemble à jour. Ici l'image reste dans le coordinateur : rien
n'est écrit sur la carte SD, rien n'est publié dans `www/` — donc rien n'est
lisible sans authentification — et il n'y a plus d'automatisation de
rafraîchissement, le coordinateur étant déjà ce qui rafraîchit.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.camera import Camera
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PERIODS
from .coordinator import VigilanceCoordinator
from .entity import VigilanceEntity, hub_device_info


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Créer les caméras, sauf si les cartes ont été désactivées."""
    coordinator: VigilanceCoordinator = entry.runtime_data
    if not coordinator.maps_enabled:
        return
    async_add_entities(VigilanceCamera(coordinator, period) for period in PERIODS)


class VigilanceCamera(VigilanceEntity, Camera):
    """La carte de vigilance de la France pour une période."""

    _attr_content_type = "image/png"
    # Une carte de vigilance ne bouge pas deux fois par seconde. La valeur par
    # défaut (0,5 s) ferait resservir 55 ko à cette cadence dès qu'un
    # navigateur ouvre le flux de la caméra, pour une image identique.
    _attr_frame_interval = 60.0

    def __init__(self, coordinator: VigilanceCoordinator, period: str) -> None:
        """Nommer la caméra et la rattacher à l'appareil de l'entrée."""
        # Les deux explicitement : `Camera.__init__` prépare les jetons d'accès
        # dont dépend `entity_picture`, et l'ordre d'appel ne peut pas être
        # laissé au hasard de l'ordre de résolution des classes.
        Camera.__init__(self)
        VigilanceEntity.__init__(self, coordinator)
        self._period = period
        self._attr_translation_key = f"map_{period}"
        self._attr_unique_id = f"{coordinator.entry.entry_id}_map_{period}"
        self._attr_device_info = hub_device_info(coordinator.entry)

    @property
    def available(self) -> bool:
        """Disponible dès qu'une image a été reçue, même lors d'un échec.

        La dernière carte connue vaut mieux qu'une tuile vide : elle porte sa
        date en attribut, et la carte Lovelace la signale si elle a vieilli.
        """
        data = self.coordinator.data
        return bool(data and data.maps.get(self._period))

    async def async_camera_image(
        self, width: int | None = None, height: int | None = None
    ) -> bytes | None:
        """Le PNG tel que Météo France l'a produit, sans redimensionnement.

        `width` et `height` sont ignorés à dessein : la vignette est une carte
        avec des légendes, et la redimensionner côté serveur ne ferait que la
        rendre illisible.
        """
        data = self.coordinator.data
        return data.maps.get(self._period) if data else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """De quoi retrouver la caméra depuis la carte, et dater l'image."""
        data = self.coordinator.data
        return {
            # Ces trois clés sont le chemin par lequel la carte Lovelace
            # retrouve ses images à partir du seul capteur qu'on lui a donné.
            "integration": DOMAIN,
            "entry_id": self._entry.entry_id,
            "period": self._period,
            "image_updated": data.maps_updated.get(self._period) if data else None,
            "update_time": data.update_time if data else None,
        }
