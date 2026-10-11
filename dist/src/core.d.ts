import { ProgressCallback } from './downloader.js';
import { Readable } from 'stream';
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
export declare function computeDownloadId(url: string, quality: Quality): string;
export default class Core {
    private scraper;
    private parser;
    private downloader;
    constructor();
    private extractAllPlayerUrls;
    private resolveSdVideoUrl;
    resolve(url: string, quality?: Quality): Promise<{
        title: string;
        videoUrl: string;
        downloadId: string;
    }>;
    fetchStream(videoUrl: string, downloadId: string, onProgress?: ProgressCallback): Promise<Readable>;
    download(url: string, options?: DownloadOptions): Promise<DownloadResult>;
    cleanupDownload(downloadId: string): void;
}
