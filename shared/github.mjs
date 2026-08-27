/* The only thing that talks to GitHub.
   Kept free of browser APIs so `test.mjs` can drive it in Node with a stubbed
   fetch. api.github.com allows cross-origin calls with an Authorization header,
   which is what lets the editor commit straight from the page. */

const API = 'https://api.github.com';

export function github({ token, repo, fetch: doFetch = globalThis.fetch }) {
  async function api(path, init = {}) {
    const res = await doFetch(`${API}/repos/${repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {})
      }
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      const err = new Error(`${path} → ${res.status}`);
      err.status = res.status;
      err.detail = detail.slice(0, 300);
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    /** Is this key real, and may it write to the repo? */
    async check() {
      const info = await api('');
      if (!info.permissions?.push) {
        const err = new Error('no write access');
        err.status = 403;
        throw err;
      }
      return { repo: info.full_name, branch: info.default_branch };
    },

    /**
     * One commit carrying every file. Blobs are uploaded once; if someone else
     * commits while we are building the tree, the tree and commit are rebuilt
     * on the new head rather than clobbering their work.
     */
    async commit({ branch, files, message, author }) {
      const blobs = [];
      for (const file of files) {
        const blob = await api('/git/blobs', {
          method: 'POST',
          body: JSON.stringify(
            file.base64 === undefined
              ? { content: file.content, encoding: 'utf-8' }
              : { content: file.base64, encoding: 'base64' }
          )
        });
        blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
      }

      for (let attempt = 0; ; attempt++) {
        const ref = await api(`/git/ref/heads/${branch}`);
        const head = await api(`/git/commits/${ref.object.sha}`);
        const tree = await api('/git/trees', {
          method: 'POST',
          body: JSON.stringify({ base_tree: head.tree.sha, tree: blobs })
        });
        const made = await api('/git/commits', {
          method: 'POST',
          body: JSON.stringify({
            message,
            tree: tree.sha,
            parents: [ref.object.sha],
            author: { name: author.name, email: author.email, date: new Date().toISOString() }
          })
        });

        try {
          await api(`/git/refs/heads/${branch}`, {
            method: 'PATCH',
            body: JSON.stringify({ sha: made.sha })
          });
          return made.sha;
        } catch (err) {
          /* 422 means the branch moved under us — read it again and rebuild */
          if (err.status !== 422 || attempt >= 2) throw err;
        }
      }
    }
  };
}
