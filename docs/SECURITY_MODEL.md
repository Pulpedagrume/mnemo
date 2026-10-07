# Modèle de sécurité

Ce document décrit ce que le serveur Mnemo auto-hébergé protège, contre qui, et ce qu’il ne
protège pas. Pour signaler une vulnérabilité : voir `SECURITY.md`.

## Ce qui est protégé, et contre qui

| actif                 | menace                                                                                    | mesures                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| comptes               | vol de mot de passe, force brute                                                          | argon2id (19 Mio, 2 itérations), 10 caractères minimum ; 10 tentatives de connexion / 5 min / IP ; même réponse et temps comparable pour un e-mail inconnu                                                                                                                                                                                                                    |
| sessions              | vol de cookie, CSRF                                                                       | cookie `HttpOnly`, `SameSite=Lax`, `Secure` + préfixe `__Host-` derrière HTTPS, 30 jours ; identifiant aléatoire de 256 bits stocké **haché** (HMAC-SHA-256 avec `SESSION_SECRET`) ; jeton CSRF exigé (en-tête `x-csrf-token`, qu’un formulaire ou un site tiers ne peut pas poser) sur toute requête d’écriture authentifiée par cookie                                      |
| jetons d’API          | fuite, abus                                                                               | préfixe `mnemo_` (détectable par les scanners de secrets), affichés une seule fois, stockés hachés, portées (`read`, `import`, `sync`, `admin`), expiration, révocation ; un jeton ne peut ni créer de jeton ni supprimer le compte                                                                                                                                           |
| collections           | accès par un autre utilisateur                                                            | une base SQLite par utilisateur (`users/<id>.sqlite`), sélectionnée uniquement depuis l’identité authentifiée, jamais depuis un paramètre                                                                                                                                                                                                                                     |
| serveur               | déni de service, fichiers malveillants                                                    | limitation de débit (globale, et plus stricte sur connexion, inscription, import, synchronisation) ; taille des corps bornée (`MAX_UPLOAD_MB`, 5 Mo par lot de synchronisation **après** décompression gzip, 5 Mo par média) ; archives zip vérifiées (nombre d’entrées, tailles déclarées et réelles, chemins) ; tout est validé par Zod ; requêtes SQL préparées uniquement |
| navigateur            | XSS, clickjacking                                                                         | CSP stricte (ci-dessous), HTML des cartes assaini (DOMPurify), `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS derrière HTTPS ; CORS : même origine seulement, sauf origines listées dans `CORS_ORIGINS`                                                                                          |
| mode mono-utilisateur | site web malveillant visité sur la même machine, _DNS rebinding_, exposition par un proxy | refus de démarrer sans authentification sur une adresse ou une `BASE_URL` publique ; en-tête `Host` local obligatoire ; requêtes relayées refusées ; jeton CSRF obligatoire pour écrire (illisible depuis une autre origine)                                                                                                                                                  |
| traçabilité           | import abusif via un jeton                                                                | journal d’audit des imports (date, fichier, mode, nombre de notes, jeton ou session, adresse IP)                                                                                                                                                                                                                                                                              |

### Politique de sécurité du contenu (CSP)

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self';
connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Vérifiée sur le build Vite : aucun script en ligne, aucun `eval`, workers et service worker
servis depuis l’origine. `style-src 'unsafe-inline'` est nécessaire car KaTeX produit des
attributs `style="…"` dans le HTML (assaini) des cartes et le verrouillage du défilement des
boîtes de dialogue injecte un élément `<style>`. Cette exception ne permet pas d’exécuter de code.

## Ce qui n’est PAS protégé (v1)

- **Pas de chiffrement de bout en bout.** Les données sont chiffrées en transit (HTTPS, à
  configurer devant le serveur) mais stockées **en clair** dans `DATA_DIR`.
- **L’opérateur du serveur voit tout** : adresses e-mail, contenu des cartes et des médias,
  historique de révision (dates, réponses, durées), journal d’audit, adresses IP dans les logs.
  N’utilisez un serveur que si vous faites confiance à la personne qui l’administre — ou
  hébergez-le vous-même.
- **Pas de chiffrement au repos** : chiffrez le disque (LUKS, volume chiffré de l’hébergeur) et
  les sauvegardes si nécessaire.
- **Pas de double authentification ni de réinitialisation de mot de passe par e-mail** (SMTP est
  réservé pour une version ultérieure). Un administrateur peut supprimer un compte en base.
- **Pas de verrouillage de compte** au-delà de la limitation de débit par adresse IP.
- **Un appareil compromis** (navigateur, extension malveillante) a accès à la copie locale
  complète et à la session ; la révocation des sessions se fait en changeant `SESSION_SECRET`.
- `SESSION_SECRET` compromis : les hachés de jetons deviennent attaquables hors ligne (ils restent
  des secrets aléatoires de 256 bits, donc pratiquement impossibles à retrouver) ; changez-le.

## Données conservées par le serveur

Voir `docs/PRIVACY.md`. En résumé : compte (e-mail, haché du mot de passe), sessions et jetons
(hachés), collection, journal de synchronisation, contenus des médias, journal d’audit des
imports. Aucune télémétrie, aucun appel vers un service tiers.

## Hypothèses

- Le serveur tourne derrière un proxy HTTPS (`deploy/Caddyfile`) avec `BASE_URL` en `https://`
  et `TRUST_PROXY` réglé, sinon les cookies ne sont pas `Secure` et les IP sont celles du proxy.
- `DATA_DIR` n’est lisible que par l’utilisateur du service (l’image Docker tourne en `node`,
  non root, système de fichiers en lecture seule hors `/data`).
- Une seule instance accède à `DATA_DIR` (SQLite).
