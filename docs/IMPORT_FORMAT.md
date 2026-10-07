# Format d’import `mnemo/1`

Ce document décrit les fichiers que Mnemo sait importer. Il s’adresse aux personnes qui écrivent
des fichiers à la main, aux scripts et aux IA. Le schéma JSON publié
(`schema/mnemo-import.schema.json`, JSON Schema 2020-12) est généré à partir des mêmes schémas
Zod que le validateur : il fait foi.

Formats acceptés : **JSON**, **YAML** (1.2), **Markdown** (« Mnemo Markdown »), **CSV/TSV**, et
les **bundles `.zip`** (un fichier principal `deck.json`, `deck.yaml` ou `deck.md` et un dossier
`media/`). Le format est détecté automatiquement (extension, puis contenu) et peut être forcé.
Tous les formats produisent le même document canonique, validé par le même schéma.

## 1. Document canonique (JSON et YAML)

```yaml
format: mnemo/1 # OBLIGATOIRE
meta: # facultatif, informatif
  title: 'Réseaux — Ethernet'
  language: fr # BCP-47
  source: 'Cours CCNA 1, modules 4 à 7'
  generator: 'nom de l’IA' # texte libre
defaults: # appliqué à chaque note sauf surcharge
  deck: 'Réseaux::Ethernet'
  tags: [ccna]
  type: basic
decks: # facultatif : descriptions et presets
  - path: 'Réseaux::Ethernet'
    description: 'Modules 4 à 7'
    preset: 'Standard' # nom d’un preset existant
media: # facultatif : ressources déclarées
  - id: fig-4-2
    file: media/figure-4-2.png # dans un bundle zip ; ou url: https://… ; ou data: "data:image/png;base64,…"
    alt: 'Schéma d’une trame Ethernet'
notes: # OBLIGATOIRE, non vide
  - uid: eth-4-001
    type: basic
    front: 'Quel est le rôle du champ FCS d’une trame Ethernet ?'
    back: 'Détecter les erreurs de transmission (valeur CRC comparée à la valeur recalculée).'
    hint: 'Le nom signifie Frame Check Sequence.'
    explanation: 'Si les deux valeurs diffèrent, la trame est rejetée.'
    tags: [couche2, trame]
    source: { section: 'Module 5.2' }
continuation: null # texte non vide = l’IA a encore des notes à produire
```

### Clés communes à toutes les notes

| clé           | description                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------- |
| `uid`         | identifiant stable `[A-Za-z0-9._:-]{1,64}` ; sert à la réimportation sans doublon            |
| `type`        | type de note (tableau ci-dessous) ; défaut : `defaults.type`, sinon `basic`                  |
| `deck`        | chemin du paquet avec `::`                                                                   |
| `tags`        | liste, ou chaîne séparée par des espaces ou des virgules                                     |
| `hint`        | indice, ou liste d’indices du plus discret au plus explicite ; ne contient jamais la réponse |
| `explanation` | affichée avec la réponse                                                                     |
| `source`      | objet `{doc, page, section, url}` ou simple texte                                            |
| `difficulty`  | entier de 1 à 5                                                                              |
| `needsReview` | `true` si le contenu est incertain                                                           |
| `extra`       | texte libre affiché après la réponse                                                         |
| `media`       | identifiants de médias déclarés                                                              |

Clé racine `noteTypes` (facultative) : types personnalisés
`{ id, name, fields[], templates[{ name, front, back }], css? }`, utilisables par
`type: custom:<id>` avec une clé `fields` (objet). Les modèles utilisent un sous-ensemble de
Mustache : `{{Champ}}`, `{{#Champ}}…{{/Champ}}`, `{{FrontSide}}`, `{{cloze:Champ}}`,
`{{hint:Champ}}`, `{{type:Champ}}`.

### Types intégrés

| type             | champs                                                                              | cartes générées                |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| `basic`          | `front`, `back`                                                                     | 1                              |
| `basic_reversed` | `front`, `back`                                                                     | 2 (recto→verso et verso→recto) |
| `typed`          | `front`, `answer` (texte ou liste de variantes), `caseSensitive?`, `ignoreAccents?` | 1                              |
| `cloze`          | `text` (avec `{{c1::réponse::indice}}`), `extra?`                                   | 1 par numéro de trou           |
| `mcq`            | `question`, `choices` (`{text, correct?, explanation?}`), `shuffle?` (défaut true)  | 1                              |
| `truefalse`      | `statement`, `answer` (true ou false)                                               | 1                              |
| `matching`       | `question?`, `pairs` (`{left, right}`, 2 à 12), `distractors?`                      | 1                              |
| `ordering`       | `question`, `steps` (dans le BON ordre, 2 à 12)                                     | 1                              |
| `list`           | `question`, `items`, `ordered?` (défaut false)                                      | 1                              |
| `custom:<id>`    | `fields` (objet)                                                                    | selon le modèle déclaré        |

### Règles

- **Cloze** : `{{c1::réponse}}` et `{{c1::réponse::indice}}`, compatibles Anki. Les trous de même
  numéro forment une seule carte. Les accolades équilibrées sont gérées
  (`{{c1::$\frac{a}{b}$}}`) ; `\{` et `\}` sont des accolades littérales. Trous imbriqués refusés
  en v1. Numéros à partir de 1 ; avertissement si un numéro est sauté.
- **QCM** : 2 à 8 propositions, au moins une correcte ; plusieurs correctes = « plusieurs
  réponses ». Variante compacte tolérée : `choices` en liste de textes + `answers` en lettres
  (`["A", "C"]`) ou en numéros à partir de 1 (avertissement de normalisation).
- **Texte des champs** : Markdown (GFM) avec KaTeX (`$…$`, `$$…$$`), blocs de code avec langage,
  tableaux. Images : `![légende](media:fig-4-2)`.
- **Type inconnu** : erreur, avec suggestion du type le plus proche.

### Alias tolérés

Chaque alias produit un avertissement `alias` (refusé en mode strict).

| alias                                | devient                                      |
| ------------------------------------ | -------------------------------------------- |
| `question`, `q`, `recto`             | `front` (types basic, basic_reversed, typed) |
| `réponse`, `r`, `verso`              | `back` (`answer` pour typed et truefalse)    |
| `texte`, `phrase`                    | `text`                                       |
| `indice`, `hints`                    | `hint`                                       |
| `explication`                        | `explanation`                                |
| `étiquettes`, `mots-clés`            | `tags`                                       |
| `paquet`, `deck_name`                | `deck`                                       |
| types `qcm`, `quiz`                  | `mcq`                                        |
| `trous`, `lacunes`, `cloze-deletion` | `cloze`                                      |
| `vf`, `true_false`                   | `truefalse`                                  |
| `association`, `appariement`         | `matching`                                   |
| `ordre`, `sequence`                  | `ordering`                                   |
| `liste`, `enumeration`               | `list`                                       |
| `flashcard`, `carte`                 | `basic`                                      |
| `reversible`, `aller-retour`         | `basic_reversed`                             |

## 2. Mnemo Markdown

Lisible, presque sans échappement, idéal pour le LaTeX et le code.

- **Front-matter YAML** facultatif (`---` … `---`) : `format`, `deck`, `tags`, `language`,
  `source`, `title`, `type`.
- **Directives** hors bloc : `@deck Chemin::Du::Paquet`, `@tags a b c` (s’appliquent aux blocs
  suivants), `@continuation texte`. Tout autre texte hors bloc (titres, prose) est ignoré.
- **Bloc** : `::: <type>` (attributs facultatifs `uid=… deck="A::B" tags="x,y"`) … `:::`.
- **Champs** : `Nom:` en début de ligne (insensible à la casse et aux accents), jusqu’au champ
  suivant ou à `:::`. Une valeur peut couvrir plusieurs lignes. Les blocs de code et `$$` sont
  opaques. Noms : `Front|Q|Question`, `Back|A|Answer|Réponse`, `Text|Texte`, `Extra`,
  `Hint|Indice` (répétable), `Explanation|Explication`, `Source`, `Tags`, `Difficulty`,
  `Statement`, `Answer`.
- **Listes** : QCM `- [x] juste` / `- [ ] faux` ; paires `- gauche => droite` ; étapes
  `1. texte` ; éléments `- texte`.
- **Erreurs** avec numéro de ligne : bloc non fermé, `:::` orphelin, type inconnu.

```markdown
---
format: mnemo/1
deck: Réseaux::Ethernet
tags: [ccna]
---

@tags ethernet couche2

::: basic uid=eth-4-001
Q: Quel est le rôle du champ FCS ?
A: Détecter les erreurs de transmission (CRC).
Hint: Frame Check Sequence.
:::

::: mcq uid=eth-4-003
Q: Quelles propositions décrivent la fibre optique ? (plusieurs réponses)

- [x] Insensible aux interférences électromagnétiques
- [ ] Contient généralement 4 paires de fibres
- [x] Plus chère qu’un câble UTP
      :::
```

## 3. CSV et TSV

Première ligne = en-têtes : `type` (défaut `basic`), `deck`, `tags`, `uid`, `front`, `back`,
`text`, `extra`, `hint`, `explanation`, `source` ; pour `mcq` : `question`, `choice1` à
`choice8`, `correct` (numéros à partir de 1 séparés par `|`). Délimiteur détecté (`,`, `;`,
tabulation), guillemets doublés, UTF-8 avec ou sans BOM, retours à la ligne dans les cellules.
Sans en-têtes reconnus, le fichier est lu comme deux colonnes `front;back` (avertissement).

## 4. Nettoyage tolérant (sorties d’IA)

Avant la validation, Mnemo corrige automatiquement les défauts courants ; **chaque correction est
signalée** par un avertissement :

1. BOM retiré, fins de ligne normalisées ;
2. contenu extrait d’un bloc de code (`json, `yaml, ```markdown…) et prose autour supprimée ;
3. JSON : guillemets typographiques structurels, virgules finales, commentaires, réparation en
   dernier recours ;
4. **fichier tronqué** : toutes les notes complètes avant la coupure sont récupérées, avec la
   dernière `uid` reçue, et un prompt « Continue » est proposé ;
5. YAML : tabulations d’indentation converties ;
6. Markdown : espaces en trop tolérés (`::: type`, `Q :`), puces `*` ou `+` ;
7. alias (table ci-dessus).

Le **mode strict** refuse toute correction automatique.

## 5. Validation et rapport

Chaque note est validée indépendamment : une note invalide ne bloque pas les autres (import
partiel). Chaque problème indique un `code`, une gravité (`error`, `warning`, `info`), un
chemin (`notes[12].choices`), la ligne si elle est connue, un message, la correction conseillée,
éventuellement une suggestion automatique et un extrait. Contrôles : cloze sans trou ou vide,
accolades déséquilibrées, QCM sans bonne réponse ou avec doublons, `uid` en double, image non
déclarée ou manquante, champ très long, indice contenant la réponse, question trop courte, HTML
dangereux supprimé.

Le rapport s’exporte en texte, en JSON, et en **prompt de correction** à recoller dans la même
conversation avec l’IA.

## 6. Import : doublons, modes, annulation

- Une note existante est retrouvée par son `uid`, sinon par le contenu normalisé (type + champ
  principal) dans le même paquet.
- Modes : **ignorer les doublons** (défaut), **mettre à jour** (la planification est conservée),
  **tout ajouter**, **remplacer le paquet** (confirmation explicite).
- Chaque import est une transaction et peut être **annulé** depuis l’historique.
- Limites par défaut : 20 Mo et 20 000 notes par fichier. Zip : nombre d’entrées et taille
  décompressée limités, chemins `..` refusés, 5 Mo maximum par média, type réel vérifié. Images
  distantes désactivées par défaut.

## 7. Export

Paquet ou collection en JSON, YAML, Markdown, CSV, ou bundle `.zip` avec médias, dans ce même
format : `import(export(x))` redonne `x`.

## 8. Anki (.apkg)

Mnemo importe et exporte les paquets Anki `.apkg` (application web : glisser le fichier dans la
zone d’import ; CLI : `mnemo import paquet.apkg`, `mnemo export <paquet> --format apkg`). Le
lecteur est écrit à partir de la description publique du format de collection (base SQLite
`collection.anki21` ou `collection.anki2`, tables `col`, `notes`, `cards`) : aucun code d’Anki
n’est repris. Le paquet est converti en document `mnemo/1` puis passe par la même validation, le
même aperçu, les mêmes modes de fusion et la même annulation que les autres formats.

**Format récent non pris en charge.** Les exports récents d’Anki (`collection.anki21b`,
compressé) sont refusés avec un message clair : dans Anki, réexportez en cochant
« Prendre en charge les anciennes versions d’Anki » (« Support older Anki versions »).

### Import

| Anki                                                       | Mnemo                                         |
| ---------------------------------------------------------- | --------------------------------------------- |
| type de note « texte à trous » (cloze)                     | `cloze` (Text ; les autres champs → `extra`)  |
| 2 champs, 1 modèle `{{Recto}}` / `{{Verso}}` (« Basique ») | `basic`                                       |
| idem avec un 2ᵉ modèle inversé                             | `basic_reversed`                              |
| « Basique (saisir la réponse) » `{{Recto}} {{type:Verso}}` | `typed` (réponse = texte brut du verso)       |
| tout autre type de note                                    | `custom:anki-<nom>-<id>` + définition du type |
| paquets `A::B`, étiquettes, `guid` de la note              | chemin de paquet, tags, `uid: anki-<guid>`    |

- **Champs** : le HTML courant est converti en Markdown (gras, italique, listes, liens, retours à
  la ligne, `<div>`/`<p>`, code) ; `<u>`, `<sub>`, `<sup>` restent en HTML ; les styles en ligne
  (`<span style>`, `<font>`) sont retirés (info) ; le reste (tableaux…) est gardé en HTML et
  nettoyé à l’affichage (info `html_sanitized`). MathJax `\(…\)` / `\[…\]` devient `$…$` /
  `$$…$$`.
- **Images** : `<img src="x.png">` devient `![](media:x.png)` ; le fichier est pris dans le paquet
  (même contrôle de type réel et de taille que les bundles `.zip`). Image absente : retirée
  (avertissement).
- **Sons** : `[sound:…]` n’est pas pris en charge (avertissement) ; la note est importée sans le
  son.
- **Modèles personnalisés** : `{{Champ}}`, `{{#Champ}}…{{/Champ}}`, `{{^Champ}}`, `{{FrontSide}}`,
  `{{cloze:}}`, `{{type:}}`, `{{hint:}}`, `{{text:}}` sont conservés ; les autres filtres
  (`furigana:`, `tts`…) et champs spéciaux (`{{Tags}}`, `{{Deck}}`…) sont retirés
  (avertissement). Le CSS du type de note est conservé.
- **Réimport** : l’`uid` vient du `guid` Anki, donc réimporter le même paquet met à jour ou ignore
  les notes au lieu de les dupliquer.
- **Planification** (option, désactivée par défaut : les cartes repartent comme nouvelles) :
  CLI `--with-scheduling`. État, échéance, intervalle, facilité (`factor / 1000`), répétitions,
  oublis et cartes suspendues sont repris pour les notes créées par l’import (une note mise à jour
  garde sa planification). Les états non reconnus (aperçu…) repartent comme nouveaux
  (avertissement). L’historique des révisions (`revlog`) n’est pas importé.

### Export

- `basic`, `basic_reversed` et `cloze` deviennent les types standards d’Anki « Basic »,
  « Basic (and reversed card) » et « Cloze » ; le Markdown est converti en HTML et les images
  sont jointes au paquet.
- Les autres types (QCM, vrai/faux, association, ordre, liste, saisie, types personnalisés)
  deviennent une note « Basic » **par carte**, avec le recto et le verso rendus : l’interactivité
  est perdue (avertissement).
- Les explications et le champ `extra` sont ajoutés à la réponse ; les indices ne sont pas
  exportés (avertissement). Les cartes sont exportées comme nouvelles (sans planification).
- Le `guid` Anki est stable : `mnemo:<uid>` (ou l’`uid` d’origine pour une note venue d’Anki), si
  bien que l’aller-retour Mnemo → Anki → Mnemo retrouve les mêmes notes.
