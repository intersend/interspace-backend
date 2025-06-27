import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

/**
 * @route   GET /.well-known/apple-app-site-association
 * @desc    Serve Apple App Site Association file for passkeys and universal links
 * @access  Public
 */
router.get('/apple-app-site-association', (req: Request, res: Response) => {
  // In development with ts-node, __dirname is src/routes
  // In production with compiled JS, __dirname would be dist/routes
  const isDevelopment = process.env.NODE_ENV === 'development';
  const filePath = isDevelopment 
    ? path.join(__dirname, '../../public/.well-known/apple-app-site-association')
    : path.join(__dirname, '../../../public/.well-known/apple-app-site-association');
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Apple App Site Association file not found' });
    return;
  }
  
  // Read the file
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Parse and update with actual team ID from environment
  let content;
  try {
    content = JSON.parse(fileContent);
    
    // Replace TEAMID placeholder with actual team ID if available
    const teamId = process.env.APPLE_TEAM_ID;
    if (teamId) {
      const appIdentifier = `${teamId}.com.interspace.ios`;
      
      // Update webcredentials
      if (content.webcredentials && content.webcredentials.apps) {
        content.webcredentials.apps = content.webcredentials.apps.map((app: string) => 
          app.replace('TEAMID', teamId)
        );
      }
      
      // Update applinks
      if (content.applinks && content.applinks.details) {
        content.applinks.details = content.applinks.details.map((detail: any) => ({
          ...detail,
          appID: detail.appID.replace('TEAMID', teamId)
        }));
      }
    }
  } catch (error) {
    console.error('Error parsing apple-app-site-association:', error);
    content = JSON.parse(fileContent);
  }
  
  // Set proper content type
  res.setHeader('Content-Type', 'application/json');
  res.json(content);
});

/**
 * @route   GET /.well-known/assetlinks.json
 * @desc    Serve Android Asset Links for future Android app support
 * @access  Public
 */
router.get('/assetlinks.json', (req: Request, res: Response) => {
  // Placeholder for Android app links
  res.json([]);
});

export default router;