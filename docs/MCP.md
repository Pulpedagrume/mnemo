# Serveur MCP

Mnemo fournit un serveur [MCP](https://modelcontextprotocol.io) (Model Context Protocol) : votre
assistant IA (Claude Code, Claude Desktop, Cursor, VS Code…) peut composer un prompt, valider un
fichier de cartes, l’importer dans votre collection **après votre confirmation**, puis consulter
vos paquets et vos révisions du jour.

Le serveur travaille sur la **même collection locale** que `mnemo serve` et la CLI : le dossier de
données (`DATA_DIR`, par défaut `~/.mnemo`), utilisateur `local`. Les écritures sont horodatées et
inscrites dans le journal de synchronisation, comme un import par l’API : vos appareils
synchronisés reçoivent les nouvelles cartes à leur prochaine synchronisation.

## Outils

| Outil                   | Rôle                                                                                                                                        | Écrit ?                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `mnemo_get_schema`      | JSON Schema (2020-12) du format d’import `mnemo/1`                                                                                          | non                       |
| `mnemo_get_prompt`      | prompt composé : `task`, `format`, `lang`, `deck`, `level`, `density`, `hints`, `explanations`                                              | non                       |
| `mnemo_validate_import` | analyse un fichier : compteurs, problèmes (code, gravité, uid, ligne, message, correction) et **prompt de correction** s’il y a des erreurs | non                       |
| `mnemo_import_notes`    | import en deux temps : simulation (dry run) puis import confirmé                                                                            | oui, avec `confirm: true` |
| `mnemo_list_decks`      | arbre des paquets avec les compteurs du jour (nouvelles, en apprentissage, à revoir)                                                        | non                       |
| `mnemo_search_notes`    | recherche (texte, paquet et sous-paquets, étiquette ; 50 résultats au plus)                                                                 | non                       |
| `mnemo_due_summary`     | cartes du jour par paquet, total, révisions faites aujourd’hui, prévision sur 7 jours                                                       | non                       |

Les tâches de `mnemo_get_prompt` sont celles de [AI_PROMPTS.md](AI_PROMPTS.md) : `flashcards`,
`cloze`, `mcq`, `course-pack`, `vocabulary`, `formulas`, `code`, `timeline`, `convert`, `audit`,
`images`. `lang` vaut `fr` (par défaut) ou `en` et choisit aussi la langue des messages de
validation.

## Ressources

| URI                          | Contenu                              |
| ---------------------------- | ------------------------------------ |
| `mnemo://schema/import`      | JSON Schema du format d’import       |
| `mnemo://docs/import-format` | [IMPORT_FORMAT.md](IMPORT_FORMAT.md) |
| `mnemo://docs/ai-prompts`    | [AI_PROMPTS.md](AI_PROMPTS.md)       |

Les deux documents sont copiés à côté du binaire au build (`apps/mcp/dist/docs/`) ; à défaut, le
serveur renvoie un court résumé.

## Installation

Prérequis : Node.js 22.13+ (le stockage utilise `node:sqlite`).

Depuis un clone du dépôt :

```bash
pnpm install
pnpm --filter @mnemo/mcp build
claude mcp add mnemo -- node /chemin/vers/mnemo/apps/mcp/dist/main.mjs
```

Une fois le paquet publié, la commande devient :

```bash
claude mcp add mnemo -- npx mnemo-mcp
```

Options : `--data-dir <dossier>` (sinon `$DATA_DIR` ou `~/.mnemo`), `--user <id>` (collection d’un
autre utilisateur d’un serveur multi-comptes, `local` par défaut), `--http`, `--host`, `--port`.
`mnemo-mcp --help` les rappelle.

### Configuration JSON (Claude Desktop, Cursor, VS Code…)

La plupart des clients acceptent un bloc `mcpServers` (fichier `claude_desktop_config.json`,
`.cursor/mcp.json`, `.mcp.json`…) :

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["/chemin/vers/mnemo/apps/mcp/dist/main.mjs"],
      "env": { "DATA_DIR": "/chemin/vers/mes-donnees" }
    }
  }
}
```

Avec le paquet publié : `"command": "npx", "args": ["mnemo-mcp"]`.

## Le flux de confirmation

Le serveur **n’écrit jamais sans confirmation** :

1. L’assistant appelle `mnemo_import_notes` **sans** `confirm` : c’est une simulation. Rien n’est
   écrit ; la réponse donne le plan (notes à créer, mettre à jour, ignorer ; paquets à créer ;
   erreurs du fichier) et une consigne : montrer ce résumé et demander votre accord.
2. Si vous acceptez, l’assistant rappelle l’outil avec **exactement le même texte et les mêmes
   options** et `confirm: true`.

Un import réel est refusé si ce texte, avec ces options (`fileName`, `format`, `mode`,
`targetDeck`), n’a pas été simulé auparavant par ce serveur. Chaque simulation n’autorise qu’un
seul import et expire au bout de 30 minutes. L’empreinte conservée est un SHA-256 du texte et des
options (le texte lui-même n’est pas gardé).

Après l’import, la réponse donne l’identifiant du lot (`importBatchId`) : l’import s’annule
depuis l’historique des imports de l’application. Les fichiers partiellement valides importent
leurs notes valides, comme la CLI ; le résumé de simulation indique les erreurs.

Modes (`mode`) : `skip-duplicates` (par défaut, un nouvel import du même fichier ne crée rien),
`update`, `add`, `replace-deck`. Les notes sans paquet vont dans `targetDeck` (`Import` par défaut).

## Mode HTTP

```bash
node apps/mcp/dist/main.mjs --http                 # http://127.0.0.1:8791/mcp
```

Transport « Streamable HTTP » du SDK MCP, sans état (chaque requête POST est traitée
indépendamment ; les simulations sont partagées par le processus). Côté client :

```json
{ "mcpServers": { "mnemo": { "type": "http", "url": "http://127.0.0.1:8791/mcp" } } }
```

- Par défaut, le serveur n’écoute que sur `127.0.0.1` et refuse les en-têtes `Host` ou `Origin`
  qui ne désignent pas la machine locale (protection contre le DNS rebinding).
- Si la variable `MNEMO_MCP_TOKEN` est définie, chaque requête doit porter
  `Authorization: Bearer <jeton>`.
- Écouter sur une autre adresse (`--host 0.0.0.0`) **exige** `MNEMO_MCP_TOKEN` : le serveur refuse
  de démarrer sans. Utilisez un jeton long et aléatoire (`openssl rand -hex 32`) et un tunnel ou
  un proxy HTTPS : le serveur MCP ne chiffre pas les échanges.

## Sécurité

- Données locales : le serveur lit et écrit la collection SQLite de votre dossier de données ; il
  n’envoie rien sur le réseau et n’ouvre aucun port en mode stdio (le mode par défaut).
- Tout ce qui vient de l’assistant est traité comme non fiable : arguments validés par Zod, fichier
  analysé par le même pipeline que l’application (limites de taille, nettoyage, validation note par
  note).
- Accès concurrent : les appels du serveur MCP sont sérialisés. SQLite gère l’accès simultané avec
  un `mnemo serve` lancé à côté, mais l’ordre des écritures n’est garanti qu’au sein d’un même
  processus : évitez d’importer par la CLI, l’API et le MCP au même instant.
- Le texte des notes renvoyé par `mnemo_search_notes` est tronqué (160 caractères) et provient de
  votre collection : l’assistant le reçoit tel quel.
