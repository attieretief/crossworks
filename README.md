# Crossworks

Single-page site for Crossworks Trust (PBO, Section 18A registered) — missions
work in South Africa, Zambia and Angola. Live at
**https://crossworksmissions.org** on GitHub Pages.

- Content source: Reynold Fourie's brief (18 Aug 2026) + "Crossworks PBO English" flyer.
- Photos: Reynold's OneDrive, resized to max 1200px (hero 2000px) with `sips`.
- Brand: gold `#E6AF0E`, brown `#675D50`, pale gold `#F4E3B2` — sampled from the PBO flyer.
- Fonts: Oswald (headings), Quicksand (body).

## How the page is put together

`content.json` holds every word and photo reference. `shared/page.mjs` turns it
into `index.html` plus one page per news letter under `news/`. All of it is
committed, and **the built HTML is what GitHub Pages serves** — plain static
files, no build step at request time, no JavaScript needed to read the site.

The rebuild runs in GitHub Actions (`.github/workflows/build.yml`) whenever
`content.json`, `build.mjs` or `shared/` changes, so the pages can never drift
from the content they came from, and a template change is an ordinary commit
rather than a redeploy. To rebuild locally:

```bash
node build.mjs
```

## Editing from the site

Vicki and Reynold edit the live page itself — no admin screen, no CMS. Open
<https://crossworksmissions.org/?edit> (or press Ctrl/Cmd+Shift+E on any page),
put in a name and an access key, and a bar appears at the bottom of the screen:

- **Text** — click any line and type. Headings, body copy, the bank details, the
  verses, the contact address.
- **Photos** — click a photo to replace it; shift-click to write its description
  for screen readers. Phone photos are shrunk in the browser before upload.
- **Projects** — hover a card for its controls: move it, widen it, show or hide
  its funding line, remove it. Each country has **+ Project**, and the section
  has **+ Add a country**.
- **Gallery** — **+ Add photos** takes several at once; each tile can be moved or
  removed.
- **News** — **+ Write a letter** starts a post. Its title, date, photo and
  summary sit on the card; the text itself opens underneath, a paragraph at a
  time. Each letter gets its own page at `/news/<name>/`, so it has a link worth
  sharing. There is no sign-up list and nothing is emailed — the letters live on
  the site.

**Save changes** commits everything in one go, credited to whoever is signed in.
The build workflow then rebuilds the pages and GitHub Pages publishes them — a
minute or two end to end. The key is remembered on that browser until **Sign
out**, so it is pasted once, not daily. Nothing is live until Save is pressed,
and **Discard** throws the session away.

The editor is only downloaded when it is asked for — an ordinary visitor never
loads a byte of it.

## Access keys

There is no server. The editor commits to this repo directly from the browser,
using a **fine-grained GitHub token** as the access key — so GitHub is the only
thing the site depends on.

To issue one, at
[Fine-grained tokens → new](https://github.com/settings/personal-access-tokens/new):

- **Repository access** — only `attieretief/crossworks`
- **Permissions** — `Contents: Read and write`, and nothing else
- **Expiration** — no expiration is fine, or a date you will diarise

Issue one key per person, so revoking one does not lock the other out. Send it
the way you would send a password, and it goes in the **Access key** box once.

Leaving **Workflows** off matters: without it the key can change the site's
words and photos but cannot add or edit anything under `.github/workflows/`,
so it can never be turned into a way of running code. To withdraw someone's
access, delete their token on that page — it stops working immediately.

The key never touches this repo. It lives in that person's browser until they
press **Sign out**.

## Layout

```
content.json       every editable word and photo reference
shared/page.mjs    content.json → the home page and one page per letter
shared/schema.mjs  the allowed shape of content.json; the gate on every save
shared/sanitize.mjs
build.mjs          node build.mjs → index.html + news/
index.html         generated, committed, served
news/<name>/       one letter per directory, generated the same way
shared/github.mjs  the commit itself — the only thing that talks to GitHub
js/editor.js       the in-page editor (loaded on demand)
.github/workflows/build.yml
test.mjs           node test.mjs
```
