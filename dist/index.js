import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import path from 'path';
import Core from './src/core.js';
const pipelineAsync = promisify(pipeline);
export default async function lk21dl(url, outputPath, options = {}) {
    const core = new Core();
    try {
        console.log('Starting download...');
        const { title, stream, downloadId } = await core.download(url, options);
        const resolvedOutputPath = outputPath || `./${title.replace(/[\\/:*?"<>|]/g, '')}.mp4`;
        const dir = path.dirname(resolvedOutputPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        const writeStream = createWriteStream(resolvedOutputPath);
        await pipelineAsync(stream, writeStream);
        core.cleanupDownload(downloadId);
        return resolvedOutputPath;
    }
    catch (error) {
        throw new Error(`Download failed: ${error.message}`);
    }
}
