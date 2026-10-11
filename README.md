# lk21dl

<div align="center">
    <img src="https://img.shields.io/badge/Version-1.0.0-2563eb?style=for-the-badge&logo=typescript" alt="Version">
    <img src="https://img.shields.io/badge/License-MIT-red?style=for-the-badge&logo=mit" alt="License">
    <img src="https://img.shields.io/badge/Node-18%2B-339933?style=for-the-badge&logo=nodedotjs" alt="Node">
    <img src="https://img.shields.io/badge/TypeScript-Ready-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
    <img src="https://img.shields.io/badge/FFmpeg-Merger-FF6B35?style=for-the-badge&logo=ffmpeg" alt="FFmpeg">
</div>

<div align="center">
    <img src="https://img.shields.io/badge/Cheerio-Parsing-FFB443?style=for-the-badge&logo=cheerio" alt="Cheerio">
    <img src="https://img.shields.io/badge/Got--Scraping-Bypass-00C853?style=for-the-badge" alt="Got-Scraping">
    <img src="https://img.shields.io/badge/HLS-M3U8-9B59B6?style=for-the-badge" alt="HLS">
    <img src="https://img.shields.io/badge/Resume-Supported-16A34A?style=for-the-badge" alt="Resume">
</div>

<div align="center">
    <a href="https://t.me/Dimzxzzx07">
        <img src="https://img.shields.io/badge/Telegram-Dimzxzzx07-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram">
    </a>
    <a href="https://github.com/Dimzxzzx07">
        <img src="https://img.shields.io/badge/GitHub-Dimzxzzx07-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub">
    </a>
    <a href="https://www.npmjs.com/package/lk21dl">
        <img src="https://img.shields.io/badge/NPM-lk21dl-CB3837?style=for-the-badge&logo=npm" alt="NPM">
    </a>
</div>

---

## Table of Contents

- [What is lk21dl?](#what-is-lk21dl)
- [Features](#features)
- [Installation](#installation)
- [Enabling HD (Chromium setup)](#enabling-hd-chromium-setup)
- [CLI Usage](#cli-usage)
- [Library Usage](#library-usage)
- [API Reference](#api-reference)
- [How It Works](#how-it-works)
- [Resumable Downloads](#resumable-downloads)
- [Temporary Files](#temporary-files)
- [Error Handling](#error-handling)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Terms of Service](#terms-of-service)
- [License](#license)

---

## What is lk21dl?

**lk21dl** is a TypeScript library and CLI that downloads movies from LK21 streaming mirrors by walking the full obfuscation chain — page → iframe → embed host → CDN — and bypassing Cloudflare along the way. It resolves the real video source (direct MP4 or HLS/M3U8), streams it to disk, and merges HLS segments into a single `.mp4` with `ffmpeg`.

It supports two quality paths:

- **SD (480p)** — pure HTTP scraping, no browser needed, fast.
- **HD (adaptive, up to 1080p)** — the HD mirror (CAST) is a JS-heavy SPA that runs a proof-of-work challenge before it reveals its stream URL, so this path drives a real headless Chromium via `playwright-core` to pass the challenge and capture the resulting manifest.

---

## Features

| Category | Details |
|---|---|
| Quality selection | `sd` (480p, HTTP-only) or `hd` (adaptive HLS up to 1080p, needs Chromium) |
| Resumable downloads | Interrupted HLS segments and direct MP4 byte-ranges pick up where they left off on re-run |
| Progress reporting | Segment-count and byte-count progress via an `onProgress` callback (CLI renders a live bar) |
| Title-based filenames | Output file defaults to the movie title, sanitized for the filesystem |
| Temp storage | Work files live under `os.tmpdir()/lk21dl-core/<id>`, never inside your project |
| Optional HD dependency | Chromium is opt-in at install time — skip it entirely and the package stays HTTP-only |
| Concurrency | HLS segments download with 15 concurrent connections and automatic per-segment retry |

---

## Installation

```bash
npm install -g lk21dl
# or as a project dependency
npm install lk21dl
```

On first install you'll be asked whether to set up HD support (see [Enabling HD](#enabling-hd-chromium-setup) below). If you only need SD, answer no — nothing extra gets installed.

### System Requirements

| Requirement | Minimum |
|---|---|
| Node.js | 18.0.0+ |
| ffmpeg | Must be on `PATH` (used to merge HLS segments; not bundled) |
| Chromium | Only required for `-q hd` |

Install ffmpeg if you don't already have it:

```bash
# Debian/Ubuntu
sudo apt install ffmpeg
# Termux
pkg install ffmpeg
# macOS
brew install ffmpeg
```

---

## Enabling HD (Chromium setup)

HD is opt-in because it pulls in a real Chromium binary. Three ways to control it:

**1. Interactive (default)** — during `npm install`, if stdin is a TTY, you'll be prompted:
```
Install Chromium now for HD support? [y/N]:
```

**2. Non-interactive / CI** — set `LK21DL_HD` before installing:
```bash
LK21DL_HD=1 npm install lk21dl   # enable HD, install Chromium
LK21DL_HD=0 npm install lk21dl   # SD-only (also the default if unset in non-TTY environments)
```

**3. Re-run anytime:**
```bash
lk21dl --setup-hd
```

On Termux, Chromium is installed via `pkg install -y x11-repo && pkg install -y chromium`. On other platforms, point `CHROMIUM_PATH` at an existing Chromium/Chrome binary if auto-detection doesn't find one.

Settings persist in `~/.lk21dl-core/config.json` and survive reinstalls/upgrades. Requesting `-q hd` without HD configured falls back to SD with a clear error pointing you to `--setup-hd`.

---

## CLI Usage

```bash
lk21dl <url-film-lk21> [options]
```

| Option | Description |
|---|---|
| `-o, --output <path>` | Output file path (default: `<movie title>.mp4` in the current directory) |
| `-q, --quality <level>` | `sd` (480p, default) or `hd` (adaptive, needs Chromium) |
| `--fresh` | Discard any resumable progress for this URL+quality and start over |
| `--setup-hd` | Re-run the interactive Chromium/HD setup |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

```bash
# Default SD download, filename from the movie title
lk21dl https://tv.lk21official.us/the-family-plan-2023

# HD
lk21dl https://tv.lk21official.us/the-family-plan-2023 -q hd

# Custom output path
lk21dl https://tv.lk21official.us/the-family-plan-2023 -o ~/Downloads/family-plan.mp4

# Start over, ignoring any partial progress
lk21dl https://tv.lk21official.us/the-family-plan-2023 --fresh
```

If a download is interrupted (network blip, Ctrl+C, crash), just re-run the exact same command — it resumes from the last completed segment/byte instead of starting over.

---

## Library Usage

```javascript
import lk21dl from 'lk21dl';

const outputPath = await lk21dl('https://tv.lk21official.us/the-family-plan-2023');
console.log('Saved to', outputPath);
```

With quality and progress:

```javascript
import lk21dl from 'lk21dl';

const outputPath = await lk21dl(
  'https://tv.lk21official.us/the-family-plan-2023',
  './movies/family-plan.mp4',
  {
    quality: 'hd',
    onProgress: (info) => {
      if (info.totalSegments) {
        console.log(`${info.completedSegments}/${info.totalSegments} segments (${info.percent?.toFixed(1)}%)`);
      } else if (info.totalBytes) {
        console.log(`${info.loadedBytes}/${info.totalBytes} bytes`);
      }
    }
  }
);
```

Lower-level access via the `Core` class, if you need the resolved stream yourself instead of a file on disk:

```typescript
import Core from 'lk21dl/dist/src/core.js';

const core = new Core();
const { title, stream, downloadId } = await core.download(url, { quality: 'sd' });
// pipe `stream` wherever you want...
core.cleanupDownload(downloadId); // only after you're done with the stream
```

---

## API Reference

### `lk21dl(url, outputPath?, options?)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | required | Full LK21 movie page URL |
| `outputPath` | `string` | `./<title>.mp4` | Destination file path |
| `options.quality` | `'sd' \| 'hd'` | `'sd'` | Quality to resolve |
| `options.onProgress` | `(info: ProgressInfo) => void` | — | Progress callback |

Returns: `Promise<string>` — the path the file was actually saved to.

Throws: `Error` — on an invalid URL, failed extraction, or a download failure (progress for HLS/direct downloads is preserved on disk even when this throws — re-run to resume).

### `ProgressInfo`

```typescript
interface ProgressInfo {
  phase: 'downloading' | 'merging';
  loadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  completedSegments?: number;
  totalSegments?: number;
}
```

---

## How It Works

1. **Fetch the page** — `Scraper.getPageHTML()` grabs the LK21 movie page.
2. **Extract the title + iframe** — `Parser.extractTitle()` / `extractIframeUrl()` parse the HTML with Cheerio.
3. **Resolve the real video URL**:
   - **SD**: follows the iframe chain through the embed host and verification endpoint to a direct MP4 or M3U8 URL, via `got-scraping` (handles Cloudflare's TLS fingerprinting).
   - **HD**: finds the CAST player entry, launches headless Chromium (`playwright-core`) against it, lets it solve the player's proof-of-work/attestation challenge, and sniffs the resulting `master.m3u8` request off the network layer. The master playlist is then parsed for all `BANDWIDTH=`/`RESOLUTION=` variants and the highest-bandwidth one is picked.
4. **Download**:
   - Direct MP4 → streamed with `axios`, byte-range resumable.
   - M3U8 → segments fetched with up to 15 concurrent connections (each with its own retry/backoff), then merged with the `ffmpeg` CLI (`-f concat`).
5. **Stream to disk** via `stream/promises` `pipeline`, with the temp work directory cleaned up only after the final file write succeeds.

---

## Resumable Downloads

Every `(url, quality)` pair maps to a stable `downloadId` (a hash of the two), so re-running the same command always points at the same temp work directory:

- **HLS**: each `.ts` segment is checked on disk before re-fetching — only missing segments are downloaded.
- **Direct MP4**: resumes via an HTTP `Range` request from the last byte already on disk.
- On success, the temp directory is deleted. On failure, it's left in place and the CLI tells you to just re-run the command.
- Use `--fresh` (CLI) or call `core.cleanupDownload(downloadId)` yourself (library) to discard progress and start clean.

---

## Temporary Files

Work files (HLS chunks, the pre-merge `.mp4`/`.ts` files) are written under your OS temp directory, not your project folder:

```
<os.tmpdir()>/lk21dl-core/<downloadId>/
```

This respects `$TMPDIR` if set. The final output only lands in your project (or wherever you pointed `-o`) once everything has completed successfully.

---

## Error Handling

| Error | Cause | What to do |
|---|---|---|
| `Failed to extract iframe URL...` | Page structure changed or URL invalid | Verify the URL opens in a browser |
| `Failed to get Video URL from any available player` | All known embed hosts failed | The mirror may be down or using an unsupported host |
| `HD quality requires Chromium, which is not set up yet` | `-q hd` used without HD enabled | Run `lk21dl --setup-hd` |
| `Server returned an HTML page instead of a video file` | Embed host served a verification page instead of the stream | Usually transient — retrying resolves it |
| ffmpeg errors during merge | `ffmpeg` missing or not on `PATH` | Install ffmpeg (see [Installation](#installation)) |

Any error during the actual download leaves partial progress on disk — re-running the same command resumes instead of starting over.

---

## FAQ

**Do I need ffmpeg installed?**
Yes, for HLS/M3U8 streams — it's invoked as a CLI binary, not bundled as an npm dependency.

**Can I resume an interrupted download?**
Yes. Re-run the exact same command (same URL and `-q` quality) and it continues from where it stopped.

**Do I need Chromium?**
Only for `-q hd`. SD-only usage never touches a browser. See [Enabling HD](#enabling-hd-chromium-setup).

**Why did HD silently fall back to SD?**
If the CAST player isn't found, or Chromium isn't configured, or the HD extraction throws for any reason, the library logs the reason to stderr and falls back to SD rather than failing the whole download.

**Does it work with all LK21 mirrors?**
Mostly — the parser has fallback patterns for multiple embed hosts, but mirror structures do change over time.

**Is this legal to use?**
lk21dl is a technical tool for retrieving streams you're otherwise able to watch in a browser. You are responsible for complying with copyright law in your jurisdiction — see [Terms of Service](#terms-of-service).

---

## Contributing

```bash
git clone https://github.com/fann22/lk21dl.git
cd lk21dl
npm install
npm run build
npm test
```

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

Please include the LK21 URL you tested against and your Node.js/OS version when reporting issues.

---

## Terms of Service

By downloading, installing, or using lk21dl (the "Software"), you agree to be bound by these terms and the MIT License below.

**Intended use**: personal offline viewing of content you have rights to, educational research on web scraping/HLS, and testing your own streaming implementations.

**Prohibited use**: downloading copyrighted content without permission, commercial redistribution of downloaded media, or any use that violates the laws of your jurisdiction.

THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. THE AUTHOR BEARS NO LIABILITY FOR HOW YOU USE IT. This was built as a technical/learning project — use it responsibly.

---

## License

MIT License — Copyright (c) 2026 Dimzxzzx07

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

<div align="center">
    <img src="https://img.shields.io/badge/Built%20With-❤️-FF6B35?style=for-the-badge" alt="Built With Love">
    <br>
    <strong>Powered By Dimzxzzx07</strong>
    <br>
    <br>
    <a href="https://t.me/Dimzxzzx07">
        <img src="https://img.shields.io/badge/Telegram-Contact-26A5E4?style=for-the-badge&logo=telegram" alt="Telegram">
    </a>
    <a href="https://github.com/Dimzxzzx07">
        <img src="https://img.shields.io/badge/GitHub-Follow-181717?style=for-the-badge&logo=github" alt="GitHub">
    </a>
    <a href="https://www.npmjs.com/package/lk21dl">
        <img src="https://img.shields.io/badge/NPM-Package-CB3837?style=for-the-badge&logo=npm" alt="NPM">
    </a>
    <br>
    <br>
    <small>Copyright © 2026 Dimzxzzx07. All rights reserved.</small>
    <br>
    <small>This project is licensed under MIT License</small>
</div>
