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

When they are happy, **Send to Attie** — one button, and the last thing they
have to do. On a phone or an iPad it opens the ordinary share sheet with the
file attached, so it goes out through WhatsApp or Mail exactly the way they
share anything else. On a desktop browser without that, it saves the file to
their downloads and tells them to attach it. Nothing in it is a secret.

They need no account, no password and no GitHub. The whole job is: change it,
check it, send it. Nothing is live until Save is pressed,
and **Discard** throws the session away.

The editor is only downloaded when it is asked for — an ordinary visitor never
loads a byte of it.

## Putting it live

Attie's side, and it is one drag. Open
[the letterbox](https://github.com/attieretief/crossworks/upload/main/handover),
drop the file on, press **Commit changes**. That page works on a phone, so it is
a thirty-second job from anywhere — no laptop, no terminal. A workflow imports
the file, rebuilds the pages and clears the letterbox.

On a Mac, `npm run import ~/Downloads/crossworks-….json` does the same work
locally and commits nothing, so the diff can be looked at first.

**Nothing in the site holds a credential**, which is the point: the editor
cannot publish, and neither can anyone who finds it. Publishing takes write
access to this repository, and that is Attie.

The file arrives from somebody else's laptop, so `import.mjs` reads it as
untrusted — the content goes back through `shared/schema.mjs`, and only real
photos at real `img/uploads/` paths are written. Anything refused is named
rather than quietly dropped, and a file that fails to import publishes nothing.

Every change is an ordinary commit, so it lands in the history with a
notification, and `git revert` undoes any of it.

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
handover/          the letterbox: a file dropped here publishes itself
.github/workflows/build.yml      rebuilds when the content or templates change
.github/workflows/handover.yml   imports whatever lands in the letterbox
test.mjs           npm test
```
