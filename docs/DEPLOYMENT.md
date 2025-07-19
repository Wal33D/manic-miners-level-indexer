# Deployment Guide

This guide covers deploying the Manic Miners Level Indexer in production environments.

## Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Server Requirements](#server-requirements)
3. [Production Setup](#production-setup)
4. [Docker Deployment](#docker-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Automated Scheduling](#automated-scheduling)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Security Considerations](#security-considerations)
9. [Backup and Recovery](#backup-and-recovery)
10. [Scaling Strategies](#scaling-strategies)

## Deployment Overview

The Manic Miners Level Indexer can be deployed in various environments:
- **Standalone Server**: Traditional VPS or dedicated server
- **Docker Container**: Containerized deployment
- **Cloud Services**: AWS, Google Cloud, Azure
- **Serverless**: AWS Lambda, Google Cloud Functions
- **CI/CD Pipeline**: GitHub Actions, Jenkins

## Server Requirements

### Minimum Requirements
- **CPU**: 2 cores (2.4 GHz+)
- **RAM**: 4GB
- **Storage**: 50GB SSD
- **Network**: 10 Mbps stable connection
- **OS**: Ubuntu 20.04+, Debian 10+, CentOS 8+, or Windows Server 2019+

### Recommended Requirements
- **CPU**: 4 cores (3.0 GHz+)
- **RAM**: 8GB
- **Storage**: 100GB SSD
- **Network**: 100 Mbps connection
- **OS**: Ubuntu 22.04 LTS

### Software Requirements
- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Git 2.25.0 or higher
- Optional: Docker 20.10+ and Docker Compose 1.29+

## Production Setup

### 1. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install build essentials
sudo apt install -y build-essential git

# Create application user
sudo useradd -m -s /bin/bash indexer
sudo mkdir -p /opt/manic-miners-indexer
sudo chown indexer:indexer /opt/manic-miners-indexer
```

### 2. Application Setup

```bash
# Switch to application user
sudo su - indexer

# Clone repository
cd /opt/manic-miners-indexer
git clone https://github.com/Wal33D/manic-miners-level-indexer.git .

# Install dependencies
npm ci --production

# Build the application
npm run build

# Create output directory
mkdir -p output
```

### 3. Environment Configuration

Create production environment file:

```bash
# /opt/manic-miners-indexer/.env.production
NODE_ENV=production
OUTPUT_DIR=/data/manic-miners/output
LOG_LEVEL=info
LOG_FILE=/var/log/manic-miners/indexer.log

# Discord authentication (if needed)
DISCORD_TOKEN=your_production_token

# Performance settings
MAX_CONCURRENT_DOWNLOADS=10
ENABLE_CACHE=true
CACHE_DIR=/var/cache/manic-miners
```

### 4. Production Configuration

Create `config.production.json`:

```json
{
  "outputDir": "/data/manic-miners/output",
  "sources": {
    "internet_archive": {
      "enabled": true,
      "maxConcurrentDownloads": 10,
      "enableCache": true,
      "cacheExpiry": 86400000,
      "skipExisting": true,
      "verifyChecksums": true
    },
    "discord_community": {
      "enabled": true,
      "channels": ["1139908458968252457"]
    },
    "discord_archive": {
      "enabled": true,
      "channels": ["683985075704299520"]
    },
    "hognose": {
      "enabled": true,
      "checkInterval": 3600000
    }
  },
  "logging": {
    "level": "info",
    "file": "/var/log/manic-miners/indexer.log",
    "maxFiles": 5,
    "maxSize": "10m"
  }
}
```

### 5. Systemd Service

Create systemd service file:

```ini
# /etc/systemd/system/manic-miners-indexer.service
[Unit]
Description=Manic Miners Level Indexer
After=network.target

[Service]
Type=simple
User=indexer
WorkingDirectory=/opt/manic-miners-indexer
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/manic-miners/indexer.log
StandardError=append:/var/log/manic-miners/indexer-error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/data/manic-miners /var/log/manic-miners /var/cache/manic-miners

[Install]
WantedBy=multi-user.target
```

Enable and start service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable manic-miners-indexer
sudo systemctl start manic-miners-indexer
sudo systemctl status manic-miners-indexer
```

## Docker Deployment

### 1. Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directories
RUN mkdir -p output && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 2. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  indexer:
    build: .
    container_name: manic-miners-indexer
    restart: unless-stopped
    volumes:
      - ./output:/app/output
      - ./config.production.json:/app/config.json:ro
      - cache:/app/.cache
    environment:
      - NODE_ENV=production
      - DISCORD_TOKEN=${DISCORD_TOKEN}
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "node", "-e", "require('fs').existsSync('/app/output/catalog_index.json')"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  cache:
    driver: local
```

### 3. Build and Run

```bash
# Build image
docker build -t manic-miners-indexer .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Cloud Deployment

### AWS EC2 Deployment

```bash
# Launch EC2 instance (t3.medium recommended)
# Security group: Allow SSH (22) and optionally HTTP (80)

# Connect to instance
ssh -i your-key.pem ubuntu@your-instance-ip

# Follow production setup steps above
# Consider using AWS S3 for output storage
```

### AWS Lambda Deployment (Serverless)

Create `serverless.yml`:

```yaml
service: manic-miners-indexer

provider:
  name: aws
  runtime: nodejs18.x
  timeout: 900 # 15 minutes max
  memorySize: 3008
  environment:
    OUTPUT_BUCKET: ${env:OUTPUT_BUCKET}
    DISCORD_TOKEN: ${env:DISCORD_TOKEN}

functions:
  indexer:
    handler: dist/lambda.handler
    events:
      - schedule:
          rate: rate(6 hours)
          enabled: true
```

### Google Cloud Run

```bash
# Build container
gcloud builds submit --tag gcr.io/PROJECT-ID/manic-miners-indexer

# Deploy to Cloud Run
gcloud run deploy manic-miners-indexer \
  --image gcr.io/PROJECT-ID/manic-miners-indexer \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --timeout 3600 \
  --max-instances 1
```

## Automated Scheduling

### Using Cron

```bash
# Edit crontab
crontab -e

# Run every 6 hours
0 */6 * * * cd /opt/manic-miners-indexer && /usr/bin/node dist/index.js >> /var/log/manic-miners/cron.log 2>&1

# Run daily at 2 AM
0 2 * * * cd /opt/manic-miners-indexer && /usr/bin/node dist/index.js >> /var/log/manic-miners/cron.log 2>&1
```

### Using systemd Timer

Create timer file:

```ini
# /etc/systemd/system/manic-miners-indexer.timer
[Unit]
Description=Run Manic Miners Indexer every 6 hours

[Timer]
OnBootSec=10min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
```

Enable timer:

```bash
sudo systemctl enable manic-miners-indexer.timer
sudo systemctl start manic-miners-indexer.timer
```

## Monitoring and Logging

### 1. Log Rotation

Create `/etc/logrotate.d/manic-miners-indexer`:

```
/var/log/manic-miners/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 indexer indexer
    sharedscripts
    postrotate
        systemctl reload manic-miners-indexer >/dev/null 2>&1 || true
    endscript
}
```

### 2. Health Monitoring

Create health check endpoint:

```javascript
// src/health.ts
import express from 'express';
import fs from 'fs-extra';

const app = express();

app.get('/health', async (req, res) => {
  try {
    const catalogExists = await fs.pathExists('./output/catalog_index.json');
    const catalog = catalogExists ? await fs.readJSON('./output/catalog_index.json') : null;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      catalogExists,
      totalLevels: catalog?.totalLevels || 0,
      lastUpdated: catalog?.lastUpdated || null
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.listen(3000);
```

### 3. Prometheus Metrics

Add metrics collection:

```javascript
// src/metrics.ts
import { register, Counter, Gauge, Histogram } from 'prom-client';

export const metrics = {
  indexingDuration: new Histogram({
    name: 'indexing_duration_seconds',
    help: 'Duration of indexing operations',
    labelNames: ['source']
  }),
  
  levelsIndexed: new Counter({
    name: 'levels_indexed_total',
    help: 'Total number of levels indexed',
    labelNames: ['source']
  }),
  
  errors: new Counter({
    name: 'indexing_errors_total',
    help: 'Total number of indexing errors',
    labelNames: ['source', 'error_type']
  }),
  
  catalogSize: new Gauge({
    name: 'catalog_size_levels',
    help: 'Current size of the catalog in levels'
  })
};
```

## Security Considerations

### 1. Secrets Management

```bash
# Use environment variables
export DISCORD_TOKEN=$(cat /run/secrets/discord_token)

# Or use secrets management service
# AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id manic-miners/discord-token

# HashiCorp Vault
vault kv get -field=token secret/manic-miners/discord
```

### 2. File Permissions

```bash
# Secure sensitive files
chmod 600 .env.production
chmod 600 config.production.json

# Secure directories
chmod 755 /opt/manic-miners-indexer
chmod 755 /data/manic-miners/output
```

### 3. Network Security

```bash
# Firewall rules (UFW)
sudo ufw allow 22/tcp  # SSH
sudo ufw allow 3000/tcp  # Health endpoint (if needed)
sudo ufw enable
```

## Backup and Recovery

### 1. Backup Strategy

```bash
#!/bin/bash
# /usr/local/bin/backup-manic-miners.sh

BACKUP_DIR="/backup/manic-miners"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup output directory
tar -czf "$BACKUP_DIR/output_$DATE.tar.gz" /data/manic-miners/output

# Backup configuration
cp /opt/manic-miners-indexer/config.production.json "$BACKUP_DIR/config_$DATE.json"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.json" -mtime +7 -delete
```

### 2. Restore Procedure

```bash
# Stop service
sudo systemctl stop manic-miners-indexer

# Restore from backup
tar -xzf /backup/manic-miners/output_20240115_020000.tar.gz -C /

# Start service
sudo systemctl start manic-miners-indexer
```

## Scaling Strategies

### 1. Horizontal Scaling

For large deployments, split sources across multiple instances:

```yaml
# Instance 1: Archive.org
sources:
  internet_archive:
    enabled: true
  discord_community:
    enabled: false
  discord_archive:
    enabled: false
  hognose:
    enabled: false

# Instance 2: Discord
sources:
  internet_archive:
    enabled: false
  discord_community:
    enabled: true
  discord_archive:
    enabled: true
  hognose:
    enabled: false
```

### 2. Storage Optimization

```bash
# Use object storage for output
# AWS S3
aws s3 sync /data/manic-miners/output s3://manic-miners-catalog/output

# Or mount S3 as filesystem
sudo apt install s3fs
s3fs manic-miners-catalog /data/manic-miners/output
```

### 3. Performance Tuning

```javascript
// Optimize for production
{
  "sources": {
    "internet_archive": {
      "maxConcurrentDownloads": 20,  // Increase for better bandwidth
      "maxConcurrentMetadata": 30,   // More parallel metadata fetches
      "enableCache": true,
      "skipExisting": true,
      "verifyChecksums": false  // Disable for speed
    }
  }
}
```

## Troubleshooting Production Issues

### Common Issues

1. **Out of Memory**
   ```bash
   # Increase Node.js memory
   NODE_OPTIONS="--max-old-space-size=8192" node dist/index.js
   ```

2. **Disk Space**
   ```bash
   # Monitor disk usage
   df -h /data/manic-miners
   
   # Clean old data
   find /data/manic-miners/output -name "*.tmp" -delete
   ```

3. **Process Monitoring**
   ```bash
   # Check process
   ps aux | grep node
   
   # Check system resources
   htop
   
   # Check logs
   journalctl -u manic-miners-indexer -f
   ```

## Maintenance

### Regular Tasks

1. **Weekly**: Check logs for errors
2. **Monthly**: Update dependencies and rebuild
3. **Quarterly**: Review and optimize configuration
4. **Annually**: Major version upgrades

### Update Procedure

```bash
# Stop service
sudo systemctl stop manic-miners-indexer

# Backup current version
cp -r /opt/manic-miners-indexer /opt/manic-miners-indexer.backup

# Update code
cd /opt/manic-miners-indexer
git pull origin main
npm ci
npm run build

# Start service
sudo systemctl start manic-miners-indexer
```