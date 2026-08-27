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

Vicki and Reynold edit the live page itself — no admin screen, no login, no
password to lose. Open <https://crossworksmissions.org/?edit> (or press
Ctrl/Cmd+Shift+E on any page) and a bar appears at the bottom of the screen:

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

**Nothing here can publish.** The editor cannot reach the live site and holds no
credential of any kind — everything happens in that browser. Work in progress is
kept on their own computer, so a closed tab or a flat battery loses nothing: it
comes back next time they open the page, and only **Start again** throws it away.

When they are happy, **Download changes** writes a single file —
`crossworks-2026-08-27-vicki.json` — carrying the content and any photos they
added. They send it however suits them: email, WhatsApp, a memory stick. Nothing
in it is a secret. Nothing is live until Save is pressed,
and **Discard** throws the session away.

The editor is only downloaded when it is asked for — an ordinary visitor never
loads a byte of it.

## Putting a change live

That is Attie's side, and it is one command:

```bash
npm run import ~/Downloads/crossworks-2026-08-27-vicki.json
```

It checks the file, writes the content and any photos into the repo, rebuilds
the pages and shows what changed. Nothing is committed — look at the diff, then:

```bash
git add -A && git commit -m "Site edit by Vicki" && git push
```

The file arrives from someone else's laptop, so it is treated as untrusted: the
content goes back through `shared/schema.mjs`, and only real photos at real
`img/uploads/` paths are written. Anything refused is named on screen rather
than quietly dropped.

There is no account anywhere, nothing to expire, and nothing to revoke. Somebody
who found the editor could rearrange the page in their own browser and hand you
a file; the site only changes when you run the command.

## Layout

```
content.json       every editable word and photo reference
shared/page.mjs    content.json → the home page and one page per letter
shared/schema.mjs  the allowed shape of content.json; the gate on every save
shared/sanitize.mjs
build.mjs          node build.mjs → index.html + news/
index.html         generated, committed, served
news/<name>/       one letter per directory, generated the same way
shared/handover.mjs the file an editor downloads and Attie imports
js/editor.js       the in-page editor (loaded on demand)
import.mjs         npm run import <file> → content, photos, rebuild
.github/workflows/build.yml
test.mjs           npm test
```
