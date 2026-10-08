# Changelog

Toutes les évolutions notables de ce projet sont consignées ici.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet respecte
le [versionnage sémantique](https://semver.org/lang/fr/).

## [Unreleased]

## [0.1.0] - 2026-10-07

Première version publique.

### Ajouté

- **Étude** : paquets hiérarchiques, neuf types de notes intégrés (recto/verso, inversé, réponse
  à saisir, textes à trous, QCM, vrai/faux, appariement, remise en ordre, liste) et types
  personnalisés à modèles ; indices progressifs avec politique de notation ; raccourcis clavier ;
  annulation des 10 dernières actions ; étude personnalisée ; résumé de session.
- **Planification** : FSRS (via `ts-fsrs`), SM-2, style Anki, Leitner et paliers ; presets par
  paquet avec héritage et limites par sous-arbre ; conversion entre algorithmes avec aperçu de
  l’effet ; simulateur de charge dans un Web Worker avec comparaison de presets.
- **Import pensé pour l’IA** : format canonique `mnemo/1` (JSON, YAML, Mnemo Markdown, CSV/TSV,
  bundles zip, Anki `.apkg`), nettoyage tolérant des sorties d’IA (blocs de code, guillemets,
  virgules, fichiers tronqués), validation note par note et rapport bilingue, import partiel,
  fusion sans doublon par `uid` ou contenu, annulation des imports, schéma JSON publié.
- **Prompts** : assistant en 4 étapes, 11 tâches en français et en anglais, prompts de
  correction, de reprise (« Continue »), de plan et de lots pour les longs documents ; Guide IA.
- **Exports** : JSON, YAML, Markdown, CSV, zip avec médias, `.apkg` ; sauvegarde et restauration
  complètes.
- **Interface** : PWA installable et hors ligne, thème clair/sombre/système, taille de texte,
  français et anglais, navigateur de notes, éditeur avec aperçu en direct, statistiques
  accessibles avec export CSV.
- **Serveur auto-hébergé** : API Fastify (comptes argon2id, sessions, CSRF, jetons d’API à
  portées, limites de débit, en-têtes stricts), mode mono-utilisateur local, synchronisation
  hors ligne d’abord (HLC, fusion par champ, journaux de révision jamais perdus), export et
  suppression de compte, Docker, Caddy.
- **Intégrations** : CLI `mnemo` (`validate`, `prompt`, `schema`, `import`, `export`, `serve`),
  API d’import, serveur MCP (`mnemo-mcp`).
- **Qualité** : plus de 1 200 tests unitaires, tests de propriétés, fuzz, tests de conformité des
  stockages, scénarios d’acceptation A1–A7 en Playwright (bureau et mobile), CI (lint, types,
  tests, e2e, licences, audit, secrets), workflow de release (GHCR, GitHub Pages).
- **Publication** : page « Mentions légales et confidentialité », politique de sécurité du
  contenu dans la version statique, texte intégral des licences tierces livré avec l’application.

[Unreleased]: https://github.com/OWNER/REPO/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/REPO/releases/tag/v0.1.0
