# SendGrid Email Service Setup

## Overview

Interspace uses SendGrid for sending verification emails. This guide will help you set up SendGrid for your environment.

## Prerequisites

1. SendGrid account (free tier is sufficient for development)
2. Verified sender identity in SendGrid

## Setup Steps

### 1. Create SendGrid Account

1. Go to [SendGrid](https://sendgrid.com)
2. Sign up for a free account
3. Complete email verification

### 2. Create API Key

1. Navigate to Settings → API Keys
2. Click "Create API Key"
3. Give it a name (e.g., "Interspace Backend")
4. Select "Full Access" or "Restricted Access" with "Mail Send" permission
5. Copy the API key (it starts with `SG.`)

### 3. Verify Sender Identity

**Important**: SendGrid requires sender verification before you can send emails.

1. Go to Settings → Sender Authentication
2. Choose one of:
   - **Single Sender Verification** (easier for development)
     - Add your email address
     - Verify via the email SendGrid sends
   - **Domain Authentication** (recommended for production)
     - Add your domain
     - Configure DNS records as instructed

### 4. Configure Environment Variables

Add to your `.env` file:

```bash
# SendGrid Configuration
SENDGRID_API_KEY=your-sendgrid-api-key-here

# Email sender settings (must match verified sender)
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Your App Name
```

### 5. Test Your Configuration

Run the test script:

```bash
npm run test:sendgrid
```

Or use the basic SendGrid test:

```bash
node scripts/sendgrid-first-email.js
```

## Environment-Specific Configuration

### Development
- Use a test email address for `FROM_EMAIL`
- Can use Single Sender Verification

### Production
- Use domain authentication
- Set production sender email
- Store API key in secure environment (e.g., Google Secret Manager)

## Troubleshooting

### Error: "The from address does not match a verified Sender Identity"
- Verify your sender email/domain in SendGrid dashboard
- Ensure `FROM_EMAIL` matches the verified sender

### Error: "Unauthorized" (401)
- Check if API key is correct
- Verify API key has "Mail Send" permission
- Try generating a new API key

### Error: "Forbidden" (403)
- Sender verification issue
- Check SendGrid account status
- Verify sender identity is approved

## Security Notes

- Never commit API keys to version control
- Use environment variables or secret management
- Rotate API keys periodically
- Use restricted API keys with only necessary permissions

## Additional Resources

- [SendGrid Node.js Documentation](https://docs.sendgrid.com/for-developers/sending-email/quickstart-nodejs)
- [Sender Identity Requirements](https://docs.sendgrid.com/for-developers/sending-email/sender-identity)
- [API Key Management](https://docs.sendgrid.com/ui/account-and-settings/api-keys)