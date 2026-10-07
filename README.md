# Mnemo

> Répétition espacée paramétrable, avec un import pensé pour l’IA. Local-first, auto-hébergeable.
> _English: [README.en.md](README.en.md) (à venir)._

**Statut : en construction (phase 0 — fondations).** Le plan de réalisation est dans
[docs/PLAN.md](docs/PLAN.md) et les décisions techniques dans [docs/DECISIONS.md](docs/DECISIONS.md).

## Ce que sera Mnemo

- Un moteur de répétition espacée entièrement paramétrable (FSRS, SM-2, style Anki, Leitner,
  paliers libres), avec presets par paquet et simulateur de charge.
- Un import pensé pour l’IA : l’application écrit pour vous le prompt qui transforme un cours en
  fichier d’import fiable (flashcards, textes à trous, QCM, appariements…), puis aide à corriger.
- Local et en ligne avec la même base de code : PWA hors ligne sans compte, ou serveur
  auto-hébergé avec synchronisation.

## Développement

Prérequis : Node.js 22.12+ et pnpm 9.

```bash
pnpm install
pnpm dev      # application web sur http://localhost:5173
pnpm check    # format, lint, types, tests, build
pnpm e2e      # tests de bout en bout (Playwright)
```

## Licence

[MIT](LICENSE). Mnemo est une implémentation indépendante, sans code issu d’Anki (voir [NOTICE](NOTICE)).
