"""Vigilance Météo France — la carte de vigilance, sans le bricolage autour.

Remplace le montage décrit sur le forum HACF et repris dans cette
configuration : trois capteurs `command_line` (curl + jq + base64), deux
caméras `local_file` alimentées par des PNG écrits dans `www/`, et une
automatisation chargée de relancer le tout et de réessayer quand l'API bégaie.

Ce que le composant reprend à son compte :

* la clé d'API est dans l'entrée de configuration, plus dans un YAML lisible
  par tout ce qui accède au dossier ;
* le département est retrouvé par son code, non par sa position dans le
  tableau (`domain_ids[42]`), qui change quand Météo France réordonne sa
  réponse ;
* les nouveaux essais sont dans le client HTTP, plus dans une boucle shell ;
* les vignettes restent en mémoire, ne sont retéléchargées que si le bulletin
  a changé, et ne transitent plus par le disque ;
* la validité du bulletin est vérifiée — c'est le défaut qui fait annoncer
  « vert » à une carte périmée alors qu'une alerte orange est en cours.

La carte Lovelace voyage dans `frontend/` : installer l'intégration est toute
l'installation, rien à copier dans `www/`, aucune ressource à déclarer.
"""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import CoreState, HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN, SERVICE_REFRESH
from .coordinator import VigilanceCoordinator
from .frontend import JSModuleRegistration

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.CAMERA]

type VigilanceConfigEntry = ConfigEntry[VigilanceCoordinator]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Publier la carte Lovelace, qu'il y ait une entrée ou non."""
    await _async_setup_frontend(hass)
    _async_register_services(hass)
    return True


@callback
def _async_register_services(hass: HomeAssistant) -> None:
    """Déclarer l'action `refresh`.

    Au niveau du composant, pas de l'entrée : l'action existe dès que
    l'intégration est installée et répond par une erreur traduite, plutôt que
    par « service inconnu », si l'entrée n'est pas chargée.
    """

    async def _async_refresh(call: ServiceCall) -> None:
        entries = [
            entry
            for entry in hass.config_entries.async_entries(DOMAIN)
            if entry.state is ConfigEntryState.LOADED
        ]
        if not entries:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="not_loaded"
            )
        for entry in entries:
            # `async_refresh`, pas `async_request_refresh` : le geste est
            # volontaire, il ne passe pas par l'anti-rebond du coordinateur.
            await entry.runtime_data.async_refresh()

    hass.services.async_register(DOMAIN, SERVICE_REFRESH, _async_refresh)


async def _async_setup_frontend(hass: HomeAssistant) -> None:
    """Servir le module et le déclarer dans les ressources Lovelace.

    Avant EVENT_HOMEASSISTANT_STARTED, la collection de ressources n'existe
    pas : la déclaration serait silencieusement perdue. On attend donc le
    démarrage, sauf si Home Assistant tourne déjà — cas d'une installation
    faite depuis l'interface, qui doit afficher la carte sans redémarrage.
    """

    async def _register(_event=None) -> None:
        await JSModuleRegistration(hass).async_register()

    if hass.state is CoreState.running:
        await _register()
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _register)


async def async_setup_entry(hass: HomeAssistant, entry: VigilanceConfigEntry) -> bool:
    """Mettre en place le coordinateur et ses entités."""
    await _async_setup_frontend(hass)

    coordinator = VigilanceCoordinator(hass, entry)
    # Le premier cycle est attendu : sans lui, les capteurs apparaîtraient
    # inconnus le temps d'une période de rafraîchissement, et une clé invalide
    # ne serait signalée qu'après coup.
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: VigilanceConfigEntry) -> bool:
    """Retirer les entités de l'entrée."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_reload_entry(hass: HomeAssistant, entry: VigilanceConfigEntry) -> None:
    """Recharger après modification des options.

    Le département suivi et l'intervalle sont lus à la construction du
    coordinateur : les changer demande de le reconstruire, ce que fait le
    rechargement.
    """
    await hass.config_entries.async_reload(entry.entry_id)


async def async_remove_entry(hass: HomeAssistant, entry: VigilanceConfigEntry) -> None:
    """Retirer la ressource Lovelace avec la dernière entrée.

    Tant qu'il en reste une, la carte doit continuer d'être servie : la
    ressource est commune à toutes les entrées.
    """
    if hass.config_entries.async_entries(DOMAIN):
        return
    await JSModuleRegistration(hass).async_unregister()
