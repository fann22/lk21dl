import * as cheerio from 'cheerio';

export default class Parser {
  extractTitle(html: string): string {
    const $ = cheerio.load(html);
    let title = $('h1').first().text().trim();

    if (!title) {
      title = $('meta[property="og:title"]').attr('content') || '';
      title = title.replace(/\s*\|.*$/, '').trim();
    }

    if (!title) {
      title = 'lk21';
    }

    return title
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractPlayerUrlByServer(html: string, server: string): string | null {
    const $ = cheerio.load(html);
    let foundUrl: string | null = null;

    $(`a[data-server="${server}"]`).each((_index: number, element: any) => {
      const dataUrl = $(element).attr('data-url') || $(element).attr('href');
      if (dataUrl) {
        foundUrl = dataUrl;
        return false;
      }
    });

    return foundUrl;
  }

  extractIframeUrl(html: string): string {
    const $ = cheerio.load(html);
    let iframeUrl = '';
    
    $('iframe').each((index: number, element: any) => {
      const src = $(element).attr('src');
      if (src && (src.includes('player') || src.includes('embed') || src.includes('video'))) {
        iframeUrl = src;
        return false;
      }
    });
    
    if (!iframeUrl) {
      $('a').each((index: number, element: any) => {
        const href = $(element).attr('href');
        if (href && (href.includes('player') || href.includes('embed'))) {
          iframeUrl = href;
          return false;
        }
      });
    }
    
    if (!iframeUrl) {
      const match = html.match(/iframe.*?src=["']([^"']+)["']/i);
      if (match) iframeUrl = match[1];
    }
    
    if (!iframeUrl) {
      throw new Error('Iframe URL not found');
    }
    
    return iframeUrl;
  }
}