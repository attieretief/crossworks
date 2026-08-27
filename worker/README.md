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

**1. Sign in to Cloudflare** (opens a browser):

```bash
npx wrangler login
```

**2. Make a GitHub token.** [Fine-grained tokens →
new](https://github.com/settings/personal-access-tokens/new). Repository access:
**only `attieretief/crossworks`**. Permissions: **Contents → Read and write**,
nothing else. Give it a year and diarise the renewal.

**3. Run the setup:**

```bash
cd worker && npm run setup
```

It asks for the token and then a passphrase for each editor, pipes every value
straight into `wrangler secret put`, and offers to deploy. Nothing is echoed to
the screen, written to disk, or left in your shell history.

**4. Point the site at it.** Put the URL it prints into `js/config.js`, commit,
push. Until that is filled in, the editor stays dormant and says so.

Run `npm run setup` again to change a passphrase, add an editor or rotate the
token — it always rewrites the session secret and the hashes together, so they
cannot fall out of step.

## Notes

- Passphrases are hashed with the session secret as the salt. `npm run setup`
  rewrites both together; setting `SESSION_SECRET` by hand would invalidate
  every passphrase and every live session.
- `EDITORS` names become the commit author, so the repo history shows who
  changed what.
- Every save is rebuilt field by field through `shared/schema.mjs`. A request
  cannot invent repo paths, inject markup, write outside `img/uploads/`, or
  upload a file the page does not reference.
- Nothing here deletes photos. Removing one from the page leaves the file in
  `img/` — harmless, and a mistaken delete is one edit away from being undone.
- `npm test` runs `test.mjs` against a stubbed GitHub: auth, token forgery, the
  upload gate, sanitisation, and one page built per letter.
- If the deploy step fails because the account has no `workers.dev` subdomain
  yet, set one in the Cloudflare dashboard and run `npx wrangler deploy`.
