#!/usr/bin/env ts-node

import { DatasetMonitor } from './monitor';

async function main(): Promise<void> {
  console.log('Peclet Support Monitoring - Dataset Status Checker');
  console.log('==================================================\n');

  const monitor = new DatasetMonitor();

  // Handle graceful shutdown
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

  // Start continuous monitoring
  await monitor.runContinuous();
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

// Export for programmatic usage
export { DatasetMonitor } from './monitor';
export { ResolveXOClient } from './resolvexo-client';
export { SlackNotifier } from './slack-notifier';
export { config, DATASET_CONFIGS } from './config';
export * from './types';
