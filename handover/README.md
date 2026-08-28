# The letterbox

When Vicki or Reynold press **Send for publishing** in the site editor, they get a
file called something like `crossworks-2026-08-27-vicki.json` and send it by
WhatsApp or email. Dropping it in here is what puts it live:

**[Upload a file →](https://github.com/attieretief/crossworks/upload/main/handover)**

Drag the file on and press **Commit changes**. That page works on a phone, so
this is a thirty-second job from anywhere — no laptop and no terminal. A
workflow reads the file, updates the site, rebuilds the pages and clears the
letterbox. The site changes a minute or two later.

`npm run import <file>` does the same thing on a Mac, without committing, if you
would rather look at the diff first.

Nothing else belongs in this folder. If a file is still sitting here, its import
failed — the run under the repository's **Actions** tab says why.
