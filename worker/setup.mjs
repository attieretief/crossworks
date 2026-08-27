#!/usr/bin/env node
/* One-shot setup for the editor service.
   Asks for the GitHub token and a passphrase per editor, then pipes each value
   straight into `wrangler secret put`. Nothing is echoed to the screen, nothing
   is written to disk, and nothing lands in your shell history.

   Run it again whenever you want to change a passphrase, add an editor or
   rotate the token — the session secret and the passphrase hashes are always
   written together, so they cannot fall out of step. */

import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let muted = false;
const output = new Writable({
  write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc); cb(); }
});
const rl = createInterface({ input: process.stdin, output, terminal: true });

const ask = async prompt => (await rl.question(prompt)).trim();

async function askSecret(prompt) {
  process.stdout.write(prompt);
  muted = true;
  const answer = await rl.question('');
  muted = false;
  process.stdout.write('\n');
  return answer.trim();
}

function run(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    /* never inherit stdin — the child would swallow the prompts still to come */
    const child = spawn('npx', ['wrangler', ...args], {
      cwd: here,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve(out) : reject(new Error(out.trim().split('\n').slice(-4).join('\n')))));
  });
}

const put = (name, value) => run(['secret', 'put', name], { input: value });

/* ── 1. is wrangler signed in? ──────────────────────────────────────────── */

console.log('\nCrossworks editor service — setup\n');
try {
  const who = await run(['whoami']);
  const email = (who.match(/([\w.+-]+@[\w-]+\.[\w.-]*\w)/) || [])[1];
  console.log(`Cloudflare: signed in${email ? ` as ${email}` : ''}.\n`);
} catch (_) {
  console.error('Not signed in to Cloudflare. Run this first, in this terminal:\n');
  console.error('    npx wrangler login\n');
  rl.close();
  process.exit(1);
}

/* ── 2. the GitHub token ────────────────────────────────────────────────── */

console.log('A fine-grained GitHub token is needed, with:');
console.log('  · Repository access — only attieretief/crossworks');
console.log('  · Permissions — Contents: Read and write (nothing else)');
console.log('  https://github.com/settings/personal-access-tokens/new\n');

const token = await askSecret('Paste the token (it will not be shown): ');
if (!/^github_pat_|^ghp_/.test(token)) {
  console.error('\nThat does not look like a GitHub token. Nothing was saved.');
  rl.close();
  process.exit(1);
}

/* ── 3. the editors ─────────────────────────────────────────────────────── */

const sessionSecret = randomBytes(32).toString('base64');
const editors = [];

console.log('\nNow a passphrase for each person who may edit the site.');
console.log('Give them at least 10 characters — this is the only thing guarding the page.');
console.log('Leave the name blank when you are done.\n');

for (;;) {
  const name = await ask(`Editor ${editors.length + 1} name (blank to finish): `);
  if (!name) break;

  const passphrase = await askSecret(`  Passphrase for ${name}: `);
  if (passphrase.length < 10) {
    console.log('  Too short — at least 10 characters. Try again.\n');
    continue;
  }
  const again = await askSecret('  Once more, to be sure: ');
  if (again !== passphrase) {
    console.log('  Those did not match. Try again.\n');
    continue;
  }

  editors.push({ name, hash: createHash('sha256').update(`${sessionSecret}:${passphrase}`).digest('hex') });
  console.log(`  ${name} added.\n`);
}

if (!editors.length) {
  console.error('No editors, so nobody could sign in. Nothing was saved.');
  rl.close();
  process.exit(1);
}

/* ── 4. write the secrets, then deploy ──────────────────────────────────── */

console.log('Saving the secrets to Cloudflare…');
try {
  await put('GITHUB_TOKEN', token);
  await put('SESSION_SECRET', sessionSecret);
  await put('EDITORS', JSON.stringify(editors));
  console.log('  GITHUB_TOKEN, SESSION_SECRET and EDITORS are set.\n');
} catch (err) {
  console.error('\nThat did not work:\n' + err.message);
  rl.close();
  process.exit(1);
}

const go = await ask('Deploy the Worker now? [Y/n] ');
rl.close();
if (go && !/^y(es)?$/i.test(go)) {
  console.log('\nNot deployed. When you are ready:  cd worker && npx wrangler deploy');
  process.exit(0);
}

console.log('\nDeploying…');
try {
  const out = await run(['deploy']);
  const url = (out.match(/https:\/\/[a-z0-9.-]*workers\.dev/i) || [])[0];
  console.log(out.trim());
  console.log('\nDone.');
  if (url) {
    console.log(`\nLast step — put this in js/config.js, then commit and push:\n\n  api: '${url}'\n`);
  }
} catch (err) {
  console.error('\nThe deploy failed:\n' + err.message);
  process.exit(1);
}
