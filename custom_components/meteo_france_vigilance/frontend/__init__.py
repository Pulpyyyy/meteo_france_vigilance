"""Publication de la carte Lovelace livrée avec l'intégration.

La carte est dans `custom_components/meteo_france_vigilance/frontend/` et non
dans `www/` : HACS ne livre que le dossier du composant, donc tout ce dont la
carte a besoin doit voyager avec lui. Installer l'intégration est alors toute
l'installation — aucun fichier à copier, aucune ressource à déclarer à la main.

Le chemin statique est toujours enregistré ; la ressource Lovelace n'est
touchée qu'en mode « storage », le mode YAML se gérant par définition dans le
YAML de l'utilisateur.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration

from ..const import (
    CARD_FILENAME,
    DOMAIN,
    FALLBACK_VERSION,
    JSMODULES,
    URL_BASE,
)

try:  # Home Assistant 2024.11 et suivants
    from homeassistant.components.lovelace.const import LOVELACE_DATA
except ImportError:  # pragma: no cover - cœurs plus anciens
    LOVELACE_DATA = "lovelace"

_LOGGER = logging.getLogger(__name__)


class JSModuleRegistration:
    """Sert le module JavaScript et le référence dans Lovelace."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Retenir Lovelace tel qu'il est au moment de l'appel."""
        self.hass = hass
        self.lovelace = hass.data.get(LOVELACE_DATA)
        self._version = FALLBACK_VERSION

    async def _async_version(self) -> str:
        """La version du manifeste, telle que Home Assistant l'a déjà lue.

        Elle devient le `?v=` de la ressource : c'est ce qui rend une mise à
        jour visible d'un navigateur qui tient encore l'ancien module.
        """
        try:
            integration = await async_get_integration(self.hass, DOMAIN)
        except Exception:  # noqa: BLE001 - une intégration absente n'est pas notre affaire
            return FALLBACK_VERSION
        self._version = str(integration.version or FALLBACK_VERSION)
        return self._version

    @property
    def _mode(self) -> str:
        """Où Lovelace range ses ressources : « storage » ou « yaml »."""
        return getattr(
            self.lovelace, "resource_mode", getattr(self.lovelace, "mode", "yaml")
        )

    async def async_register(self) -> None:
        """Servir le fichier, puis le déclarer."""
        await self._async_register_path()
        version = await self._async_version()

        if self.lovelace is None:
            # Dit à voix haute plutôt que passé sous silence : sans cela la
            # carte est servie mais jamais référencée, et rien ne dit pourquoi.
            _LOGGER.warning(
                "Lovelace indisponible : ajoutez la ressource à la main -> "
                "url: %s/%s?v=%s , type: module",
                URL_BASE,
                CARD_FILENAME,
                version,
            )
            return

        if self._mode != "storage":
            _LOGGER.info(
                "Lovelace en mode YAML : ajoutez la ressource à la main -> "
                "url: %s/%s?v=%s , type: module",
                URL_BASE,
                CARD_FILENAME,
                version,
            )
            return

        await self._async_register_modules()

    async def _async_register_path(self) -> None:
        """Servir les fichiers, un chemin déclaré par module.

        Les fichiers, jamais le dossier qui les contient : un chemin statique
        est servi hors de l'authentification de Home Assistant, et publier le
        dossier publierait ce paquet Python avec eux.
        """
        here = Path(__file__).parent
        try:
            await self.hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        f"{URL_BASE}/{module['filename']}",
                        str(here / module["filename"]),
                        True,
                    )
                    for module in JSMODULES
                ]
            )
            _LOGGER.debug("Chemin enregistré : %s", URL_BASE)
        except (RuntimeError, ValueError):
            _LOGGER.debug("Chemin déjà enregistré : %s", URL_BASE)

    async def _async_load_resources(self) -> None:
        """Charger la collection de ressources depuis le stockage.

        Elle se charge à la première utilisation : attendre qu'elle le fasse
        d'elle-même reviendrait à attendre qu'un navigateur demande la liste,
        ce qui n'arrive jamais sur un démarrage sans écran.
        """
        resources = self.lovelace.resources
        if getattr(resources, "loaded", True):
            return
        await resources.async_get_info()

    async def _async_register_modules(self) -> None:
        """Créer la ressource, ou l'amener à la version courante."""
        await self._async_load_resources()

        existing = [
            resource
            for resource in self.lovelace.resources.async_items()
            if str(resource.get("url", "")).startswith(URL_BASE)
        ]

        for module in JSMODULES:
            url = f"{URL_BASE}/{module['filename']}?v={self._version}"
            registered = False

            for resource in existing:
                if self._get_path(resource["url"]) != self._get_path(url):
                    continue
                registered = True
                if resource["url"] != url:
                    _LOGGER.info("Ressource %s : mise à jour en %s", resource["url"], url)
                    await self.lovelace.resources.async_update_item(
                        resource["id"], {"res_type": "module", "url": url}
                    )
                break

            if not registered:
                _LOGGER.info("Enregistrement de %s (%s)", module["name"], url)
                await self.lovelace.resources.async_create_item(
                    {"res_type": "module", "url": url}
                )

    async def async_unregister(self) -> None:
        """Retirer la ressource quand l'intégration est supprimée."""
        if self.lovelace is None or self._mode != "storage":
            return
        await self._async_load_resources()
        for module in JSMODULES:
            url = f"{URL_BASE}/{module['filename']}"
            for resource in [
                item
                for item in self.lovelace.resources.async_items()
                if self._get_path(str(item.get("url", ""))) == url
            ]:
                await self.lovelace.resources.async_delete_item(resource["id"])

    @staticmethod
    def _get_path(url: str) -> str:
        """L'adresse sans ses paramètres."""
        return url.split("?")[0]
