# Crossworks editor service

A single Cloudflare Worker. It checks an editor's passphrase, commits their
changes to this repo, and holds the newsletter list. It is the only place in the
system with a credential — the site itself stays a folder of static files on
GitHub Pages.

| Route | Who | What |
|---|---|---|
| `POST /auth` | anyone | passphrase in, 8-hour session token out |
| `POST /save` | signed-in editor | commits `content.json`, a re-rendered `index.html` and any new photos or PDFs |
| `POST /subscribe` | anyone | adds an address to the newsletter list (5 per hour per IP) |
| `GET /subscribers` | signed-in editor | the list as CSV |

## Deploy

Free tier throughout: Workers gives 100 000 requests a day, KV 1 000 writes a
day. This site will use a handful of both.

**1. A GitHub token.** github.com → Settings → Developer settings → Personal
access tokens → **Fine-grained tokens** → Generate new token. Repository access:
**only `attieretief/crossworks`**. Permissions: **Contents → Read and write**
(nothing else). Give it a year's expiry and diarise the renewal.

**2. The KV namespace** for newsletter addresses:

```bash
cd worker && npx wrangler kv namespace create SUBSCRIBERS
```

Paste the id it prints into `wrangler.toml`.

**3. A session secret** — any long random string. `openssl rand -base64 32`.

**4. Passphrases.** Run this once per editor. It asks for the session secret and
a passphrase, and prints only the hash — nothing is written to disk and nothing
lands in your shell history:

```bash
node worker/hash.mjs
```

Collect the entries into one JSON array, e.g.
`[{"name":"Vicki","hash":"…"},{"name":"Reynold","hash":"…"}]`.

**5. Set the three secrets and deploy:**

```bash
cd worker && npx wrangler secret put GITHUB_TOKEN && npx wrangler secret put SESSION_SECRET && npx wrangler secret put EDITORS && npx wrangler deploy
```

**6. Point the site at it.** Put the deployed URL in `js/config.js`, commit,
push. Until that is filled in the editor and the sign-up form stay dormant and
say so.

## Notes

- Passphrases are hashed with the session secret as the salt, so changing
  `SESSION_SECRET` invalidates every passphrase and every live session.
- `EDITORS` names are what appear as the commit author, so the repo history shows
  who changed what.
- Nothing here deletes files. Removing a photo from the page leaves the file in
  `img/` — harmless, and it means a mistaken delete is one edit away from being
  undone.
- `npm test` runs `test.mjs`, which exercises auth, the save gate, sanitisation
  and the sign-up list against a stubbed GitHub and KV.
