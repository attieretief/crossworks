#!/usr/bin/env node
/* Turns a passphrase into the hash that goes into the EDITORS secret.
   Reads both values from stdin so neither ends up in your shell history,
   and prints only the hash. Nothing is written to disk. */

import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';

const rl = createInterface({ input: process.stdin, output: process.stderr });
const secret = (await rl.question('SESSION_SECRET (same value the Worker has): ')).trim();
const name = (await rl.question('Editor name (e.g. Vicki): ')).trim();
const passphrase = (await rl.question('Passphrase for that editor: ')).trim();
rl.close();

if (passphrase.length < 10) {
  console.error('\nUse at least 10 characters — this is the only thing guarding the site.');
  process.exit(1);
}

const hash = createHash('sha256').update(`${secret}:${passphrase}`).digest('hex');
console.error('\nAdd this entry to the EDITORS secret:');
console.log(JSON.stringify({ name, hash }));
