# Politique de confidentialité (modèle)

> Modèle à adapter par la personne ou l’organisation qui héberge un serveur Mnemo. Remplacez les
> passages entre crochets. Mnemo est un logiciel libre ; son éditeur n’a **aucun accès** aux
> données d’un serveur auto-hébergé.

**Responsable du traitement** : [nom, adresse, e-mail de contact].
**Dernière mise à jour** : [date].

## 1. Données traitées

| donnée                                                                  | pourquoi                                                                       | base légale                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| adresse e-mail                                                          | identifier votre compte, vous connecter                                        | exécution du service        |
| mot de passe                                                            | authentification ; seul un haché argon2id est conservé, jamais le mot de passe | exécution du service        |
| contenu de vos paquets, notes, cartes, médias, réglages                 | fournir le service (étude, synchronisation entre vos appareils)                | exécution du service        |
| historique de révision (date, réponse, durée)                           | planifier les révisions, statistiques                                          | exécution du service        |
| sessions et jetons d’API (sous forme hachée), dates d’utilisation       | sécurité de votre compte                                                       | intérêt légitime (sécurité) |
| journal des imports (date, nom de fichier, nombre de notes, adresse IP) | sécurité, diagnostic                                                           | intérêt légitime (sécurité) |
| journaux techniques du serveur (adresse IP, URL, code de réponse)       | sécurité, diagnostic                                                           | intérêt légitime            |

Mnemo **n’envoie aucune télémétrie**, n’utilise aucun traceur, aucune publicité et n’appelle aucun
service tiers. Le seul cookie est le cookie de session, strictement nécessaire (pas de bandeau de
consentement requis).

## 2. Où sont les données

Sur le serveur de [l’hébergeur], situé [pays]. Elles ne sont ni vendues ni transmises à des tiers.
[Sous-traitant d’hébergement : nom, pays.]

Les données ne sont **pas chiffrées de bout en bout** : l’administrateur du serveur peut
techniquement y accéder (voir `docs/SECURITY_MODEL.md`). Il s’engage à ne le faire que pour la
maintenance ou sur demande légale.

## 3. Durée de conservation

- compte et collection : tant que le compte existe ;
- sessions : 30 jours au plus ; jetons : jusqu’à leur expiration ou révocation ;
- journal des imports : jusqu’à la suppression du compte ;
- journaux techniques : [14] jours ;
- sauvegardes du serveur : [30] jours.

## 4. Vos droits (RGPD)

- **Accès et portabilité** : téléchargez à tout moment une sauvegarde complète de votre
  collection (paramètres → exporter, ou `GET /api/v1/account/export`), dans un format ouvert
  (zip contenant du JSON et vos médias), réimportable dans Mnemo.
- **Effacement** : supprimez votre compte (paramètres → supprimer le compte, ou
  `DELETE /api/v1/account` avec votre mot de passe) : compte, sessions, jetons, journal des imports
  et fichiers de votre collection sont supprimés immédiatement ; les copies dans les sauvegardes
  du serveur disparaissent au bout de [30] jours.
- **Rectification** : modifiez vos données dans l’application.
- **Réclamation** : [e-mail] ; vous pouvez aussi saisir l’autorité de contrôle (en France, la CNIL).

## 5. Sécurité

Connexion chiffrée (HTTPS), mots de passe hachés (argon2id), jetons hachés, cookies
`HttpOnly`/`Secure`/`SameSite`, limitation des tentatives, en-têtes de sécurité. Détails :
`docs/SECURITY_MODEL.md`.
