# Peclet Support Monitoring

Automation tool to monitor ResolveXO dataset status and send Slack alerts when issues occur or resolve.

## Features

- Monitor ResolveXO datasets for errors (e.g., "Cannot fetch the resource")
- Automatic retry with exponential backoff for transient failures
- Slack notifications when errors occur or resolve
- Continuous monitoring mode with configurable intervals
- Summary reports for all monitored datasets

## Monitored Datasets

| Dataset ID | Name | Dashboard Link |
|------------|------|----------------|
| `wip-tab-portfolio-timeline` | WIP Tab - Portfolio Timeline | [View](https://dashboard.resolvexo.com/backoffice/catalog/datasets/wip-tab-portfolio-timeline/) |

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure the following:

```bash
# ResolveXO API Configuration
RESOLVEXO_BASE_URL=https://dashboard.resolvexo.com
RESOLVEXO_API_KEY=your_api_key_here
RESOLVEXO_USERNAME=your_username
RESOLVEXO_PASSWORD=your_password

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_CHANNEL_ID=C06CX2QR2R3

# Monitoring Configuration
CHECK_INTERVAL_MS=300000    # 5 minutes
MAX_RETRIES=3
RETRY_DELAY_MS=5000
```

## Usage

### Check All Datasets

```bash
npm run check
```

### Check Specific Dataset

```bash
npm run check check wip-tab-portfolio-timeline
```

### Send Summary Report to Slack

```bash
npm run check summary
```

### Start Continuous Monitoring

```bash
npm run check monitor
# or
npm start
```

### List Available Datasets

```bash
npm run check list
```

## Adding New Datasets

Edit `src/config.ts` to add new datasets:

```typescript
export const DATASET_CONFIGS = {
  'wip-tab-portfolio-timeline': {
    name: 'WIP Tab - Portfolio Timeline',
    path: '/backoffice/catalog/datasets/wip-tab-portfolio-timeline/',
    apiPath: '/api/v1/datasets/wip-tab-portfolio-timeline/status',
    description: 'Portfolio Timeline dataset for WIP tab',
  },
  // Add more datasets here
} as const;
```

## How It Works

1. **Status Check**: The tool periodically checks the status of configured datasets via the ResolveXO API or dashboard scraping
2. **Error Detection**: When a dataset has an error (like "Cannot fetch the resource"), it sends a Slack alert
3. **Auto-Resolution**: When an error resolves itself, it sends a resolution notification
4. **Retry Logic**: Transient failures are automatically retried with exponential backoff

## Slack Notifications

The tool sends different types of notifications:

- **Error Alert**: When a dataset enters an error state
- **Resolution Alert**: When a dataset error resolves
- **Summary Report**: On-demand summary of all dataset statuses

## Development

```bash
# Build
npm run build

# Run in development mode
npm run dev

# Run linting
npm run lint
```

## License

MIT
