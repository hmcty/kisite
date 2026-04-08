#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Resolve tsx binary from our package's node_modules
const tsxBin = require.resolve('tsx/cli');
const cliPath = join(__dirname, '..', 'src', 'node', 'cli.ts');

// Spawn tsx to run the TypeScript CLI, passing through all arguments
const child = spawn(
  process.execPath,
  [tsxBin, cliPath, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
