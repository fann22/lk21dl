#!/usr/bin/env node

import * as fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { execSync } from 'child_process';

const CONFIG_DIR = path.join(os.homedir(), '.lk21dl-core');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

function writeConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function isTermux() {
  return fs.existsSync('/data/data/com.termux') || !!process.env.TERMUX_VERSION;
}

function findChromiumPath() {
  const candidates = [
    '/data/data/com.termux/files/usr/bin/chromium-browser',
    '/data/data/com.termux/files/usr/bin/chromium'
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  try {
    const resolved = execSync('which chromium-browser || which chromium', { encoding: 'utf-8' }).trim();
    if (resolved) return resolved;
  } catch {}
  return null;
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  let wantHd;

  const envOverride = process.env.LK21DL_HD;
  if (envOverride !== undefined) {
    wantHd = /^(1|true|yes)$/i.test(envOverride.trim());
    console.log(`[lk21dl-core] LK21DL_HD=${envOverride} -> HD support ${wantHd ? 'ENABLED' : 'DISABLED'} (non-interactive).`);
  } else if (process.stdin.isTTY && !process.env.CI) {
    console.log('\n[lk21dl-core] Setup: HD quality (true 1080p-ish adaptive stream) needs Chromium for browser automation.');
    console.log('[lk21dl-core] Without it, only SD (480p, fast, no browser) downloads will work.\n');
    wantHd = await askYesNo('Install Chromium now for HD support? [y/N]: ');
  } else {
    console.log('[lk21dl-core] Non-interactive install detected, defaulting to SD-only (no Chromium).');
    console.log('[lk21dl-core] Set LK21DL_HD=1 before install, or run `lk21dl --setup-hd` later to enable HD.');
    wantHd = false;
  }

  if (!wantHd) {
    writeConfig({ hdEnabled: false });
    console.log('[lk21dl-core] HD support disabled. SD (480p) downloads are ready to use.');
    console.log('[lk21dl-core] Run `lk21dl --setup-hd` anytime to enable HD later.\n');
    return;
  }

  let chromiumPath = findChromiumPath();

  if (!chromiumPath && isTermux()) {
    console.log('[lk21dl-core] Installing Chromium via Termux pkg (this may take a while)...');
    try {
      execSync('pkg install -y x11-repo', { stdio: 'inherit' });
      execSync('pkg update -y', { stdio: 'inherit' });
      execSync('pkg install -y chromium', { stdio: 'inherit' });
      chromiumPath = findChromiumPath();
    } catch (error) {
      console.error('[lk21dl-core] Failed to install Chromium automatically:', error.message);
    }
  }

  if (!chromiumPath) {
    console.error('[lk21dl-core] Could not find or install Chromium. HD support disabled for now.');
    console.error('[lk21dl-core] On Termux, try manually: pkg install -y x11-repo && pkg install -y chromium');
    console.error('[lk21dl-core] Then re-run: lk21dl --setup-hd\n');
    writeConfig({ hdEnabled: false });
    return;
  }

  writeConfig({ hdEnabled: true, chromiumPath });
  console.log(`[lk21dl-core] HD support enabled. Chromium found at: ${chromiumPath}\n`);
}

main().catch((error) => {
  console.error('[lk21dl-core] Setup failed:', error.message);
  process.exit(0);
});
