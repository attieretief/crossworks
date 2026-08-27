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
into `index.html`. Both are committed, and **`index.html` is what GitHub Pages
serves** — the site is still plain static HTML with no build step at request
time and no JavaScript needed to read it.

After editing `content.json` by hand:

```bash
node build.mjs
```

## Editing from the site

Vicki and Reynold edit the live page itself — no admin screen, no GitHub
account. Open <https://crossworksmissions.org/?edit> (or press Ctrl/Cmd+Shift+E
on any page), enter the editor passphrase, and a bar appears at the bottom of
the screen:

- **Text** — click any line and type. Headings, body copy, the bank details, the
  verses, the contact address.
- **Photos** — click a photo to replace it; shift-click to write its description
  for screen readers. Phone photos are shrunk in the browser before upload.
- **Projects** — hover a card for its controls: move it, widen it, show or hide
  its funding line, remove it. Each country has **+ Project**, and the section
  has **+ Add a country**.
- **Gallery** — **+ Add photos** takes several at once; each tile can be moved or
  removed.
- **Newsletter** — **+ Add a newsletter** uploads a PDF and lists it under "Past
  issues"; visitors sign up with the form above it.

**Save changes** commits everything in one go, credited to whoever is signed in.
GitHub Pages rebuilds in about a minute. Nothing is live until Save is pressed,
and **Discard** throws the session away.

The editor is only downloaded when it is asked for — an ordinary visitor never
loads a byte of it.

## The service behind it

Editing, uploads and newsletter sign-ups run through one Cloudflare Worker in
`worker/` — set-up and deploy steps are in [worker/README.md](worker/README.md).
Until its URL is filled into `js/config.js`, the editor and the sign-up form stay
dormant.

## Layout

```
content.json      every editable word and photo reference
shared/page.mjs   content.json → HTML (used by the build and by the Worker)
shared/schema.mjs the allowed shape of content.json; the gate on every save
shared/sanitize.mjs
build.mjs         node build.mjs → index.html
index.html        generated, committed, served
js/editor.js      the in-page editor (loaded on demand)
worker/           the Cloudflare Worker
```
