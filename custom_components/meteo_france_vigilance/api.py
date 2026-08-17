"""Accès à l'API DPVigilance de Météo France.

Deux ressources seulement : le bulletin JSON (`cartevigilance/encours`) et les
deux vignettes nationales PNG. Le reste du fichier existe parce que cette API
répond mal de temps en temps — un 502 ou un corps vide, quelques secondes après
une bascule de bulletin — et qu'une mise à jour ratée éteindrait les entités
alors qu'un simple nouvel essai suffit.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import aiohttp
from aiohttp import ClientError, ClientResponseError, ClientSession

from .const import (
    API_BULLETIN,
    API_MAP,
    API_RETRIES,
    API_RETRY_DELAY,
    API_TIMEOUT,
    MAP_MIN_BYTES,
)

_LOGGER = logging.getLogger(__name__)


class VigilanceApiError(Exception):
    """L'API n'a pas répondu correctement."""


class VigilanceAuthError(VigilanceApiError):
    """Clé d'API refusée : ni un nouvel essai ni une attente n'y changeront rien."""


class VigilanceApi:
    """Client de l'API, sans état — la session est celle de Home Assistant."""

    def __init__(self, session: ClientSession, api_key: str) -> None:
        """Retenir la session partagée et la clé d'application."""
        self._session = session
        # Le portail délivre parfois la clé préfixée ; l'en-tête `apikey`
        # attend la valeur nue, et un préfixe collé donne un 401 illisible.
        self._api_key = api_key.strip().removeprefix("Bearer ").strip()

    @property
    def _headers(self) -> dict[str, str]:
        return {"accept": "*/*", "apikey": self._api_key}

    async def _async_get(self, url: str, *, binary: bool) -> Any:
        """Un GET, retenté tant que l'échec peut être passager.

        Renvoie le JSON décodé ou les octets bruts. Les 401/403 sortent tout de
        suite : c'est la clé qui est en cause, et Home Assistant doit demander à
        l'utilisateur d'en saisir une autre plutôt que de boucler.
        """
        last_error: Exception | None = None

        for attempt in range(1, API_RETRIES + 1):
            try:
                async with self._session.get(
                    url,
                    headers=self._headers,
                    timeout=aiohttp.ClientTimeout(total=API_TIMEOUT),
                ) as response:
                    if response.status in (401, 403):
                        raise VigilanceAuthError(
                            f"Clé d'API refusée par Météo France (HTTP {response.status})"
                        )
                    response.raise_for_status()

                    if not binary:
                        # L'API sert le bulletin en `application/json` mais
                        # bascule en `text/plain` sur certaines erreurs
                        # applicatives ; décoder sans vérifier le type évite un
                        # faux négatif sur une réponse pourtant valide.
                        payload = await response.json(content_type=None)
                        if not isinstance(payload, dict) or "product" not in payload:
                            raise VigilanceApiError(
                                "Bulletin inattendu : clé « product » absente"
                            )
                        return payload

                    content = await response.read()
                    if len(content) < MAP_MIN_BYTES:
                        raise VigilanceApiError(
                            f"Vignette tronquée ({len(content)} octets)"
                        )
                    return content

            except VigilanceAuthError:
                raise
            except (ClientResponseError, ClientError, TimeoutError, ValueError) as err:
                last_error = err
                if attempt < API_RETRIES:
                    _LOGGER.debug(
                        "%s : essai %s/%s échoué (%s), nouvelle tentative",
                        url,
                        attempt,
                        API_RETRIES,
                        err,
                    )
                    # Attente croissante : une bascule de bulletin met quelques
                    # secondes à se propager côté Météo France.
                    await asyncio.sleep(API_RETRY_DELAY * attempt)
            except VigilanceApiError as err:
                last_error = err
                if attempt < API_RETRIES:
                    await asyncio.sleep(API_RETRY_DELAY * attempt)

        raise VigilanceApiError(f"{url} : {last_error}") from last_error

    async def async_get_bulletin(self) -> dict[str, Any]:
        """Le bulletin de vigilance en cours, France entière."""
        return await self._async_get(API_BULLETIN, binary=False)

    async def async_get_map(self, period: str) -> bytes:
        """La vignette nationale d'une période (« today » ou « tomorrow »)."""
        return await self._async_get(API_MAP[period], binary=True)
