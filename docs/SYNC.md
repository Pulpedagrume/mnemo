# Synchronisation

Spécification du protocole de synchronisation entre les appareils d’un même compte et un serveur
Mnemo auto-hébergé. Elle a été écrite avant le code (`packages/sync`, routes `/api/v1/sync/*`).

## Exigences

- **Hors ligne d’abord** : chaque appareil garde une copie complète et fonctionne sans réseau.
- **Idempotente** : renvoyer deux fois le même lot ne change rien.
- **Reprenable** : une coupure en plein envoi ou en pleine réception ne perd ni ne duplique rien.
- **Sans perte de révisions** : aucun `ReviewLog` n’est jamais perdu.
- Hors périmètre v1 : chiffrement de bout en bout (voir `SECURITY_MODEL.md`).

## Horloge hybride logique (HLC)

Chaque appareil possède un identifiant `deviceId` (UUIDv7) et une HLC : `(wall, counter, deviceId)`.

- **Émettre** : `wall' = max(wall, maintenant)` ; `counter' = counter + 1` si `wall'` n’a pas
  changé, sinon `0`.
- **Recevoir** une HLC distante `r` : `wall' = max(wall, r.wall, maintenant)` ; le compteur est
  avancé pour rester strictement supérieur aux deux.
- **Encodage** triable comme une chaîne : `WWWWWWWWWWWWW-CCCC-<deviceId>` (13 chiffres
  décimaux pour les millisecondes, 4 chiffres hexadécimaux pour le compteur).

Une HLC ordonne correctement les écritures même si l’horloge d’un appareil retarde : dès qu’il
reçoit une HLC plus récente, ses écritures suivantes sont datées après.

## Métadonnées de synchronisation

Toute entité synchronisable porte, en plus de `updatedAt` (millisecondes, pour l’affichage) et
`deletedAt?` (tombe), un champ facultatif :

```ts
sync?: {
  hlc: string;                   // HLC de la dernière écriture
  fields?: Record<string, string>; // HLC de la dernière écriture de chaque champ
}
```

Les HLC sont posées automatiquement par un **décorateur du `Repository`** côté client : à chaque
écriture, il compare l’ancienne et la nouvelle version et date les champs modifiés. Les services
n’ont rien à faire de particulier.

## Règles de fusion

| entité                                                                                                                                                           | règle                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ReviewLog`                                                                                                                                                      | ajout seulement : union par identifiant, aucun conflit possible                                                                                                          |
| notes, paquets, presets, types de notes, médias (métadonnées), lots d’import                                                                                     | dernière écriture gagnante **par champ** (HLC du champ)                                                                                                                  |
| réglages                                                                                                                                                         | dernière écriture gagnante par clé                                                                                                                                       |
| cartes — champs de planification (`state`, `due`, `interval`, `ease`, `stability`, `difficulty`, `reps`, `lapses`, `step`, `box`, `lastReview`, `schedulerData`) | on garde l’état dont la **dernière révision (`lastReview`) est la plus récente** ; à égalité, la HLC la plus récente                                                     |
| cartes — autres champs (`suspended`, `flag`, `buriedUntil`, `deckId`, `leech`)                                                                                   | dernière écriture gagnante par champ                                                                                                                                     |
| suppression contre modification                                                                                                                                  | la **suppression l’emporte** : une entité supprimée le reste, même si un autre appareil l’a modifiée ensuite (comportement prévisible, réversible depuis une sauvegarde) |

Fonction de maintenance : **reconstruire l’état d’une carte depuis ses journaux** (rejouer les
`ReviewLog` non-bachotage dans l’ordre avec l’algorithme du preset), utile si deux appareils ont
révisé la même carte hors ligne.

## Protocole

Toutes les routes exigent une session ou un jeton d’API de portée `sync`.

### `POST /api/v1/sync/pull`

```json
{ "cursor": 1234, "limit": 1000 }
→ { "changes": [Change, …], "cursor": 1280, "hasMore": false }
```

Le serveur tient, par compte, un **journal de changements** numéroté (`seq` croissant). `cursor`
est le dernier `seq` reçu (0 au départ). Le client applique les changements (même fusion que le
serveur, sans re-dater) puis mémorise le nouveau curseur **après** l’application : une coupure
fait simplement rejouer des changements, ce qui est sans effet (idempotent).

### `POST /api/v1/sync/push`

```json
{ "batchId": "<uuidv7>", "deviceId": "<uuidv7>", "changes": [Change, …] }
→ { "applied": 12, "cursor": 1292 }
```

- Lots de **5 Mo maximum** (corps compressé avec `Content-Encoding: gzip` accepté).
- Le serveur fusionne chaque changement avec son état, ajoute le résultat au journal, et
  mémorise `batchId` : un lot déjà reçu renvoie la même réponse sans rien réappliquer.
- Le client choisit les changements à envoyer : entités dont `updatedAt` est postérieur au
  dernier envoi réussi, et journaux de révision non encore envoyés. Le repère n’avance qu’après
  la réponse du serveur.

`Change` : `{ "kind": "deck" | "preset" | "noteType" | "note" | "card" | "reviewLog" | "media" |
"setting" | "importBatch", "data": { … } }` — `data` est validé par le même schéma Zod que le
client.

### Médias

Adressés par leur SHA-256 :

- `POST /api/v1/sync/media/missing` `{ "sha256": [ … ] }` → `{ "missing": [ … ] }`
- `PUT /api/v1/sync/media/<sha256>` (octets bruts, 5 Mo maximum, hachage vérifié) ;
- `GET /api/v1/sync/media/<sha256>`.

Seuls les fichiers manquants sont transférés.

### Ordre d’une synchronisation côté client

1. envoyer les métadonnées et les contenus de médias manquants ;
2. `push` des changements locaux (par lots) ;
3. `pull` jusqu’à `hasMore = false` ;
4. télécharger les médias référencés absents localement.

La synchronisation se lance au démarrage, au retour du réseau, après une session d’étude, et
toutes les 5 minutes quand l’application est ouverte.

## Annulation d’une révision déjà synchronisée

L’annulation (`Z`) supprime le `ReviewLog` local. S’il a déjà été envoyé, il reviendrait au
prochain `pull` : le client envoie donc le journal avec `deletedAt` (tombe), que le serveur
conserve ; les tombes de journaux sont ignorées par les statistiques. Les envois sont différés de
quelques secondes pour que l’annulation immédiate ne quitte presque jamais l’appareil.

## Tests de conflits (obligatoires)

1. deux appareils hors ligne modifient la même note (champs différents → les deux modifications
   sont conservées ; même champ → la plus récente gagne) ;
2. deux appareils révisent la même carte hors ligne : tous les journaux sont conservés, l’état
   retenu est celui de la révision la plus récente ;
3. suppression contre modification : la suppression l’emporte ;
4. réseau coupé en plein `push` puis renvoi du même lot : aucun doublon ;
5. horloges désynchronisées (un appareil en retard de plusieurs heures) : l’ordre des écritures
   reste correct grâce à la HLC ;
6. coupure pendant un `pull` : reprise depuis le curseur sans perte.

## Notes d’implémentation (`packages/sync`)

- `hlc.ts` (horloge), `merge.ts` + `paths.ts` (fusion pure, partagée client/serveur), `stamp.ts`
  (décorateur `withSyncStamps`), `apply.ts` (application d’un lot de changements), `server.ts`
  (`applyPush`, `handlePull`, interfaces `ChangeLog`/`BatchRegistry`/`MediaBlobStore` et leurs
  versions en mémoire), `client.ts` (`createSyncClient`), `state.ts` (curseur et repères d’envoi,
  stockés sous la clé réservée `sync.state`), `rebuild.ts` (`rebuildCardFromLogs`).
- Les champs d’une note (`fields`) sont datés **par nom de champ** (`sync.fields["fields.recto"]`) :
  deux appareils qui modifient le recto et le verso gardent les deux modifications.
- `sync.fields["*"]` est l’horloge de base : celle de tout champ que l’entité n’a pas réécrit depuis
  (ex. champ facultatif ajouté plus tard sur un autre appareil). Recherche d’une horloge : le champ,
  puis (champ de note) l’horloge de `fields`, puis `*`, puis `sync.hlc`, puis `updatedAt`.
- Le serveur n’ajoute au journal que les changements qui modifient son état (les échos sont
  ignorés) et ne garde que la dernière version de chaque entité dans le journal en mémoire.
- Les repères d’envoi (`lastPushUpdatedAt`, `lastPushLogTs`) sont des lectures de l’horloge locale
  prises **avant** de collecter les changements ; réglages et lots d’import utilisent un repère HLC.
