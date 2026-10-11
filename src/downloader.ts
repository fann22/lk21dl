import { Readable, PassThrough } from 'stream';
import axios from 'axios';
import { gotScraping } from 'got-scraping';
import * as fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProgressInfo {
  phase: 'downloading' | 'merging';
  loadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  completedSegments?: number;
  totalSegments?: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

function baseTmpDir(): string {
  return path.join(os.tmpdir(), 'lk21dl-core');
}

function workDirFor(downloadId: string): string {
  return path.join(baseTmpDir(), downloadId);
}

function randomId(): string {
  return crypto.randomBytes(8).toString('hex');
}

export default class Downloader {
  cleanup(downloadId: string): void {
    try {
      fs.rmSync(workDirFor(downloadId), { recursive: true, force: true });
    } catch {}
  }

  async downloadDirect(url: string, onProgress?: ProgressCallback, downloadId?: string): Promise<Readable> {
    const id = downloadId || randomId();
    const workDir = workDirFor(id);
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    const partialPath = path.join(workDir, 'direct.mp4');

    let existingSize = fs.existsSync(partialPath) ? fs.statSync(partialPath).size : 0;

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    if (existingSize > 0) {
      headers['Range'] = `bytes=${existingSize}-`;
    }

    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      headers,
      validateStatus: (status) => status === 200 || status === 206
    });

    const contentType = String(response.headers['content-type'] || '');
    if (contentType.includes('text/html')) {
      throw new Error(`Server returned an HTML page instead of a video file (Content-Type: ${contentType}). The video host likely requires an additional verification step.`);
    }

    let totalBytes: number | undefined;
    let appendMode = false;

    if (response.status === 206) {
      appendMode = true;
      const contentRange = String(response.headers['content-range'] || '');
      const rangeMatch = contentRange.match(/\/(\d+)$/);
      if (rangeMatch) totalBytes = parseInt(rangeMatch[1], 10);
    } else {
      appendMode = false;
      existingSize = 0;
      const contentLength = String(response.headers['content-length'] || '');
      if (contentLength) totalBytes = parseInt(contentLength, 10);
    }

    const writeStream = fs.createWriteStream(partialPath, { flags: appendMode ? 'a' : 'w' });
    let loadedBytes = existingSize;

    await new Promise<void>((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        loadedBytes += chunk.length;
        if (onProgress) {
          onProgress({
            phase: 'downloading',
            loadedBytes,
            totalBytes,
            percent: totalBytes ? Math.min(100, (loadedBytes / totalBytes) * 100) : undefined
          });
        }
      });
      response.data.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      response.data.on('error', reject);
    });

    return fs.createReadStream(partialPath);
  }

  async downloadM3U8(
    m3u8Url: string,
    customHeaders: Record<string, string> = {},
    onProgress?: ProgressCallback,
    downloadId?: string
  ): Promise<Readable> {
    const id = downloadId || randomId();
    const workDir = workDirFor(id);
    const mergedPath = path.join(workDir, 'merged.mp4');

    if (fs.existsSync(mergedPath) && fs.statSync(mergedPath).size > 0) {
      if (onProgress) {
        onProgress({ phase: 'merging', percent: 100 });
      }
      return fs.createReadStream(mergedPath);
    }

    const tempDir = path.join(workDir, 'chunks');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const defaultHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      'Connection': 'keep-alive',
      ...customHeaders
    };

    let manifestRes = await gotScraping.get(m3u8Url, { headers: defaultHeaders, http2: false });
    let manifestText = manifestRes.body as string;
    if (manifestText.includes('<html') || manifestText.includes('<!DOCTYPE')) {
      throw new Error('Server rejected! The m3u8 manifest obtained is a web/HTML page.');
    }

    if (manifestText.includes('#EXT-X-STREAM-INF')) {
      const lines = manifestText.split('\n');
      let targetMediaUrl = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line && line.startsWith('http')) {
          targetMediaUrl = line;
          break;
        }
      }

      if (!targetMediaUrl) {
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (line && !line.startsWith('#')) {
            const urlObj = new URL(m3u8Url);
            const baseUrl = `${urlObj.protocol}//${urlObj.host}${path.dirname(urlObj.pathname)}/`;
            targetMediaUrl = new URL(line, baseUrl).href;
            break;
          }
        }
      }

      if (targetMediaUrl) {
        manifestRes = await gotScraping.get(targetMediaUrl, { headers: defaultHeaders, http2: false });
        manifestText = manifestRes.body as string;
        m3u8Url = targetMediaUrl;
      }
    }

    const lines = manifestText.split('\n');
    const segments: string[] = [];
    const urlObj = new URL(m3u8Url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${path.dirname(urlObj.pathname)}/`;
    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        if (line.startsWith('http')) {
          segments.push(line);
        } else {
          segments.push(new URL(line, baseUrl).href);
        }
      }
    }

    if (segments.length === 0) {
      throw new Error('No video segments (.ts) were found in the playlist..');
    }

    const CONCURRENCY_LIMIT = 15;
    const MAX_CHUNK_ATTEMPTS = 3;
    const fileListPath = path.join(workDir, 'files.txt');
    let completedCount = 0;

    const chunkPathFor = (index: number) => path.join(tempDir, `chunk_${String(index).padStart(4, '0')}.ts`);

    const pendingIndexes: number[] = [];
    for (let i = 0; i < segments.length; i++) {
      const chunkPath = chunkPathFor(i);
      if (fs.existsSync(chunkPath) && fs.statSync(chunkPath).size > 0) {
        completedCount++;
      } else {
        pendingIndexes.push(i);
      }
    }

    if (onProgress && completedCount > 0) {
      onProgress({
        phase: 'downloading',
        completedSegments: completedCount,
        totalSegments: segments.length,
        percent: (completedCount / segments.length) * 100
      });
    }

    const downloadChunk = async (segmentUrl: string, index: number): Promise<void> => {
      const chunkPath = chunkPathFor(index);

      let lastError: any;
      for (let attempt = 1; attempt <= MAX_CHUNK_ATTEMPTS; attempt++) {
        try {
          const chunkRes = await gotScraping.get(segmentUrl, {
            headers: defaultHeaders,
            responseType: 'buffer',
            http2: false,
            timeout: {
              request: 45000
            },
            retry: {
              limit: 4,
              methods: ['GET'],
              statusCodes: [408, 429, 500, 502, 503, 504],
              errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE']
            }
          });

          fs.writeFileSync(chunkPath, chunkRes.rawBody);
          completedCount++;
          if (onProgress) {
            onProgress({
              phase: 'downloading',
              completedSegments: completedCount,
              totalSegments: segments.length,
              percent: (completedCount / segments.length) * 100
            });
          }
          return;
        } catch (err: any) {
          lastError = err;
          if (attempt < MAX_CHUNK_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
      console.error(`\nerr: ${lastError.message}`);
      throw lastError;
    };

    for (let i = 0; i < pendingIndexes.length; i += CONCURRENCY_LIMIT) {
      const pool = [];
      for (let j = 0; j < CONCURRENCY_LIMIT && (i + j) < pendingIndexes.length; j++) {
        const index = pendingIndexes[i + j];
        pool.push(downloadChunk(segments[index], index));
      }
      await Promise.all(pool);
    }

    let fileListContent = '';
    for (let i = 0; i < segments.length; i++) {
      fileListContent += `file '${chunkPathFor(i)}'\n`;
    }
    fs.writeFileSync(fileListPath, fileListContent, 'utf-8');
    if (onProgress) {
      onProgress({ phase: 'merging', completedSegments: segments.length, totalSegments: segments.length, percent: 100 });
    }
    try {
      await execAsync(`ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy -y "${mergedPath}"`);
    } catch (err: any) {
      throw new Error(`err: ${err.message}`);
    }

    try {
      for (let i = 0; i < segments.length; i++) {
        const chunkPath = chunkPathFor(i);
        if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath);
      }
      if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
      if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
    } catch {}

    return fs.createReadStream(mergedPath);
  }
}
