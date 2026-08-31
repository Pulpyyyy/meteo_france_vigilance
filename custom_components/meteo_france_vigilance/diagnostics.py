"""Diagnostics de l'entrée, pour les rapports de bogue.

Ce que Paramètres → « Télécharger les diagnostics » produit : l'état des deux
coordinateurs et la configuration — la clé d'API masquée, évidemment. C'est ce
qu'on demande à un utilisateur qui signale un problème, plutôt que de le faire
fouiller ses journaux.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .const import CONF_API_KEY

TO_REDACT = {CONF_API_KEY}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry
) -> dict[str, Any]:
    """L'état de l'entrée : configuration masquée et santé des coordinateurs."""
    runtime = entry.runtime_data

    def state(coordinator) -> dict[str, Any] | None:
        if coordinator is None:
            return None
        data = coordinator.data
        return {
            "last_update_success": coordinator.last_update_success,
            "domains": sorted(data.departments) if data else None,
            "update_time": str(data.update_time) if data and data.update_time else None,
            # Les octets des vignettes n'ont rien à faire dans un rapport :
            # seul compte de savoir lesquelles sont présentes.
            "maps": {k: bool(v) for k, v in data.maps.items()} if data else None,
        }

    return {
        "entry": async_redact_data({**entry.data, **entry.options}, TO_REDACT),
        "metropole": state(runtime.metropole),
        "outre_mer": state(runtime.outre_mer),
    }
