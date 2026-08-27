# Crossworks editor service

A single Cloudflare Worker with two jobs: check an editor's passphrase, and
commit their changes to this repo. It holds the only credential in the system —
a fine-grained GitHub token — so the site itself stays a folder of static files
on GitHub Pages.

It does not render anything. `.github/workflows/build.yml` rebuilds the pages
from `content.json` once the commit lands, which means a change to a template is
an ordinary commit rather than a redeploy.

| Route | Who | What |
|---|---|---|
| `POST /auth` | anyone | passphrase in, 8-hour session token out |
| `POST /save` | signed-in editor | commits `content.json` and any new photos |

## Deploy

Free tier throughout — Workers allows 100 000 requests a day, and this will use
a handful.

**1. A GitHub token.** github.com → Settings → Developer settings → Personal
access tokens → **Fine-grained tokens** → Generate new token. Repository access:
**only `attieretief/crossworks`**. Permissions: **Contents → Read and write**
(nothing else). Give it a year's expiry and diarise the renewal.

**2. A session secret** — any long random string. `openssl rand -base64 32`.

**3. Passphrases.** Run this once per editor. It asks for the session secret and
a passphrase, and prints only the hash — nothing is written to disk and nothing
lands in your shell history:

```bash
node worker/hash.mjs
```

Collect the entries into one JSON array, e.g.
`[{"name":"Vicki","hash":"…"},{"name":"Reynold","hash":"…"}]`.

**4. Set the three secrets and deploy:**

```bash
cd worker && npx wrangler secret put GITHUB_TOKEN && npx wrangler secret put SESSION_SECRET && npx wrangler secret put EDITORS && npx wrangler deploy
```

**5. Point the site at it.** Put the deployed URL in `js/config.js`, commit,
push. Until that is filled in, the editor stays dormant and says so.

## Notes

- Passphrases are hashed with the session secret as the salt, so changing
  `SESSION_SECRET` invalidates every passphrase and every live session.
- `EDITORS` names become the commit author, so the repo history shows who
  changed what.
- Every save is rebuilt field by field through `shared/schema.mjs`. A request
  cannot invent repo paths, inject markup, write outside `img/uploads/`, or
  upload a file the page does not reference.
- Nothing here deletes photos. Removing one from the page leaves the file in
  `img/` — harmless, and a mistaken delete is one edit away from being undone.
- `npm test` runs `test.mjs` against a stubbed GitHub: auth, token forgery, the
  upload gate, sanitisation, and one page built per letter.
