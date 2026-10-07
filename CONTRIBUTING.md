# Contribuer à Mnemo

Merci de votre intérêt ! Ce guide explique comment installer le projet, les conventions à suivre
et comment étendre Mnemo (algorithme, type de note, format d’import, tâche de prompt).

## Installation

Prérequis : Node.js 22.13+ et pnpm 9 (`corepack enable` ou `npm i -g pnpm@9`).

```bash
pnpm install
pnpm dev          # application web sur http://localhost:5173
pnpm check        # format, lint, types, tests, build
pnpm e2e          # tests de bout en bout (Playwright ; `pnpm --filter @mnemo/web exec playwright install chromium` la première fois)
```

L’organisation du code est décrite dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et les
choix techniques dans [docs/DECISIONS.md](docs/DECISIONS.md).

## Conventions

- **TypeScript strict**, pas de `any` sans justification en commentaire, modules courts
  (~300 lignes), fonctions pures dans `packages/core`.
- **Jamais** `Date.now()`, `new Date()` ou `Math.random()` dans la logique métier : injectez
  `Clock` et `Rng` (ESLint le vérifie dans `core`).
- **Aucune logique métier dans les composants React** : passez par `@mnemo/services`.
- **Langues** : code, commentaires et messages de commit en anglais ; interface, documentation
  utilisateur et prompts IA en français et en anglais. Aucune chaîne en dur dans l’interface
  (`apps/web/src/i18n/locales/{fr,en}.json`, mêmes clés dans les deux fichiers).
- **Accessibilité** : clavier complet, focus visible, jamais d’information portée par la seule
  couleur, libellés pour tous les contrôles.
- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `chore:`…).
- **Dépendances** : maintenues, licence compatible MIT (`pnpm check:licenses`), justifiées dans
  `docs/DECISIONS.md` si elles sont lourdes. **Aucun code copié d’Anki** (licence AGPL).
- Une fonctionnalité sans test n’est pas terminée ; un parcours utilisateur a son test e2e.

## Ajouter un algorithme de répétition

1. Créez `packages/core/src/scheduling/algorithms/<id>.ts` qui implémente l’interface
   `Scheduler` (`scheduling/types.ts`) : `paramSpec` (le formulaire de réglages en est généré),
   `validate`, `initCard`, `schedule`, `preview`, `adopt` (conversion depuis un autre algorithme).
2. Enregistrez-le avec `registerScheduler()` ou ajoutez-le à `BUILTIN_SCHEDULERS`.
3. Ajoutez des tests à horloge figée, des tests de propriétés et une simulation (voir les tests des
   algorithmes existants), puis documentez-le dans [docs/SCHEDULERS.md](docs/SCHEDULERS.md).

## Ajouter un type de note

1. Décrivez-le dans `packages/core/src/notetypes/` : champs, génération des cartes
   (`generateCardOrds`), rendu (`renderCard`) et, s’il est interactif, sa correction (`grade.ts`)
   et son contenu structuré (`NoteDataSchema`).
2. Pour une extension sans toucher au cœur : `registerNoteType({ noteType, generate, render })`.
3. Côté import : schéma dans `packages/importers/src/format/schema.ts` et description dans
   `format/specs.ts` (les prompts IA et la documentation en sont générés).
4. Côté interface : un widget dans `apps/web/src/components/study/widgets/` et un éditeur dans
   `apps/web/src/features/editor/DataEditor.tsx`.

## Ajouter un format d’import

Ajoutez un analyseur dans `packages/importers/src/parse/` qui produit le document canonique : la
validation, le rapport d’erreurs, l’aperçu et la fusion sont communs à tous les formats. Ajoutez
des fixtures valides et invalides dans `packages/importers/fixtures/` avec leurs résultats
attendus, et le sérialiseur inverse dans `src/export/` pour garder l’aller-retour.

## Ajouter une tâche de prompt

1. Écrivez `prompts/fr/task-<id>.md` et `prompts/en/task-<id>.md` (mêmes variables).
2. Déclarez la tâche dans `packages/prompts/src/tasks.ts` (types de notes produits, formats).
3. `pnpm --filter @mnemo/prompts templates` régénère le module embarqué et la documentation ;
   les tests vérifient l’absence de variables non résolues, le budget de tokens et la validité
   des exemples.

## Signaler un problème

Utilisez les modèles d’issue (bogue, fonctionnalité, **problème d’import IA**). Pour une faille de
sécurité, suivez [SECURITY.md](SECURITY.md).
