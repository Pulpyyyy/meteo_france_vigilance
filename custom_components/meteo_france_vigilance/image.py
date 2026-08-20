"""Les deux vignettes nationales, servies depuis la mémoire.

Une entité `image` et non `camera` : c'est le type que Home Assistant destine
à une image qui change de temps en temps, par opposition au flux vidéo. La
carte de vigilance est réémise deux à trois fois par jour — la caméra
obligeait à brider une cadence d'images animées (`frame_interval`) pour un
contenu qui ne bouge pas, là où l'entité image annonce simplement la date de
la dernière image et laisse le navigateur ne redemander que ce qui a changé.

Le montage précédent écrivait ces PNG dans `www/weather/` avec `curl`, les
relisait par une caméra `local_file`, et faisait tourner une automatisation
pour tenir l'ensemble à jour. Ici l'image reste dans le coordinateur : rien
n'est écrit sur la carte SD, rien n'est publié dans `www/` — donc rien n'est
lisible sans authentification.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from homeassistant.components.image import ImageEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import COMBINED_MAP, DOMAIN, PERIODS
from .coordinator import VigilanceCoordinator
from .entity import VigilanceEntity, hub_device_info


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Créer les images, sauf si les cartes ont été désactivées.

    Les vignettes sont celles de la carte nationale : elles ne concernent que
    la métropole, et n'existent donc pas pour une entrée qui ne suit que des
    bassins d'outre-mer.
    """
    coordinator = entry.runtime_data.metropole
    if coordinator is None or not coordinator.maps_enabled:
        return
    async_add_entities(
        VigilanceImage(hass, coordinator, key)
        for key in (*PERIODS, COMBINED_MAP)
    )


class VigilanceImage(VigilanceEntity, ImageEntity):
    """La carte de vigilance de la France pour une période."""

    _attr_content_type = "image/png"

    def __init__(
        self, hass: HomeAssistant, coordinator: VigilanceCoordinator, period: str
    ) -> None:
        """Nommer l'image et la rattacher à l'appareil de l'entrée."""
        # Les deux explicitement : `ImageEntity.__init__` a besoin de `hass`
        # pour son client HTTP, et l'ordre d'appel ne peut pas être laissé au
        # hasard de l'ordre de résolution des classes.
        ImageEntity.__init__(self, hass)
        VigilanceEntity.__init__(self, coordinator)
        self._period = period
        self._attr_translation_key = f"map_{period}"
        self._attr_unique_id = f"{coordinator.entry.entry_id}_map_{period}"
        self._attr_device_info = hub_device_info(coordinator.entry)
        self._attr_image_last_updated = self._updated

    @property
    def _updated(self) -> datetime | None:
        """L'horodatage de la vignette détenue par le coordinateur."""
        data = self.coordinator.data
        return data.maps_updated.get(self._period) if data else None

    def _handle_coordinator_update(self) -> None:
        """Suivre la date de la vignette à chaque cycle.

        C'est ici, et nulle part ailleurs, que `image_last_updated` change :
        Home Assistant demande explicitement de ne pas le faire depuis
        `async_image()`, sans quoi le navigateur reprendrait l'image en boucle.
        """
        self._attr_image_last_updated = self._updated
        super()._handle_coordinator_update()

    @property
    def available(self) -> bool:
        """Disponible dès qu'une image a été reçue, même lors d'un échec.

        La dernière carte connue vaut mieux qu'une tuile vide : elle porte sa
        date en attribut, et la carte Lovelace la signale si elle a vieilli.
        """
        data = self.coordinator.data
        return bool(data and data.maps.get(self._period))

    async def async_image(self) -> bytes | None:
        """Le PNG tel que Météo France l'a produit, sans redimensionnement."""
        data = self.coordinator.data
        return data.maps.get(self._period) if data else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """De quoi retrouver l'image depuis la carte, et dater la vignette."""
        data = self.coordinator.data
        return {
            # Ces trois clés sont le chemin par lequel la carte Lovelace
            # retrouve ses images à partir du seul capteur qu'on lui a donné.
            "integration": DOMAIN,
            "entry_id": self._entry.entry_id,
            "period": self._period,
            "image_updated": self._updated,
            "update_time": data.update_time if data else None,
        }
