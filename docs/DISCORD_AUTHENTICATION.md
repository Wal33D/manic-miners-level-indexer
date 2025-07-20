# Discord Authentication Guide

This guide covers everything you need to know about Discord authentication for the Manic Miners Level Indexer.

## Table of Contents

1. [Overview](#overview)
2. [Authentication Methods](#authentication-methods)
3. [Getting Your Discord Token](#getting-your-discord-token)
4. [Token Configuration](#token-configuration)
5. [Automated vs Manual Login](#automated-vs-manual-login)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

## Overview

Discord indexing requires authentication to access channel messages and download attachments. The indexer supports multiple authentication methods and includes features for secure token management and automated login.

### Key Features

- **Multiple Token Sources**: Environment variables, files, or direct input
- **Token Caching**: Secure storage for reuse across sessions
- **Session Persistence**: Maintains login state between runs
- **Automated Login**: Headless browser automation support
- **Manual Fallback**: Browser-based login when automation fails

## Authentication Methods

The indexer checks for Discord tokens in the following priority order:

1. **Direct Parameter**: Passed directly to the indexer
2. **Token File**: Specified file path
3. **Environment Variable**: `DISCORD_TOKEN` or `DISCORD_USER_TOKEN`
4. **Home Directory File**: `~/.discord-token`
5. **Browser Authentication**: Automated or manual login

## Getting Your Discord Token

### Method 1: Browser Developer Tools (Recommended)

1. Open Discord in your web browser
2. Log in to your account
3. Open Developer Tools (F12 or right-click → Inspect)
4. Go to the **Network** tab
5. Refresh the page (F5)
6. Filter by "api" or look for requests to `discord.com/api`
7. Click on any API request
8. Look in the **Request Headers** for `authorization: YOUR_TOKEN`

### Method 2: Application Storage

1. Open Discord in your web browser
2. Open Developer Tools (F12)
3. Go to **Application** → **Local Storage** → `https://discord.com`
4. Look for the `token` entry
5. Copy the value (remove quotes if present)

### Important Notes

- User tokens are different from bot tokens
- Tokens are sensitive - treat them like passwords
- Tokens may expire after extended periods
- Never share your token publicly

## Token Configuration

### Environment Variable (Recommended)

#### Using .env file
```bash
# Create .env file in project root
echo "DISCORD_TOKEN=your_token_here" > .env

# The indexer will automatically load this
npm run index:discord
```

#### Using system environment
```bash
# Linux/macOS
export DISCORD_TOKEN="your_token_here"

# Windows Command Prompt
set DISCORD_TOKEN=your_token_here

# Windows PowerShell
$env:DISCORD_TOKEN="your_token_here"
```

### Token File

#### Home directory file
```bash
# Create token file in home directory
echo "your_token_here" > ~/.discord-token
chmod 600 ~/.discord-token  # Restrict permissions
```

#### Custom token file
```bash
# Create token file
echo "your_token_here" > ./discord.token

# Use with indexer
const indexer = new DiscordUnifiedIndexer(channels, outputDir);
indexer.setAuthOptions({ tokenFile: './discord.token' });
```

### Direct Parameter

```typescript
const indexer = new DiscordUnifiedIndexer(channels, outputDir);
indexer.setAuthOptions({ 
  token: 'your_token_here' 
});
```

## Automated vs Manual Login

### Automated Login

The indexer can automatically log in using credentials:

```bash
# Set credentials in environment
export DISCORD_EMAIL="your_email@example.com"
export DISCORD_PASSWORD="your_password"

# Run indexer - will attempt automated login
npm run index:discord
```

Features:
- Headless browser operation
- Automatic token capture
- Session persistence
- CAPTCHA detection

### Manual Login

If automated login fails or credentials aren't provided:

1. A browser window will open
2. Log in to Discord manually
3. The indexer will detect successful login
4. Token is captured and cached automatically

### Session Caching

The indexer caches authentication data:

```
output/.auth/
├── discord-token.json    # Cached token
└── discord-session.json  # Encrypted session data
```

Benefits:
- Faster subsequent runs
- No repeated logins
- Automatic token validation

## Security Best Practices

### 1. Token Storage

**DO:**
- Use environment variables
- Set restrictive file permissions
- Use `.gitignore` for token files
- Encrypt sensitive data

**DON'T:**
- Commit tokens to version control
- Share tokens publicly
- Store tokens in plain text files
- Use tokens in client-side code

### 2. Environment Security

```bash
# Secure token file
chmod 600 ~/.discord-token

# Add to .gitignore
echo ".env" >> .gitignore
echo "*.token" >> .gitignore
echo "output/.auth/" >> .gitignore
```

### 3. Token Rotation

- Regenerate tokens periodically
- Clear cache if token is compromised:
  ```bash
  rm -rf output/.auth/
  ```
- Monitor for unauthorized usage

### 4. Server Deployment

For production servers:

```bash
# Use environment variables
export DISCORD_TOKEN="your_token"

# Or use secrets management
# AWS Secrets Manager, HashiCorp Vault, etc.
```

## Troubleshooting

### Common Issues

#### Token Invalid or Expired

**Symptoms:**
- 401 Unauthorized errors
- "Token validation failed" messages

**Solutions:**
1. Get a fresh token from Discord
2. Clear cached authentication:
   ```bash
   rm -rf output/.auth/
   ```
3. Try manual login mode

#### CAPTCHA Challenges

**Symptoms:**
- Automated login fails with CAPTCHA message
- Browser window required

**Solutions:**
1. Use manual login mode
2. Complete CAPTCHA in browser
3. Token will be cached for future use

#### Rate Limiting

**Symptoms:**
- 429 Too Many Requests errors
- Slow message fetching

**Solutions:**
1. Reduce concurrent operations
2. Add delays between requests
3. Use different token/account

#### Session Expired

**Symptoms:**
- Previously working token fails
- Cached session invalid

**Solutions:**
```bash
# Clear all cached auth data
rm -rf output/.auth/

# Re-authenticate
npm run index:discord
```

### Debug Mode

Enable debug logging for authentication issues:

```typescript
import { logger } from 'manic-miners-level-indexer';

// Enable debug logging
process.env.DEBUG = 'discord:*';

// Run indexer with verbose output
```

### Testing Authentication

Test your Discord authentication setup:

```bash
# Basic auth test
npm run test:discord:auth

# Enhanced auth test with session
npm run test:discord:auth:enhanced

# Test automated login
npm run test:discord:auth:auto
```

### Manual Token Validation

Validate a token manually:

```typescript
import { DiscordTokenProvider } from 'manic-miners-level-indexer';

const token = 'your_token_here';
const isValid = await DiscordTokenProvider.validateToken(token);
console.log(`Token is ${isValid ? 'valid' : 'invalid'}`);
```

## Advanced Configuration

### Custom Cache Directory

```typescript
import { DiscordAuth } from 'manic-miners-level-indexer';

// Use custom cache location
const auth = new DiscordAuth('./my-cache/.auth');
const result = await auth.getToken();
```

### Environment-Specific Tokens

```bash
# Development
DISCORD_TOKEN_DEV="dev_token"

# Production
DISCORD_TOKEN_PROD="prod_token"

# Use based on environment
const token = process.env.NODE_ENV === 'production' 
  ? process.env.DISCORD_TOKEN_PROD 
  : process.env.DISCORD_TOKEN_DEV;
```

## Discord Channels

### Manic Miners Discord Server
Server ID: `580269696369164299`

### Available Channels

#### levels-archive (Channel ID: 683985075704299520)
- **Type**: Text-only channel
- **Status**: OLD/ARCHIVED - No longer active
- **Active Period**: March 2020 - July 2023
- **Total Maps**: 378
- **URL Format**: `https://discord.com/channels/580269696369164299/683985075704299520`
- **Description**: This was the original text channel where community levels were shared before the forum system was implemented.

#### community-levels (Channel ID: 1139908458968252457)  
- **Type**: Forum channel
- **Status**: CURRENT - Still active
- **Active Period**: August 2023 - Present
- **Total Maps**: 184+ (and growing)
- **URL Format**: `https://discord.com/channels/580269696369164299/1139908458968252457`
- **Description**: The current active forum channel where community members share their custom levels. Uses Discord's forum feature for better organization.

### Channel Migration Timeline
- The community migrated from the text-only `levels-archive` channel to the forum-based `community-levels` channel in August 2023
- There was only a 16-day gap between the last post in levels-archive (July 27, 2023) and the first post in community-levels (August 12, 2023)
- 9 authors have posted in both channels, showing continuity in the community

### Discord URL Structure
Discord URLs in the catalog follow this pattern:
- `https://discord.com/channels/{serverId}/{channelId}/{messageId}`

### Proxy Support

For environments requiring proxies:

```typescript
// Configure Playwright with proxy
const auth = new DiscordAuth();
auth.setBrowserOptions({
  proxy: {
    server: 'http://proxy.example.com:8080',
    username: 'user',
    password: 'pass'
  }
});
```

## Integration Examples

### Basic Usage

```typescript
import { DiscordUnifiedIndexer } from 'manic-miners-level-indexer';

async function indexDiscordLevels() {
  const channels = ['1139908458968252457'];
  const indexer = new DiscordUnifiedIndexer(channels, './output');
  
  // Token will be automatically resolved from environment
  const levels = await indexer.index();
  console.log(`Indexed ${levels.length} levels`);
}
```

### With Error Handling

```typescript
async function safeIndexDiscord() {
  try {
    const indexer = new DiscordUnifiedIndexer(channels, './output');
    await indexer.index();
  } catch (error) {
    if (error.message.includes('authentication')) {
      console.error('Discord authentication failed');
      console.error('Please check your token or try manual login');
    } else {
      console.error('Indexing error:', error);
    }
  }
}
```

### Programmatic Token Management

```typescript
import { DiscordAuth } from 'manic-miners-level-indexer';

async function manageAuth() {
  const auth = new DiscordAuth();
  
  // Get current token
  const result = await auth.getToken();
  console.log(`Authenticated as: ${result.username}`);
  
  // Clear if needed
  if (needsRefresh) {
    await auth.clearCache();
    const newResult = await auth.getToken();
  }
}
```