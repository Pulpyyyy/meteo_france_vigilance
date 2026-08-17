# Changelog

## 1.0.0 — 2026-08-17

Première publication HACS.

* Restructuration du dépôt au format HACS
  (`custom_components/meteo_france_vigilance/`, `hacs.json`, workflow de
  validation hassfest + HACS).
* Intégration complète : entrée de configuration (clé d'API, départements,
  cartes nationales, intervalle), deux capteurs par département
  (aujourd'hui / demain), deux caméras pour les vignettes nationales.
* Carte Lovelace embarquée `meteo-france-vigilance-card`, servie et
  enregistrée automatiquement par l'intégration — aucune ressource à déclarer.
  Quatre dispositions (`duo`, `focus`, `compact`, `chronologie`) et quatre
  thèmes (`officiel`, `bandeau`, `plein`, `sobre`), éditeur graphique à
  vignettes cliquables.
* Département retrouvé par son code (et non par sa position dans la réponse),
  bulletin périmé signalé (`expired`), nouveaux essais gérés dans le client
  HTTP, vignettes gardées en mémoire (rien n'est écrit dans `www/`).
