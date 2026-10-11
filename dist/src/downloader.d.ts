import { Readable } from 'stream';
export interface ProgressInfo {
    phase: 'downloading' | 'merging';
    loadedBytes?: number;
    totalBytes?: number;
    percent?: number;
    completedSegments?: number;
    totalSegments?: number;
}
export type ProgressCallback = (info: ProgressInfo) => void;
export default class Downloader {
    cleanup(downloadId: string): void;
    downloadDirect(url: string, onProgress?: ProgressCallback, downloadId?: string): Promise<Readable>;
    downloadM3U8(m3u8Url: string, customHeaders?: Record<string, string>, onProgress?: ProgressCallback, downloadId?: string): Promise<Readable>;
}
