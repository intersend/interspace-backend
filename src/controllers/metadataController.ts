import { Request, Response } from 'express';
import { metadataEnrichmentService } from '../services/metadataEnrichmentService';
import { ApiResponse } from '../types';

export class MetadataController {
  /**
   * Enrich app metadata
   */
  async enrichMetadata(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { url, fetchIcon = true, fetchScreenshots = false } = req.body;

      if (!url) {
        res.status(400).json({
          success: false,
          error: 'URL is required'
        } as ApiResponse);
        return;
      }

      const metadata = await metadataEnrichmentService.enrichMetadata({
        url,
        fetchIcon,
        fetchScreenshots
      });

      res.status(200).json({
        success: true,
        data: metadata
      } as ApiResponse);
    } catch (error: any) {
      console.error('Enrich metadata error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to enrich metadata'
      } as ApiResponse);
    }
  }

  /**
   * Get cached metadata or fetch if not available
   */
  async getMetadata(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        } as ApiResponse);
        return;
      }

      const { url } = req.query;
      const forceRefresh = req.query.refresh === 'true';

      if (!url || typeof url !== 'string') {
        res.status(400).json({
          success: false,
          error: 'URL is required'
        } as ApiResponse);
        return;
      }

      const metadata = await metadataEnrichmentService.getOrFetchMetadata(url, forceRefresh);

      if (!metadata) {
        res.status(404).json({
          success: false,
          error: 'Metadata not found'
        } as ApiResponse);
        return;
      }

      res.status(200).json({
        success: true,
        data: metadata
      } as ApiResponse);
    } catch (error: any) {
      console.error('Get metadata error:', error);
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Failed to get metadata'
      } as ApiResponse);
    }
  }
}

export const metadataController = new MetadataController();