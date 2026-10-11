#!/usr/bin/env node

import Core, { computeDownloadId } from '../src/core.js';
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { spawnSync } from 'child_process';
import type { ProgressInfo } from '../src/downloader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
const version = packageJson.version;

const args = process.argv.slice(2);
const showBanner = () => {
  console.log('\x1b[35m%s\x1b[0m', `            LK21DL-CORE CLI v${version}                 `);
  console.log('\x1b[35m%s\x1b[0m', '      Movie Downloader Engine By @Dimzxzzx07        ');
};

const showHelp = () => {
  showBanner();
  console.log('\x1b[33m%s\x1b[0m', 'Usage:');
  console.log('  lk21dl <url-film-lk21> [option]\n');
  console.log('\x1b[33m%s\x1b[0m', 'Option:');
  console.log('  -o, --output <path>    Specify the location and name of the output .mp4 file (Default: <judul film>.mp4)');
  console.log('  -q, --quality <level>  Video quality: sd (480p, default, fast) or hd (adaptive HD, slower, needs Chromium)');
  console.log('  --fresh                Ignore any resumable progress and start this download over from scratch');
  console.log('  --setup-hd             Run the interactive Chromium/HD setup again');
  console.log('  -h, --help             Show this help menu');
  console.log('  -v, --version          Show current application version\n');
  console.log('\x1b[33m%s\x1b[0m', 'Command Example:');
  console.log('  lk21dl https://tv21.tips/the-family-plan-2023');
  console.log('  lk21dl https://tv21.tips/the-family-plan-2023 -q hd');
  console.log('  lk21dl https://tv21.tips/the-family-plan-2023 -o ~/Downloads/family-plan.mp4');
  console.log('\nIf a download is interrupted, just re-run the same command — it resumes automatically.');
};

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'lk21';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function renderProgress(info: ProgressInfo) {
  const barWidth = 30;
  const percent = info.percent !== undefined ? Math.min(100, Math.max(0, info.percent)) : 0;
  const filled = Math.round((percent / 100) * barWidth);
  const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

  let detail = '';
  if (info.phase === 'merging') {
    detail = 'Merging segments with ffmpeg...';
  } else if (info.totalSegments) {
    detail = `${info.completedSegments}/${info.totalSegments} segments`;
  } else if (info.totalBytes) {
    detail = `${formatBytes(info.loadedBytes || 0)} / ${formatBytes(info.totalBytes)}`;
  } else if (info.loadedBytes) {
    detail = formatBytes(info.loadedBytes);
  }

  process.stdout.write(`\r\x1b[36m[${bar}] ${percent.toFixed(1)}%  ${detail}\x1b[0m\x1b[K`);
}

async function run() {
  if (args.includes('--setup-hd')) {
    const setupScript = path.join(__dirname, '../../scripts/setup-hd.js');
    const result = spawnSync('node', [setupScript], { stdio: 'inherit' });
    process.exit(result.status || 0);
  }

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`lk21dl-core v${version}`);
    process.exit(0);
  }

  const targetUrl = args[0];
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    console.error('\x1b[31m%s\x1b[0m', 'The URL you entered is invalid! Make sure it starts with http:// or https://');
    process.exit(1);
  }

  let quality: 'sd' | 'hd' = 'sd';
  const qualityIndex = args.findIndex(arg => arg === '-q' || arg === '--quality');
  if (qualityIndex !== -1 && args[qualityIndex + 1]) {
    const requested = args[qualityIndex + 1].toLowerCase();
    if (['hd', '720', '720p', '1080', '1080p', 'high'].includes(requested)) {
      quality = 'hd';
    } else if (['sd', '480', '480p', 'low'].includes(requested)) {
      quality = 'sd';
    } else {
      console.error('\x1b[31m%s\x1b[0m', `Unknown quality "${args[qualityIndex + 1]}". Use "sd" or "hd".`);
      process.exit(1);
    }
  }

  let explicitOutputPath: string | null = null;
  const outputIndex = args.findIndex(arg => arg === '-o' || arg === '--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    explicitOutputPath = path.resolve(args[outputIndex + 1]);
  }

  const forceFresh = args.includes('--fresh');

  showBanner();
  console.log('\x1b[32m%s\x1b[0m', `URL     : ${targetUrl}`);
  console.log('\x1b[32m%s\x1b[0m', `Quality : ${quality.toUpperCase()}${quality === 'hd' ? ' (adaptive HD, requires Chromium)' : ' (480p)'}\n`);

  const core = new Core();
  const downloadId = computeDownloadId(targetUrl, quality);

  if (forceFresh) {
    core.cleanupDownload(downloadId);
  }

  try {
    const { title, videoUrl } = await core.resolve(targetUrl, quality);

    const outputPath = explicitOutputPath || path.resolve(`./${sanitizeFilename(title)}.mp4`);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('\x1b[32m%s\x1b[0m', `Title   : ${title}`);
    console.log('\x1b[32m%s\x1b[0m', `File    : ${outputPath}\n`);

    const stream = await core.fetchStream(videoUrl, downloadId, renderProgress);
    const writeStream = fs.createWriteStream(outputPath);
    await pipeline(stream, writeStream);
    process.stdout.write('\n');

    core.cleanupDownload(downloadId);

    console.log('\x1b[32m%s\x1b[0m', `\nsuccses path on: ${outputPath}`);
    process.exit(0);
  } catch (error: any) {
    process.stdout.write('\n');
    console.error('\x1b[31m%s\x1b[0m', `\nerror: ${error.message}`);
    console.error('\x1b[33m%s\x1b[0m', 'Progress has been saved — re-run the same command to resume, or pass --fresh to start over.');
    process.exit(1);
  }
}

run();
