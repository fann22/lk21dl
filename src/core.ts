import Scraper from './scraper.js';
import Parser from './parser.js';
import Downloader, { ProgressCallback } from './downloader.js';
import { Readable } from 'stream';
import crypto from 'crypto';

export type Quality = 'sd' | 'hd';

export interface DownloadOptions {
  quality?: Quality;
  onProgress?: ProgressCallback;
}

export interface DownloadResult {
  title: string;
  stream: Readable;
  downloadId: string;
}

export function computeDownloadId(url: string, quality: Quality): string {
  return crypto.createHash('sha256').update(`${url}|${quality}`).digest('hex').slice(0, 16);
}

export default class Core {
  private scraper: Scraper;
  private parser: Parser;
  private downloader: Downloader;

  constructor() {
    this.scraper = new Scraper();
    this.parser = new Parser();
    this.downloader = new Downloader();
  }

  private extractAllPlayerUrls(html: string): string[] {
    const playerUrls: string[] = [];
    const playerListMatches = html.matchAll(/<a[^>]+href=["']([^"']*iframe[^"']*)["'][^>]*data-url=["']([^"']+)["']/gi);

    for (const match of playerListMatches) {
      if (match[1]) playerUrls.push(match[1]);
    }

    const iframeUrlMatch = html.match(/<iframe[^>]+src=["']([^"']+videonode[^"']*)["']/i);
    if (iframeUrlMatch && iframeUrlMatch[1]) {
      playerUrls.push(iframeUrlMatch[1]);
    }

    return playerUrls;
  }

  private async resolveSdVideoUrl(html: string, iframeUrl: string): Promise<string> {
    let videoUrl: string | null = null;
    let lastError: Error | null = null;

    const playerUrls = this.extractAllPlayerUrls(html);
    const urlsToTry = [iframeUrl, ...playerUrls];

    for (const playerUrl of urlsToTry) {
      try {
        videoUrl = await this.scraper.bypassAndGetVideoUrl(playerUrl);
        if (videoUrl) break;
      } catch (error: any) {
        lastError = error;
        continue;
      }
    }

    if (!videoUrl) {
      throw lastError || new Error('Failed to get Video URL from any available player.');
    }

    return videoUrl;
  }

  async resolve(url: string, quality: Quality = 'sd'): Promise<{ title: string; videoUrl: string; downloadId: string }> {
    const html = await this.scraper.getPageHTML(url);
    const title = this.parser.extractTitle(html);
    const iframeUrl = this.parser.extractIframeUrl(html);
    if (!iframeUrl) {
      throw new Error('Failed to extract iframe URL from LK21 main page. Selector may have changed.');
    }

    let videoUrl: string | null = null;

    if (quality === 'hd') {
      const castUrl = this.parser.extractPlayerUrlByServer(html, 'cast');
      if (castUrl) {
        try {
          videoUrl = await this.scraper.getHdVideoUrl(castUrl);
        } catch (error: any) {
          console.error(`HD extraction failed, falling back to SD: ${error.message}`);
        }
      } else {
        console.error('No CAST player found for this title, falling back to SD.');
      }
    }

    if (!videoUrl) {
      videoUrl = await this.resolveSdVideoUrl(html, iframeUrl);
    }

    const downloadId = computeDownloadId(url, quality);
    return { title, videoUrl, downloadId };
  }

  async fetchStream(videoUrl: string, downloadId: string, onProgress?: ProgressCallback): Promise<Readable> {
    if (videoUrl.includes('.m3u8')) {
      if (videoUrl.includes('hownetwork.xyz') || videoUrl.includes('/zzz/')) {
        return await this.downloader.downloadM3U8(videoUrl, {
          'Referer': 'https://cloud.hownetwork.xyz/',
          'Origin': 'https://cloud.hownetwork.xyz'
        }, onProgress, downloadId);
      }
      return await this.downloader.downloadM3U8(videoUrl, {}, onProgress, downloadId);
    }
    return await this.downloader.downloadDirect(videoUrl, onProgress, downloadId);
  }

  async download(url: string, options: DownloadOptions = {}): Promise<DownloadResult> {
    const { title, videoUrl, downloadId } = await this.resolve(url, options.quality || 'sd');
    const stream = await this.fetchStream(videoUrl, downloadId, options.onProgress);
    return { title, stream, downloadId };
  }

  cleanupDownload(downloadId: string): void {
    this.downloader.cleanup(downloadId);
  }
}
