"""Flux de configuration : la clé d'API et les départements à suivre.

La clé est vérifiée en interrogeant réellement l'API, et les départements
demandés sont cherchés dans le bulletin obtenu : une faute de frappe est donc
signalée à la saisie, et non trois heures plus tard par un capteur vide.
"""

from __future__ import annotations

from collections.abc import Mapping
import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.selector import (
    BooleanSelector,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    SelectOptionDict,
    SelectSelector,
    SelectSelectorConfig,
    SelectSelectorMode,
    TextSelector,
    TextSelectorConfig,
    TextSelectorType,
)

from .api import VigilanceApi, VigilanceApiError, VigilanceAuthError
from .const import (
    CONF_API_KEY,
    CONF_DEPARTMENTS,
    CONF_MAPS,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DEPARTMENTS,
    DOMAIN,
    MAX_SCAN_INTERVAL,
    MIN_SCAN_INTERVAL,
)

_LOGGER = logging.getLogger(__name__)

# Les départements proposés, dans l'ordre des codes. « FRA » n'y est pas : le
# national est déjà porté par les deux cartes, et un capteur « France » ne
# dirait rien d'actionnable.
DEPARTMENT_OPTIONS: list[SelectOptionDict] = [
    SelectOptionDict(value=code, label=f"{code} — {name}")
    for code, name in sorted(DEPARTMENTS.items())
    if code != "FRA"
]

DEPARTMENT_SELECTOR = SelectSelector(
    SelectSelectorConfig(
        options=DEPARTMENT_OPTIONS,
        multiple=True,
        # Pour saisir une zone littorale (3010, 6410…), qui existe dans l'API
        # mais n'a pas de nom publié.
        custom_value=True,
        mode=SelectSelectorMode.DROPDOWN,
        sort=False,
    )
)

INTERVAL_SELECTOR = NumberSelector(
    NumberSelectorConfig(
        min=MIN_SCAN_INTERVAL,
        max=MAX_SCAN_INTERVAL,
        step=5,
        mode=NumberSelectorMode.BOX,
        unit_of_measurement="min",
    )
)

# La saisie d'une clé seule : partagée par la ré-authentification (clé refusée
# en cours de route) et la reconfiguration (remplacement volontaire).
API_KEY_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_API_KEY): TextSelector(
            TextSelectorConfig(type=TextSelectorType.PASSWORD)
        )
    }
)


def _settings_schema(defaults: Mapping[str, Any]) -> vol.Schema:
    """Ce qui est modifiable après coup : les départements et le rythme."""
    return vol.Schema(
        {
            vol.Required(
                CONF_DEPARTMENTS, default=list(defaults.get(CONF_DEPARTMENTS, []))
            ): DEPARTMENT_SELECTOR,
            vol.Required(
                CONF_MAPS, default=defaults.get(CONF_MAPS, True)
            ): BooleanSelector(),
            vol.Required(
                CONF_SCAN_INTERVAL,
                default=defaults.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ): INTERVAL_SELECTOR,
        }
    )


async def _async_validate(
    hass, api_key: str, departments: list[str]
) -> tuple[dict[str, str], list[str]]:
    """Appeler l'API et vérifier que les départements demandés y figurent.

    Renvoie les erreurs de formulaire et la liste des domaines connus du
    bulletin — la seconde sert à écrire un message qui nomme ce qui manque.
    """
    # Un seul essai : le formulaire attend, et resoummettre relance. L'échelle
    # complète de nouveaux essais reste celle du coordinateur.
    api = VigilanceApi(async_get_clientsession(hass), api_key, retries=1)
    try:
        payload = await api.async_get_bulletin()
    except VigilanceAuthError:
        return {"base": "invalid_auth"}, []
    except VigilanceApiError as err:
        _LOGGER.debug("Vérification de la clé impossible : %s", err)
        return {"base": "cannot_connect"}, []

    known = {
        str(domain.get("domain_id"))
        for period in payload.get("product", {}).get("periods", [])
        for domain in period.get("timelaps", {}).get("domain_ids", [])
    }
    unknown = [code for code in departments if code not in known]
    if unknown:
        return {CONF_DEPARTMENTS: "unknown_department"}, sorted(known)
    return {}, sorted(known)


class VigilanceConfigFlow(ConfigFlow, domain=DOMAIN):
    """Création de l'entrée, et renouvellement de la clé."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Saisie de la clé d'API et des départements."""
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}

        if user_input is not None:
            departments = list(user_input[CONF_DEPARTMENTS])
            errors, known = await _async_validate(
                self.hass, user_input[CONF_API_KEY], departments
            )
            if not errors:
                return self.async_create_entry(
                    title="Vigilance Météo France",
                    data={
                        CONF_API_KEY: user_input[CONF_API_KEY].strip(),
                        CONF_DEPARTMENTS: departments,
                    },
                    options={
                        CONF_MAPS: user_input[CONF_MAPS],
                        CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL]),
                    },
                )
            if known:
                placeholders["unknown"] = ", ".join(
                    code for code in departments if code not in known
                )

        defaults = user_input or {CONF_SCAN_INTERVAL: DEFAULT_SCAN_INTERVAL}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_API_KEY, default=defaults.get(CONF_API_KEY, "")
                ): TextSelector(TextSelectorConfig(type=TextSelectorType.PASSWORD)),
            }
        ).extend(_settings_schema(defaults).schema)

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
            description_placeholders=placeholders,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        """Clé refusée en cours de route : en redemander une."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Remplacer la clé sans toucher aux départements ni aux entités."""
        errors: dict[str, str] = {}
        entry = self._get_reauth_entry()

        if user_input is not None:
            errors, _ = await _async_validate(
                self.hass,
                user_input[CONF_API_KEY],
                list(entry.data.get(CONF_DEPARTMENTS, [])),
            )
            if not errors:
                return self.async_update_reload_and_abort(
                    entry,
                    data={
                        **entry.data,
                        CONF_API_KEY: user_input[CONF_API_KEY].strip(),
                    },
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=API_KEY_SCHEMA,
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Remplacer la clé sans attendre qu'elle soit refusée.

        C'est le pendant volontaire de la ré-authentification : une clé sur le
        point d'expirer, ou régénérée sur le portail, se remplace ici avant que
        les mises à jour ne tombent. Même garantie que partout : la clé est
        essayée sur l'API avant d'être enregistrée, et rien d'autre ne bouge —
        ni les départements, ni les entités.
        """
        errors: dict[str, str] = {}
        entry = self._get_reconfigure_entry()

        if user_input is not None:
            errors, _ = await _async_validate(
                self.hass,
                user_input[CONF_API_KEY],
                list(entry.data.get(CONF_DEPARTMENTS, [])),
            )
            if not errors:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={CONF_API_KEY: user_input[CONF_API_KEY].strip()},
                )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=API_KEY_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry) -> OptionsFlow:
        """Les options : départements, cartes, intervalle."""
        return VigilanceOptionsFlow()


class VigilanceOptionsFlow(OptionsFlow):
    """Modification de ce qui n'oblige pas à ressaisir la clé."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Enregistrer les options, après avoir revalidé les départements."""
        entry = self.config_entry
        errors: dict[str, str] = {}
        placeholders: dict[str, str] = {}

        if user_input is not None:
            departments = list(user_input[CONF_DEPARTMENTS])
            errors, known = await _async_validate(
                self.hass, entry.data[CONF_API_KEY], departments
            )
            if not errors:
                # Le département vit dans `data` — il définit les entités — et
                # le reste dans `options`. Les deux sont écrits ici pour que
                # tout soit modifiable depuis un seul écran.
                self.hass.config_entries.async_update_entry(
                    entry,
                    data={**entry.data, CONF_DEPARTMENTS: departments},
                )
                return self.async_create_entry(
                    data={
                        CONF_MAPS: user_input[CONF_MAPS],
                        CONF_SCAN_INTERVAL: int(user_input[CONF_SCAN_INTERVAL]),
                    }
                )
            if known:
                placeholders["unknown"] = ", ".join(
                    code for code in departments if code not in known
                )

        defaults = user_input or {**entry.data, **entry.options}
        return self.async_show_form(
            step_id="init",
            data_schema=_settings_schema(defaults),
            errors=errors,
            description_placeholders=placeholders,
        )
