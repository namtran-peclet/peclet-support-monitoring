#!/usr/bin/env ts-node

import { DatasetMonitor, generateStatusSummary } from './monitor';
import { DATASET_CONFIGS, DatasetId } from './config';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  const datasetId = args[1] as DatasetId | undefined;

  const monitor = new DatasetMonitor();

  switch (command) {
    case 'check': {
      // Check specific dataset or all datasets
      if (datasetId) {
        if (!(datasetId in DATASET_CONFIGS)) {
          console.error(`Unknown dataset: ${datasetId}`);
          console.error(`Available datasets: ${Object.keys(DATASET_CONFIGS).join(', ')}`);
          process.exit(1);
        }

        const result = await monitor.checkDataset(datasetId);
        console.log('\n--- Dataset Status ---');
        console.log(`Name: ${result.dataset.name}`);
        console.log(`ID: ${result.dataset.id}`);
        console.log(`Status: ${result.dataset.status.toUpperCase()}`);
        console.log(`Last Updated: ${result.dataset.lastUpdated}`);

        if (result.dataset.errorMessage) {
          console.log(`Error: ${result.dataset.errorMessage}`);
        }

        if (result.dataset.details) {
          console.log('\nDetails:');
          const details = result.dataset.details;
          if (details.resourceUrl) console.log(`  Resource URL: ${details.resourceUrl}`);
          if (details.fetchStatus) console.log(`  Fetch Status: ${details.fetchStatus}`);
          if (details.recordCount !== undefined) console.log(`  Record Count: ${details.recordCount}`);
          if (details.lastSuccessfulFetch) console.log(`  Last Successful Fetch: ${details.lastSuccessfulFetch}`);
          if (details.lastFailedFetch) console.log(`  Last Failed Fetch: ${details.lastFailedFetch}`);
          if (details.failureReason) console.log(`  Failure Reason: ${details.failureReason}`);
        }

        if (result.resolved) {
          console.log('\n*** This error has been RESOLVED ***');
        }
      } else {
        const report = await monitor.runOnce();
        console.log('\n' + generateStatusSummary(report));
      }
      break;
    }

    case 'summary': {
      // Send summary report to Slack
      console.log('Generating and sending summary report to Slack...');
      await monitor.sendSummaryReport();
      console.log('Summary report sent successfully!');
      break;
    }

    case 'monitor': {
      // Run continuous monitoring
      console.log('Starting continuous monitoring...');
      console.log('Press Ctrl+C to stop');

      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, stopping monitor...');
        monitor.stop();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, stopping monitor...');
        monitor.stop();
        process.exit(0);
      });

      await monitor.runContinuous();
      break;
    }

    case 'list': {
      // List available datasets
      console.log('Available datasets:');
      for (const [id, cfg] of Object.entries(DATASET_CONFIGS)) {
        console.log(`  ${id}: ${cfg.name}`);
        console.log(`    Path: ${cfg.path}`);
        console.log(`    API: ${cfg.apiPath}`);
        console.log('');
      }
      break;
    }

    case 'help':
    default: {
      console.log(`
Dataset Monitoring Tool

Usage:
  npm run check [command] [options]

Commands:
  check [dataset-id]  Check status of a specific dataset or all datasets
  summary             Check all datasets and send summary report to Slack
  monitor             Start continuous monitoring with Slack alerts
  list                List all available datasets
  help                Show this help message

Examples:
  npm run check                              # Check all datasets
  npm run check check wip-tab-portfolio-timeline  # Check specific dataset
  npm run check summary                      # Send summary to Slack
  npm run check monitor                      # Start continuous monitoring

Environment Variables:
  RESOLVEXO_BASE_URL    - ResolveXO dashboard URL
  RESOLVEXO_API_KEY     - API key for authentication
  RESOLVEXO_USERNAME    - Username for authentication
  RESOLVEXO_PASSWORD    - Password for authentication
  SLACK_BOT_TOKEN       - Slack bot token for notifications
  SLACK_CHANNEL_ID      - Slack channel for alerts
  CHECK_INTERVAL_MS     - Interval between checks (default: 300000)
  MAX_RETRIES           - Max retries for failed requests (default: 3)
  RETRY_DELAY_MS        - Delay between retries (default: 5000)
`);
      break;
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
