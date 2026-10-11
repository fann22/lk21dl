import axios from 'axios';
import { gotScraping } from 'got-scraping';
import * as fs from 'fs';
import { readConfig } from './config.js';
export default class Scraper {
    async getPageHTML(url) {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        return response.data;
    }
    async getVideoNodeEmbedUrl(iframeUrl) {
        const hostMatch = iframeUrl.match(/\/iframe3\/([^\/]+)\//);
        const idMatch = iframeUrl.match(/\/iframe3\/[^\/]+\/([^?]+)/);
        if (!hostMatch || !idMatch) {
            throw new Error('Could not extract host and id from videonode iframe URL');
        }
        const host = hostMatch[1];
        const id = idMatch[1];
        try {
            const response = await gotScraping.post('https://videonode.de/api.php', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': iframeUrl,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                form: {
                    host: host,
                    id: id
                }
            });
            const data = JSON.parse(response.body);
            if (data.embedUrl) {
                return data.embedUrl.replace(/\\\//g, '/');
            }
            throw new Error('No embedUrl in API response');
        }
        catch (error) {
            throw new Error(`Failed to get videonode embed URL: ${error.message}`);
        }
    }
    async getPlayCdnFileUrl(embedUrl) {
        const urlObj = new URL(embedUrl);
        const slug = urlObj.pathname.split('/').filter(Boolean).pop();
        if (!slug) {
            throw new Error('Could not extract slug from playcdn.de URL');
        }
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
        const response = await gotScraping.get(`${baseUrl}/verify/${encodeURIComponent(slug)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': embedUrl,
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        const data = JSON.parse(response.body);
        if (data.status === 'success' && data.fileUrl) {
            return data.fileUrl.replace(/\\\//g, '/');
        }
        throw new Error(data.message || 'Failed to verify playcdn.de video');
    }
    getChromiumExecutablePath() {
        if (process.env.CHROMIUM_PATH)
            return process.env.CHROMIUM_PATH;
        const config = readConfig();
        if (config.hdEnabled && config.chromiumPath && fs.existsSync(config.chromiumPath)) {
            return config.chromiumPath;
        }
        throw new Error('HD quality requires Chromium, which is not set up yet. Run `lk21dl --setup-hd` to install it, ' +
            'or set LK21DL_HD=1 and reinstall. Falling back to SD quality for now.');
    }
    async captureCastMasterPlaylistUrl(castEmbedUrl) {
        process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';
        const { chromium } = await import('playwright-core');
        const browser = await chromium.launch({
            executablePath: this.getChromiumExecutablePath(),
            headless: true,
            args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        });
        try {
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const page = await context.newPage();
            let masterUrl = null;
            page.on('request', (req) => {
                const url = req.url();
                if (!masterUrl && url.includes('master.m3u8')) {
                    masterUrl = url;
                }
            });
            await page.goto(castEmbedUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
                referer: 'https://videonode.de/'
            }).catch(() => { });
            await page.waitForTimeout(3000);
            try {
                await page.mouse.click(640, 360);
            }
            catch { }
            for (let i = 0; i < 40 && !masterUrl; i++) {
                await page.waitForTimeout(250);
            }
            if (!masterUrl) {
                try {
                    await page.mouse.click(640, 360);
                }
                catch { }
                for (let i = 0; i < 40 && !masterUrl; i++) {
                    await page.waitForTimeout(250);
                }
            }
            await context.close();
            if (!masterUrl) {
                throw new Error('Timed out waiting for HD master playlist from CAST player');
            }
            return masterUrl;
        }
        finally {
            await browser.close();
        }
    }
    async getHdQualityVariants(castEmbedUrl) {
        const masterUrl = await this.captureCastMasterPlaylistUrl(castEmbedUrl);
        const response = await gotScraping.get(masterUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': castEmbedUrl
            }
        });
        const body = response.body;
        const lines = body.split('\n').map(l => l.trim());
        const variants = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                const urlLine = lines[i + 1];
                if (urlLine && urlLine.startsWith('http')) {
                    variants.push({
                        resolution: resolutionMatch ? resolutionMatch[1] : 'unknown',
                        bandwidth: bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0,
                        url: urlLine
                    });
                }
            }
        }
        if (variants.length === 0) {
            throw new Error('No quality variants found in CAST master playlist');
        }
        return variants.sort((a, b) => b.bandwidth - a.bandwidth);
    }
    async getHdVideoUrl(castIframeUrl) {
        const embedUrl = await this.getVideoNodeEmbedUrl(castIframeUrl);
        const variants = await this.getHdQualityVariants(embedUrl);
        return variants[0].url;
    }
    async bypassAndGetVideoUrl(iframeUrl) {
        if (iframeUrl.startsWith('//')) {
            iframeUrl = `https:${iframeUrl}`;
        }
        const response = await gotScraping.get(iframeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': iframeUrl,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            }
        });
        const html = response.body;
        const nestedIframeMatch = html.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);
        if (nestedIframeMatch && nestedIframeMatch[1].trim()) {
            let realVideoHost = nestedIframeMatch[1];
            if (realVideoHost.startsWith('//'))
                realVideoHost = `https:${realVideoHost}`;
            return await this.fetchDirectVideoLink(realVideoHost, iframeUrl);
        }
        const mp4Match = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i);
        if (mp4Match)
            return mp4Match[0];
        const m3u8Match = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
        if (m3u8Match)
            return m3u8Match[0];
        if (html.includes('video-iframe') && html.includes('api.php')) {
            try {
                const embedUrl = await this.getVideoNodeEmbedUrl(iframeUrl);
                if (embedUrl && embedUrl.trim()) {
                    if (embedUrl.includes('playcdn.de')) {
                        return await this.getPlayCdnFileUrl(embedUrl);
                    }
                    return await this.fetchDirectVideoLink(embedUrl, iframeUrl);
                }
            }
            catch (error) {
                console.error('VideoNode API extraction failed:', error.message);
            }
        }
        throw new Error('Failed to find hidden streaming host on Layer 1.');
    }
    async fetchDirectVideoLink(videoHostUrl, parentReferer) {
        try {
            const response = await gotScraping.get(videoHostUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': parentReferer
                }
            });
            const html = response.body;
            const idMatch = videoHostUrl.match(/id=([a-f0-9]+)/i);
            const videoId = idMatch ? idMatch[1] : null;
            if (!videoId)
                throw new Error('Video ID tidak ditemukan di URL Layer 2.');
            const urlObj = new URL(videoHostUrl);
            const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
            const jsResponse = await gotScraping.get(`${baseUrl}/js/init.min.js?t=29`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': videoHostUrl
                }
            });
            const jsContent = jsResponse.body;
            let apiFile = 'api2.php';
            const apiRouteMatch = jsContent.match(/this\.post\(\s*["']([^"'\?]+)/i);
            if (apiRouteMatch) {
                apiFile = apiRouteMatch[1];
            }
            const targetApiUrl = `${baseUrl}/${apiFile}?id=${videoId}`;
            const apiResponse = await gotScraping.post(targetApiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': videoHostUrl,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                form: {
                    r: parentReferer,
                    d: urlObj.hostname
                },
                responseType: 'json'
            });
            const resData = apiResponse.body;
            if (resData.message) {
                throw new Error(`Server menolak memberikan stream: ${resData.message}`);
            }
            let directUrl = '';
            if (Array.isArray(resData)) {
                const firstSource = resData.find((src) => src.file);
                if (firstSource)
                    directUrl = firstSource.file;
            }
            else if (resData && typeof resData === 'object') {
                if (resData.file)
                    directUrl = resData.file;
                else if (Array.isArray(resData.sources)) {
                    const firstSource = resData.sources.find((src) => src.file);
                    if (firstSource)
                        directUrl = firstSource.file;
                }
            }
            if (!directUrl) {
                const rawJsonString = JSON.stringify(resData);
                const m3u8Match = rawJsonString.match(/https?:\/\/[^"'\s<>,\\]+\.m3u8[^"'\s<>,\\]*/i);
                if (m3u8Match)
                    directUrl = m3u8Match[0].replace(/\\/g, '');
                const mp4Match = rawJsonString.match(/https?:\/\/[^"'\s<>,\\]+\.mp4[^"'\s<>,\\]*/i);
                if (mp4Match && !directUrl)
                    directUrl = mp4Match[0].replace(/\\/g, '');
            }
            if (!directUrl) {
                throw new Error('Failed to extract direct streaming URL from JSON API response.');
            }
            return directUrl;
        }
        catch (error) {
            throw new Error(`err: ${error.message}`);
        }
    }
}
