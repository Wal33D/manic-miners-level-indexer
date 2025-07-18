# Discord Authentication

The Manic Miners Level Indexer now includes automated Discord authentication using Playwright, eliminating the need to manually obtain and manage Discord tokens.

## Features

- **Automated Token Retrieval**: Uses Playwright to capture Discord authentication tokens from network requests
- **Token Caching**: Tokens are cached securely for reuse across sessions
- **Multiple Authentication Methods**:
  - Automatic login with saved credentials (via environment variables)
  - Manual login through browser window
  - Fallback to manually provided token

## How It Works

1. **Network Interception**: The auth module uses Playwright to intercept Discord API requests and capture the authorization header
2. **Smart Token Capture**: Monitors requests to `discord.com/api/v*` endpoints to extract tokens
3. **User Info Extraction**: Captures user ID and username from API responses
4. **Secure Caching**: Tokens are cached in `./data/.auth/discord-token.json` for future use

## Usage

### Basic Usage

```bash
# Run Discord indexing - will prompt for login if needed
npm run index:discord

# Test authentication only
npm run test:discord:auth

# Clear cached token and re-authenticate
npm run test:discord:auth -- --clear-cache
npm run index:discord -- --clear-auth
```

### Environment Variables

For automatic login, set these environment variables:

```bash
DISCORD_EMAIL=your-email@example.com
DISCORD_PASSWORD=your-password
```

You can also provide a token directly:

```bash
DISCORD_USER_TOKEN=your-discord-token
```

### Manual Login

If no credentials are provided, a browser window will open for manual login:

1. The script will open Discord login page
2. Log in manually with your credentials
3. The script will automatically capture the token once logged in
4. Browser window will close automatically

## Token Storage

Tokens are cached in JSON format at `./data/.auth/discord-token.json`:

```json
{
  "token": "your-token-here",
  "userId": "123456789",
  "username": "YourUsername",
  "savedAt": "2024-01-01T00:00:00.000Z"
}
```

Cached tokens are valid for 30 days or until manually cleared.

## Security Notes

- **Never commit tokens**: The `.auth` directory should be in `.gitignore`
- **Token permissions**: Discord user tokens have full access to your account
- **Rate limits**: Be mindful of Discord's rate limits when indexing
- **Terms of Service**: Ensure your usage complies with Discord's ToS

## Troubleshooting

### Token Not Captured

If the token isn't captured automatically:

1. Ensure you're logged in successfully
2. Navigate to a channel or server to trigger API requests
3. Try clicking on your user profile area
4. Clear cache and try again: `npm run test:discord:auth -- --clear-cache`

### Authentication Failed

1. Check your credentials in environment variables
2. Ensure 2FA is handled if enabled on your account
3. Try manual login instead of automatic
4. Check Discord's status page for any service issues

### Browser Issues

- The auth module uses Chromium via Playwright
- Ensure you have necessary system dependencies for Playwright
- Run `npx playwright install` if you encounter browser launch errors

## API Reference

### DiscordAuth Class

```typescript
import { DiscordAuth } from './src/auth/discordAuth';

const auth = new DiscordAuth('./cache-dir');

// Get token (will prompt for login if needed)
const result = await auth.getToken();
console.log(result.token, result.username);

// Clear cached token
await auth.clearCache();
```

### DiscordUnifiedIndexer

The unified indexer automatically handles authentication:

```typescript
import { DiscordUnifiedIndexer } from './src/indexers/discordUnified';

const indexer = new DiscordUnifiedIndexer(['channel-id'], './output');
await indexer.indexDiscord(); // Will handle auth automatically
```

## Migration from Old Indexer

The new unified indexer replaces:
- `DiscordIndexer` (Playwright-based scraper)
- `DiscordSelfBot` (Self-bot implementation)
- `DiscordDirectAPI` (Direct API implementation)

Benefits of the new approach:
- Faster indexing using direct API calls
- Automatic token management
- Better error handling and recovery
- Cleaner, more maintainable code