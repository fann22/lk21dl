import * as fs from 'fs';
import path from 'path';
import os from 'os';

export interface LkConfig {
  hdEnabled: boolean;
  chromiumPath?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.lk21dl-core');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export function readConfig(): LkConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { hdEnabled: false };
  }
}

export function writeConfig(config: LkConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
