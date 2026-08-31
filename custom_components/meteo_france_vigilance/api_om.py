"""Accès à la vigilance outre-mer.

Un service distinct de DPVigilance, et il faut le dire franchement : cette
interface est celle qui alimente le site vigilance.meteofrance.fr. Elle n'est
pas documentée, son jeton est celui que le site publie dans ses pages, et rien
ne garantit sa forme dans le temps. Le flux prévu pour cet usage — une archive
mise à jour chaque minute — a été fermé, et le portail public ne propose pas
d'équivalent outre-mer : DPVigilance répond « clé absente », ses variantes
outre-mer « inconnu ». C'est donc la seule voie ouverte, et le composant
l'annonce à l'utilisateur plutôt que de la faire passer pour officielle.

Une requête par bassin, contrairement à la métropole dont le bulletin est
national : suivre la Guadeloupe et la Réunion coûte deux appels.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import aiohttp
from aiohttp import ClientError, ClientResponseError, ClientSession

from .api import VigilanceApiError
from .const import (
    API_OM_BASE,
    API_OM_TOKEN,
    API_RETRIES,
    API_RETRY_DELAY,
    API_TIMEOUT,
)

_LOGGER = logging.getLogger(__name__)

# Les réponses du service pèsent quelques kilo-octets : au-delà de cette
# borne — très large —, ce n'est plus une réponse, c'est un problème.
_MAX_BYTES = 2 * 1024 * 1024


class VigilanceOmApi:
    """Client de la vigilance outre-mer, sans état."""

    def __init__(self, session: ClientSession, retries: int = API_RETRIES) -> None:
        """Retenir la session partagée de Home Assistant."""
        self._session = session
        self._retries = max(1, retries)

    async def _async_get(self, path: str, domain: str) -> dict[str, Any]:
        """Un GET, retenté tant que l'échec peut être passager.

        Le service répond parfois « 502 » ou « données non chargées » pendant
        quelques secondes, au moment où il republie un bulletin : c'est
        exactement ce que les nouveaux essais absorbent.
        """
        url = f"{API_OM_BASE}/{path}"
        params = {"domain": domain, "token": API_OM_TOKEN}
        last_error: Exception | None = None

        for attempt in range(1, self._retries + 1):
            try:
                async with self._session.get(
                    url,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=API_TIMEOUT),
                ) as response:
                    response.raise_for_status()
                    raw = await response.read()
                    if len(raw) > _MAX_BYTES:
                        raise VigilanceApiError(
                            f"Réponse démesurée pour {domain} : {len(raw)} octets"
                        )
                    # Décodé hors de la boucle d'événements, comme le bulletin
                    # métropolitain : le service répond en « text/plain » et
                    # vérifier le type ne prouverait rien.
                    payload = await asyncio.get_running_loop().run_in_executor(
                        None, json.loads, raw
                    )
                    if not isinstance(payload, dict):
                        raise VigilanceApiError(
                            f"Réponse inattendue pour {domain} : ce n'est pas un objet"
                        )
                    # Le service répond « 200 » en portant son erreur dans le
                    # corps — un domaine inconnu, par exemple.
                    if "error" in payload:
                        raise VigilanceApiError(
                            f"{domain} : {payload.get('message') or payload['error']}"
                        )
                    return payload

            except (ClientResponseError, ClientError, TimeoutError, ValueError) as err:
                last_error = err
            except VigilanceApiError as err:
                last_error = err

            if attempt < self._retries:
                _LOGGER.debug(
                    "%s (%s) : essai %s/%s échoué (%s), nouvelle tentative",
                    path,
                    domain,
                    attempt,
                    self._retries,
                    last_error,
                )
                await asyncio.sleep(API_RETRY_DELAY * attempt)

        raise VigilanceApiError(f"{url} ({domain}) : {last_error}") from last_error

    async def async_get_bulletin(self, domain: str) -> dict[str, Any]:
        """La vigilance en cours d'un bassin."""
        return await self._async_get("warning/full", domain)

    async def async_get_dictionary(self, domain: str) -> dict[str, Any]:
        """Les libellés des phénomènes et des couleurs d'un bassin.

        Ce que le service en dit lui-même, plutôt que des tables recopiées : on
        s'en sert pour nommer, jamais pour décider d'un état — l'énumération
        des capteurs, elle, doit rester figée.
        """
        return await self._async_get("warning/dictionary", domain)
