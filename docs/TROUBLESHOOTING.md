# Troubleshooting Guide

Common issues and solutions for the Manic Miners Level Indexer.

## Table of Contents

1. [General Issues](#general-issues)
2. [Installation Problems](#installation-problems)
3. [Archive.org Issues](#archiveorg-issues)
4. [Discord Issues](#discord-issues)
5. [Hognose Issues](#hognose-issues)
6. [Performance Issues](#performance-issues)
7. [File System Issues](#file-system-issues)
8. [Network Issues](#network-issues)
9. [FAQ](#faq)
10. [Debug Mode](#debug-mode)

## General Issues

### Indexer Crashes Immediately

**Symptoms:**
- Process exits without error message
- No output files created

**Solutions:**
```bash
# Check Node.js version
node --version  # Must be 18.0.0+

# Run with debug output
DEBUG=* npm run index

# Check for missing dependencies
npm install

# Verify TypeScript build
npm run build
```

### No Levels Found

**Symptoms:**
- Indexer runs but finds 0 levels
- Empty catalog files

**Possible Causes:**
1. Search queries too specific
2. Date range filters excluding results
3. All sources disabled
4. Network connectivity issues

**Solutions:**
```json
// Broaden search queries
{
  "archive": {
    "searchQueries": ["manic miners"],
    "dateRange": null  // Remove date filter
  }
}
```

### Configuration Not Loading

**Symptoms:**
- Custom settings ignored
- Using default values only

**Solutions:**
```bash
# Verify config file location
ls -la config.json

# Validate JSON syntax
npx jsonlint config.json

# Check file permissions
chmod 644 config.json
```

## Installation Problems

### npm install Fails

**Error:** `npm ERR! code EACCES`

**Solution:**
```bash
# Fix npm permissions
sudo npm install -g npm
npm config set prefix ~/.npm
export PATH=~/.npm/bin:$PATH

# Or use npx
npx ts-node scripts/index-all.ts
```

**Error:** `Cannot find module 'typescript'`

**Solution:**
```bash
# Install dev dependencies
npm install --include=dev

# Or install globally
npm install -g typescript ts-node
```

### Build Errors

**Error:** `error TS2307: Cannot find module`

**Solution:**
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Platform-Specific Issues

**Windows:** Long path errors
```powershell
# Enable long paths in Windows
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

**macOS:** Playwright dependencies
```bash
# Install Playwright browsers
npx playwright install
```

## Archive.org Issues

### Slow Download Speeds

**Symptoms:**
- Downloads taking hours
- Timeouts on large files

**Solutions:**
```json
{
  "archive": {
    "maxConcurrentDownloads": 10,  // Increase parallelism
    "downloadTimeout": 120000,      // Increase timeout
    "bandwidthLimit": null          // Remove bandwidth limit
  }
}
```

### 403 Forbidden Errors

**Symptoms:**
- HTTP 403 responses from Archive.org
- "Access Denied" messages

**Possible Causes:**
- Rate limiting
- IP blocking
- Invalid URLs

**Solutions:**
```bash
# Reduce request rate
{
  "archive": {
    "maxConcurrentMetadata": 5,
    "maxConcurrentDownloads": 2
  }
}

# Add delay between requests
{
  "archive": {
    "requestDelay": 1000  // 1 second delay
  }
}
```

### Metadata Fetch Failures

**Error:** `Failed to fetch metadata: timeout`

**Solutions:**
```json
{
  "archive": {
    "retryAttempts": 5,        // More retries
    "downloadTimeout": 180000   // 3 minute timeout
  }
}
```

## Discord Issues

### Authentication Failed

**Error:** `Discord authentication failed: Invalid token`

**Solutions:**
```bash
# Verify token is valid
npm run test:discord:auth

# Clear cached credentials
rm -rf output/.auth/

# Get fresh token
# See Discord Authentication Guide
```

### Browser Window Opens Repeatedly

**Symptoms:**
- Chromium launches on every run
- Manual login required each time

**Solutions:**
```bash
# Ensure token is set correctly
echo "DISCORD_TOKEN=your_token" > .env

# Check token is being loaded
node -e "require('dotenv').config(); console.log(process.env.DISCORD_TOKEN ? 'Token found' : 'Token missing')"

# Use token file method
echo "your_token" > ~/.discord-token
```

### Missing Discord Threads

**Symptoms:**
- Some threads not indexed
- Incomplete channel coverage

**Possible Causes:**
- No access to archived threads
- Pagination limits
- Permission restrictions

**Solutions:**
```javascript
// Ensure archived threads are included
{
  "discord": {
    "includeArchived": true,
    "messageLimit": 2000  // Increase limit
  }
}
```

### Rate Limit Errors

**Error:** `429 Too Many Requests`

**Solutions:**
```bash
# Process channels sequentially
# Don't run multiple Discord indexers simultaneously

# Add delays in code
await new Promise(resolve => setTimeout(resolve, 1000));
```

## Hognose Issues

### GitHub API Rate Limit

**Error:** `API rate limit exceeded`

**Solutions:**
```bash
# Use authenticated requests
export GITHUB_TOKEN="your_github_token"

# Or in config
{
  "hognose": {
    "githubToken": "your_github_token"
  }
}
```

### Large Release Downloads Fail

**Symptoms:**
- Timeouts on release assets
- Partial ZIP files

**Solutions:**
```json
{
  "hognose": {
    "downloadTimeout": 300000,  // 5 minutes
    "retryAttempts": 3
  }
}
```

### ZIP Extraction Errors

**Error:** `Invalid ZIP file`

**Solutions:**
```bash
# Verify ZIP integrity
unzip -t downloaded-file.zip

# Clear corrupted downloads
rm -rf output/levels-hognose/.downloads/
```

## Performance Issues

### High Memory Usage

**Symptoms:**
- Process using several GB of RAM
- System becoming unresponsive

**Solutions:**
```bash
# Limit Node.js memory
NODE_OPTIONS="--max-old-space-size=2048" npm run index

# Reduce concurrent operations
{
  "archive": {
    "maxConcurrentDownloads": 2,
    "maxConcurrentMetadata": 5
  }
}
```

### Slow Indexing Speed

**Optimization Tips:**
```json
{
  "archive": {
    "skipExisting": true,
    "verifyChecksums": false  // Skip verification
  },
  "performance": {
    "diskCache": true,
    "compression": false  // Disable compression
  }
}
```

### CPU Overload

**Solutions:**
```bash
# Limit CPU usage
nice -n 10 npm run index

# Use single-threaded mode
UV_THREADPOOL_SIZE=1 npm run index
```

## File System Issues

### Permission Denied

**Error:** `EACCES: permission denied`

**Solutions:**
```bash
# Fix directory permissions
chmod -R 755 output/
chown -R $USER:$USER output/

# Run with different output directory
OUTPUT_DIR=/tmp/manic-miners npm run index
```

### Disk Space Issues

**Error:** `ENOSPC: no space left on device`

**Solutions:**
```bash
# Check disk space
df -h

# Clean old data
rm -rf output/levels-archive/*.tmp
rm -rf output/.cache/

# Use different disk
{
  "outputDir": "/external-drive/manic-miners"
}
```

### File Path Too Long

**Windows Specific:**
```powershell
# Enable long paths
git config --system core.longpaths true

# Or use shorter output path
{
  "outputDir": "C:/mm"
}
```

## Network Issues

### Proxy Configuration

**Behind Corporate Proxy:**
```bash
# Set proxy environment variables
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080

# Or in config
{
  "network": {
    "proxy": "http://proxy.company.com:8080"
  }
}
```

### SSL Certificate Errors

**Error:** `self signed certificate in certificate chain`

**Solutions:**
```bash
# Temporary workaround (not recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Better solution: Add corporate cert
export NODE_EXTRA_CA_CERTS=/path/to/corporate-cert.pem
```

### Connection Timeouts

**Solutions:**
```json
{
  "network": {
    "timeout": 60000,      // Increase timeout
    "retries": 5,          // More retries
    "retryDelay": 2000     // Wait between retries
  }
}
```

## FAQ

### Q: How do I resume an interrupted indexing session?

**A:** The Archive.org and Discord indexers automatically resume:
```bash
# Just run the same command again
npm run index:archive  # Will skip already processed items
```

### Q: Can I index specific dates only?

**A:** Yes, use date range filters:
```json
{
  "archive": {
    "dateRange": {
      "from": "2024-01-01",
      "to": "2024-01-31"
    }
  }
}
```

### Q: How do I index a single Discord channel?

**A:** Specify only that channel:
```json
{
  "discord": {
    "channels": ["single-channel-id"]
  }
}
```

### Q: Why are some levels missing metadata?

**A:** Different sources provide varying metadata:
- Archive.org: Usually complete
- Discord: Limited to message content
- Hognose: Basic filename info

### Q: Can I run multiple indexers simultaneously?

**A:** Yes, but be careful with resources:
```bash
# Run in separate terminals
npm run index:archive
npm run index:hognose
# Avoid running multiple Discord indexers
```

### Q: How do I update existing levels?

**A:** Delete and re-index:
```bash
# Remove specific source
rm -rf output/levels-archive/

# Or disable skipExisting
{
  "archive": {
    "skipExisting": false
  }
}
```

## Debug Mode

### Enable Comprehensive Debugging

```bash
# All debug output
DEBUG=* npm run index

# Source-specific debug
DEBUG=archive:* npm run index:archive
DEBUG=discord:* npm run index:discord
DEBUG=hognose:* npm run index:hognose

# Combine multiple
DEBUG=archive:*,discord:* npm run index
```

### Debug Output Files

```bash
# Save debug output
DEBUG=* npm run index 2>&1 | tee debug.log

# Analyze errors
grep ERROR debug.log
grep "Failed to" debug.log
```

### Verbose Logging

```json
{
  "logging": {
    "level": "debug",
    "file": "./debug.log",
    "console": true
  }
}
```

### Performance Profiling

```bash
# CPU profiling
node --prof dist/index.js

# Memory profiling
node --trace-gc dist/index.js

# Heap snapshots
node --inspect dist/index.js
```

## Getting Help

If you're still experiencing issues:

1. **Check existing issues**: [GitHub Issues](https://github.com/your-username/manic-miners-level-indexer/issues)
2. **Enable debug mode**: Collect detailed logs
3. **Create minimal reproduction**: Isolate the problem
4. **Open new issue**: Include:
   - Error messages
   - Configuration used
   - Debug logs
   - System information

### System Information Script

```bash
# Create system info for bug reports
cat << EOF > system-info.txt
Node Version: $(node --version)
NPM Version: $(npm --version)
OS: $(uname -a)
Memory: $(free -h 2>/dev/null || vm_stat)
Disk Space: $(df -h .)
Working Directory: $(pwd)
Config File: $(ls -la config.json 2>/dev/null || echo "Not found")
EOF
```