export interface QualityVariant {
    resolution: string;
    bandwidth: number;
    url: string;
}
export default class Scraper {
    getPageHTML(url: string): Promise<string>;
    private getVideoNodeEmbedUrl;
    private getPlayCdnFileUrl;
    private getChromiumExecutablePath;
    private captureCastMasterPlaylistUrl;
    getHdQualityVariants(castEmbedUrl: string): Promise<QualityVariant[]>;
    getHdVideoUrl(castIframeUrl: string): Promise<string>;
    bypassAndGetVideoUrl(iframeUrl: string): Promise<string>;
    private fetchDirectVideoLink;
}
