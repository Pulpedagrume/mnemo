# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** (private vulnerability
reporting) on this repository. Include the affected version or commit, a description, the impact
and steps to reproduce (a proof of concept helps). You can write in English or French.

We aim to acknowledge reports within 7 days and to publish a fix, with credit if you wish, as soon
as possible. Please give us reasonable time to fix the issue before any public disclosure.

## Scope

In scope: the server (`apps/server`), the web app (`apps/web`), the CLI and MCP server, the import
pipeline (`packages/importers`: malicious files, zip bombs, XSS through imported content) and the
sync protocol.

Out of scope: vulnerabilities of a specific self-hosted deployment (reverse proxy, TLS, operating
system), denial of service by volume, and missing end-to-end encryption, which is a documented
limitation of v1.

The threat model and the security measures are described in `docs/SECURITY_MODEL.md`.

## Supported versions

Only the latest release receives security fixes. Self-hosters should update regularly
(`docs/SELF_HOSTING.md`, "Mises à jour").

---

**Signaler une vulnérabilité** : n’ouvrez pas de ticket public ; utilisez le signalement privé
de GitHub (_Security → Report a vulnerability_). Modèle de menace : `docs/SECURITY_MODEL.md`.
