export default class Parser {
    extractTitle(html: string): string;
    extractPlayerUrlByServer(html: string, server: string): string | null;
    extractIframeUrl(html: string): string;
}
