import axios from 'axios';
import { JSDOM } from 'jsdom';
import { prisma } from '../utils/database';
import { AppMetadata } from '@prisma/client';


export interface MetadataEnrichmentRequest {
  url: string;
  fetchIcon?: boolean;
  fetchScreenshots?: boolean;
}

export interface EnrichedMetadata {
  name?: string;
  description?: string;
  iconUrl?: string;
  screenshots?: string[];
  category?: string;
  developer?: string;
  version?: string;
  tags?: string[];
}

export class MetadataEnrichmentService {
  private axios = axios.create({
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Interspace/1.0; +https://interspace.fi)'
    }
  });

  /**
   * Enrich app metadata by fetching from URL
   */
  async enrichMetadata(request: MetadataEnrichmentRequest): Promise<EnrichedMetadata> {
    try {
      const response = await this.axios.get(request.url);
      const html = response.data;
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const metadata: EnrichedMetadata = {};

      // Extract OpenGraph metadata
      metadata.name = this.getMetaContent(document, ['og:site_name', 'og:title', 'twitter:title']) || 
                     document.querySelector('title')?.textContent || undefined;
      
      metadata.description = this.getMetaContent(document, ['og:description', 'description', 'twitter:description']);
      
      if (request.fetchIcon) {
        metadata.iconUrl = this.getIconUrl(document, request.url);
      }

      if (request.fetchScreenshots) {
        metadata.screenshots = this.getScreenshots(document);
      }

      // Extract PWA manifest if available
      const manifestUrl = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      if (manifestUrl) {
        try {
          const manifestData = await this.fetchManifest(request.url, manifestUrl);
          if (manifestData) {
            metadata.name = metadata.name || manifestData.name || manifestData.short_name;
            metadata.description = metadata.description || manifestData.description;
            metadata.category = manifestData.categories?.[0];
            
            if (request.fetchIcon && manifestData.icons?.length > 0) {
              // Get the largest icon
              const largestIcon = manifestData.icons.reduce((prev: any, current: any) => {
                const prevSize = parseInt(prev.sizes?.split('x')[0] || '0');
                const currentSize = parseInt(current.sizes?.split('x')[0] || '0');
                return currentSize > prevSize ? current : prev;
              });
              
              if (largestIcon?.src) {
                metadata.iconUrl = new URL(largestIcon.src, request.url).href;
              }
            }

            if (request.fetchScreenshots && manifestData.screenshots?.length > 0) {
              metadata.screenshots = manifestData.screenshots.map((s: any) => 
                new URL(s.src, request.url).href
              );
            }
          }
        } catch (error) {
          console.error('Failed to fetch manifest:', error);
        }
      }

      // Try to determine category from various sources
      if (!metadata.category) {
        metadata.category = this.getMetaContent(document, ['article:section', 'category']);
      }

      // Extract keywords as tags
      const keywords = this.getMetaContent(document, ['keywords']);
      if (keywords) {
        metadata.tags = keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      }

      return metadata;
    } catch (error) {
      console.error('Failed to enrich metadata:', error);
      throw new Error('Failed to fetch metadata from URL');
    }
  }

  /**
   * Store enriched metadata in AppMetadata table
   */
  async storeMetadata(url: string, metadata: EnrichedMetadata): Promise<AppMetadata> {
    const existingMetadata = await prisma.appMetadata.findUnique({
      where: { url }
    });

    if (existingMetadata) {
      return await prisma.appMetadata.update({
        where: { url },
        data: {
          name: metadata.name || existingMetadata.name,
          description: metadata.description || existingMetadata.description,
          iconUrl: metadata.iconUrl || existingMetadata.iconUrl,
          category: metadata.category || existingMetadata.category,
          tags: metadata.tags ? JSON.stringify(metadata.tags) : existingMetadata.tags,
          updatedAt: new Date()
        }
      });
    }

    return await prisma.appMetadata.create({
      data: {
        url,
        name: metadata.name || url,
        description: metadata.description,
        iconUrl: metadata.iconUrl,
        category: metadata.category,
        tags: JSON.stringify(metadata.tags || []),
        isVerified: false
      }
    });
  }

  /**
   * Get metadata from cache or fetch if not available
   */
  async getOrFetchMetadata(url: string, forceRefresh: boolean = false): Promise<AppMetadata | null> {
    if (!forceRefresh) {
      const existing = await prisma.appMetadata.findUnique({
        where: { url }
      });

      if (existing) {
        return existing;
      }
    }

    try {
      const enriched = await this.enrichMetadata({
        url,
        fetchIcon: true,
        fetchScreenshots: false
      });

      return await this.storeMetadata(url, enriched);
    } catch (error) {
      console.error('Failed to get or fetch metadata:', error);
      return null;
    }
  }

  /**
   * Helper to get meta content
   */
  private getMetaContent(document: any, names: string[]): string | undefined {
    for (const name of names) {
      const content = document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
                     document.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
      if (content) return content;
    }
    return undefined;
  }

  /**
   * Get icon URL from various sources
   */
  private getIconUrl(document: any, baseUrl: string): string | undefined {
    // Try various icon sources in order of preference
    const iconSelectors = [
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
      'link[rel="icon"][type="image/png"]',
      'link[rel="icon"][type="image/jpeg"]',
      'link[rel="icon"][type="image/jpg"]',
      'link[rel="shortcut icon"]',
      'link[rel="icon"]'
    ];

    for (const selector of iconSelectors) {
      const icon = document.querySelector(selector);
      if (icon) {
        const href = icon.getAttribute('href');
        if (href) {
          try {
            return new URL(href, baseUrl).href;
          } catch {
            continue;
          }
        }
      }
    }

    // Try OpenGraph image as fallback
    const ogImage = this.getMetaContent(document, ['og:image', 'twitter:image']);
    if (ogImage) {
      try {
        return new URL(ogImage, baseUrl).href;
      } catch {
        return ogImage;
      }
    }

    return undefined;
  }

  /**
   * Get screenshots from OpenGraph or Twitter cards
   */
  private getScreenshots(document: any): string[] {
    const screenshots: string[] = [];
    
    // Get all og:image tags
    const ogImages = document.querySelectorAll('meta[property="og:image"]');
    ogImages.forEach((img: any) => {
      const content = img.getAttribute('content');
      if (content) screenshots.push(content);
    });

    return screenshots;
  }

  /**
   * Fetch and parse PWA manifest
   */
  private async fetchManifest(baseUrl: string, manifestUrl: string): Promise<any> {
    try {
      const fullUrl = new URL(manifestUrl, baseUrl).href;
      const response = await this.axios.get(fullUrl);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch manifest:', error);
      return null;
    }
  }
}

export const metadataEnrichmentService = new MetadataEnrichmentService();