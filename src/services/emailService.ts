import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { logger } from '../utils/logger';

// Email configuration
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@interspace.app';
const FROM_NAME = process.env.FROM_NAME || 'Interspace';
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'smtp';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: any = null;
  // Development only: Store last sent codes
  private devCodes: Map<string, { code: string; timestamp: number }> = new Map();

  constructor() {
    this.initializeEmailService();
    
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

  private initializeEmailService() {
    if (EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      logger.info('SendGrid email service initialized');
    } else {
      this.initializeTransporter();
    }
  }

  private initializeTransporter() {
    // SMTP configuration
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || ''
        },
        tls: {
          // Do not fail on invalid certificates in development
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });

      // Verify connection configuration
      this.transporter.verify((error: Error | null) => {
        if (error) {
          logger.error('SMTP connection error:', error);
        } else {
          logger.info('SMTP server is ready to send emails');
        }
      });
    } else if (process.env.NODE_ENV === 'development') {
      // Development mode - just log emails to console
      logger.warn('SMTP not configured. Emails will be logged to console in development mode.');
    } else {
      logger.error('SMTP configuration missing in production!');
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    // Use SendGrid if configured
    if (EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      try {
        const msg = {
          to: options.to,
          from: {
            email: FROM_EMAIL,
            name: FROM_NAME
          },
          subject: options.subject,
          text: options.text || this.stripHtml(options.html),
          html: options.html,
        };

        await sgMail.send(msg);
        logger.info(`Email sent successfully via SendGrid to: ${options.to}`);
        return;
      } catch (error) {
        logger.error('Failed to send email via SendGrid:', error);
        throw new Error('Failed to send email');
      }
    }

    // Fall back to SMTP
    if (!this.transporter) {
      // In development, just log the email
      if (process.env.NODE_ENV === 'development') {
        logger.info('📧 [DEV MODE] Email would be sent:', {
          to: options.to,
          subject: options.subject
        });
        return;
      }
      throw new Error('Email service not configured');
    }

    try {
      const mailOptions = {
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully via SMTP to: ${options.to}, messageId: ${info.messageId}`);
    } catch (error) {
      logger.error('Failed to send email via SMTP:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    // In development, log the verification code for easy testing
    if (process.env.NODE_ENV === 'development') {
      logger.info(`📧 [DEV MODE] Verification code for ${email}: ${code}`);
      logger.info(`📧 [DEV MODE] ========================================`);
      logger.info(`📧 [DEV MODE] Email: ${email}`);
      logger.info(`📧 [DEV MODE] Code: ${code}`);
      logger.info(`📧 [DEV MODE] ========================================`);
      
      // Store the code for development auto-fill feature
      this.devCodes.set(email, { code, timestamp: Date.now() });
    }

    const subject = 'Your Interspace verification code is ' + code;
    
    const html = `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Verification Code</title>
      <style type="text/css">
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; }
        
        /* Remove default styling */
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        table { border-collapse: collapse !important; }
        body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
        
        /* Mobile styles */
        @media screen and (max-width: 600px) {
          .mobile-padding { padding: 32px 20px !important; }
          .mobile-center { text-align: center !important; }
        }
        
        /* Apple Mail styles */
        @media only screen and (min-device-width: 375px) and (max-device-width: 413px) {
          .mobile-padding { padding: 32px 20px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f2f2f7;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f2f2f7;">
        <tr>
          <td align="center" valign="top" style="padding: 40px 10px;">
            <!-- Email Container -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 10px; overflow: hidden;">
              <!-- Header with logo -->
              <tr>
                <td align="center" valign="top" style="padding: 56px 20px 32px 20px;">
                  <div style="width: 88px; height: 88px; background: linear-gradient(45deg, #007AFF, #5856D6); border-radius: 22px; display: inline-block;">
                    <table width="88" height="88" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" valign="middle" style="font-size: 40px; color: #ffffff;">
                          I
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
              
              <!-- Main content -->
              <tr>
                <td align="center" valign="top" style="padding: 0 50px 40px 50px;" class="mobile-padding">
                  <!-- Title -->
                  <h1 style="margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 32px; font-weight: 700; color: #1c1c1e; line-height: 1.2; letter-spacing: -0.003em;">
                    Sign in to Interspace
                  </h1>
                  
                  <!-- Subtitle -->
                  <p style="margin: 0 0 32px 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 17px; font-weight: 400; color: #3c3c43; line-height: 1.47; letter-spacing: -0.022em;">
                    Enter this code in the app
                  </p>
                  
                  <!-- Code box -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 32px 0;">
                    <tr>
                      <td align="center" valign="middle" style="background-color: #f2f2f7; border-radius: 10px; padding: 28px 20px;">
                        <div style="font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.1em; color: #1c1c1e; line-height: 1;">
                          ${code}
                        </div>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Expiry notice -->
                  <p style="margin: 0 0 40px 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 15px; font-weight: 400; color: #8e8e93; line-height: 1.4; letter-spacing: -0.022em;">
                    This code expires in 10 minutes
                  </p>
                  
                  <!-- Security notice -->
                  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #d1d1d6; padding-top: 32px;">
                    <tr>
                      <td align="center" valign="top">
                        <p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #8e8e93; line-height: 1.6; letter-spacing: -0.02em;">
                          If you didn't request this code, you can safely ignore this email.<br>
                          Someone might have typed your email address by mistake.
                        </p>
                        <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; font-weight: 400; color: #8e8e93; line-height: 1.6; letter-spacing: -0.02em;">
                          Thanks,<br>
                          The Interspace Team
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            
            <!-- Footer -->
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px;">
              <tr>
                <td align="center" valign="top" style="padding: 24px 20px;">
                  <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 12px; font-weight: 400; color: #8e8e93; line-height: 1.5; letter-spacing: -0.02em;">
                    Interspace • Your digital identity<br>
                    <a href="https://interspace.app" style="color: #007AFF; text-decoration: none;">interspace.app</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
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