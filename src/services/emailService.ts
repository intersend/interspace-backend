const sgMail = require('@sendgrid/mail');
import { logger } from '../utils/logger';

// Email configuration
const FROM_EMAIL = 'hello@interspace.fi';  // Verified sender in SendGrid
const FROM_NAME = process.env.FROM_NAME || 'Interspace';
const LOG_EMAIL_CODES = process.env.LOG_EMAIL_CODES === 'true'; // Default is false

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  // Development only: Store last sent codes
  private devCodes: Map<string, { code: string; timestamp: number }> = new Map();

  constructor() {
    this.initializeSendGrid();
    
    // Clean up old codes every 15 minutes
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
        for (const [email, data] of this.devCodes.entries()) {
          if (data.timestamp < fifteenMinutesAgo) {
            this.devCodes.delete(email);
          }
        }
      }, 15 * 60 * 1000);
    }
  }

  private initializeSendGrid() {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    
    if (sendgridApiKey) {
      sgMail.setApiKey(sendgridApiKey);
      logger.info('SendGrid email service initialized successfully');
    } else {
      logger.error('SendGrid API key missing! Set SENDGRID_API_KEY environment variable.');
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    
    if (!sendgridApiKey) {
      // In development, just log the email
      if (process.env.NODE_ENV === 'development') {
        logger.info('📧 [DEV MODE] Email would be sent:', {
          to: options.to,
          subject: options.subject
        });
        return;
      }
      throw new Error('SendGrid API key not configured');
    }

    try {
      const msg = {
        to: options.to,
        from: {
          email: FROM_EMAIL,
          name: FROM_NAME
        },
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      };

      await sgMail.send(msg);
      logger.info(`Email sent successfully via SendGrid to: ${options.to}`);
    } catch (error: any) {
      logger.error('Failed to send email via SendGrid:', error);
      
      // Log SendGrid specific error details
      if (error.response) {
        logger.error('SendGrid error response:', {
          statusCode: error.code,
          body: error.response.body
        });
      }
      
      throw new Error('Failed to send email');
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    // In development, optionally log the code based on configuration
    if (process.env.NODE_ENV === 'development') {
      if (LOG_EMAIL_CODES) {
        logger.info(`📧 [DEV MODE] Verification code for ${email}: ${code}`);
        logger.info(`📧 [DEV MODE] ========================================`);
        logger.info(`📧 [DEV MODE] Email: ${email}`);
        logger.info(`📧 [DEV MODE] Code: ${code}`);
        logger.info(`📧 [DEV MODE] ========================================`);
      } else {
        // Log that email was sent but don't show the code
        logger.info(`📧 [DEV MODE] Verification email sent to: ${email}`);
      }
      
      // Always store the code for development auto-fill feature (regardless of logging)
      this.devCodes.set(email, { code, timestamp: Date.now() });
    }

    const subject = 'Your Interspace Verification Code';
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verification Code</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          background-color: #f5f5f7;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .card {
          background-color: #ffffff;
          border-radius: 18px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          padding: 48px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #5856D6 0%, #7C7CFF 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 32px;
          font-size: 36px;
          color: white;
        }
        h1 {
          color: #1d1d1f;
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 16px;
        }
        .subtitle {
          color: #86868b;
          font-size: 17px;
          line-height: 1.47;
          margin: 0 0 32px;
        }
        .code-container {
          background-color: #f5f5f7;
          border-radius: 12px;
          padding: 24px;
          margin: 0 0 32px;
        }
        .code {
          font-size: 36px;
          font-weight: 600;
          letter-spacing: 8px;
          color: #1d1d1f;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
        }
        .expiry {
          color: #86868b;
          font-size: 15px;
          margin: 32px 0 0;
        }
        .footer {
          color: #86868b;
          font-size: 13px;
          margin-top: 48px;
          line-height: 1.5;
        }
        .footer a {
          color: #5856D6;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <div class="logo">✨</div>
          <h1>Verify Your Email</h1>
          <p class="subtitle">Enter this verification code in the Interspace app to continue:</p>
          
          <div class="code-container">
            <div class="code">${code}</div>
          </div>
          
          <p class="expiry">This code will expire in 10 minutes.</p>
          
          <div class="footer">
            If you didn't request this code, you can safely ignore this email.<br>
            Need help? Contact us at <a href="mailto:support@interspace.app">support@interspace.app</a>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Development only: Get the last verification code for an email
   */
  getDevCode(email: string): string | null {
    if (process.env.NODE_ENV !== 'development') {
      return null;
    }
    
    const data = this.devCodes.get(email);
    if (!data) {
      return null;
    }
    
    // Check if code is still valid (10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (data.timestamp < tenMinutesAgo) {
      this.devCodes.delete(email);
      return null;
    }
    
    return data.code;
  }
}

export const emailService = new EmailService();