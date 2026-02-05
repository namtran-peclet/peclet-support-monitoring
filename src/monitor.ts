import { ResolveXOClient } from './resolvexo-client';
import { SlackNotifier } from './slack-notifier';
import { config, DATASET_CONFIGS, DatasetId } from './config';
import { DatasetStatus, CheckResult, MonitoringReport } from './types';
import { sleep } from './retry';

export class DatasetMonitor {
  private client: ResolveXOClient;
  private notifier: SlackNotifier;
  private previousStatuses: Map<string, DatasetStatus['status']> = new Map();
  private isRunning = false;

  constructor() {
    this.client = new ResolveXOClient();
    this.notifier = new SlackNotifier();
  }

  async checkDataset(datasetId: DatasetId): Promise<CheckResult> {
    const checkedAt = new Date().toISOString();
    const previousStatus = this.previousStatuses.get(datasetId);

    console.log(`Checking dataset: ${datasetId}...`);

    const dataset = await this.client.getDatasetStatus(datasetId);
    const resolved = previousStatus === 'error' && dataset.status === 'ok';

    // Update previous status
    this.previousStatuses.set(datasetId, dataset.status);

    const result: CheckResult = {
      dataset,
      checkedAt,
      resolved,
      previousStatus,
    };

    console.log(`Dataset ${datasetId}: ${dataset.status}${resolved ? ' (RESOLVED)' : ''}`);

    return result;
  }

  async checkAllAndNotify(): Promise<MonitoringReport> {
    const timestamp = new Date().toISOString();
    const datasetIds = Object.keys(DATASET_CONFIGS) as DatasetId[];
    const datasets: DatasetStatus[] = [];

    console.log(`\n=== Dataset Check at ${timestamp} ===`);

    for (const datasetId of datasetIds) {
      try {
        const result = await this.checkDataset(datasetId);
        datasets.push(result.dataset);

        // Send alert if status changed to error or resolved
        if (result.dataset.status === 'error' && result.previousStatus !== 'error') {
          await this.notifier.sendDatasetAlert(result);
        } else if (result.resolved) {
          await this.notifier.sendDatasetAlert(result);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`Error checking dataset ${datasetId}:`, err.message);

        datasets.push({
          id: datasetId,
          name: DATASET_CONFIGS[datasetId].name,
          status: 'unknown',
          lastUpdated: timestamp,
          errorMessage: err.message,
        });
      }
    }

    const report: MonitoringReport = {
      timestamp,
      datasets,
      summary: {
        total: datasets.length,
        ok: datasets.filter(d => d.status === 'ok').length,
        error: datasets.filter(d => d.status === 'error').length,
        warning: datasets.filter(d => d.status === 'warning').length,
        unknown: datasets.filter(d => d.status === 'unknown').length,
      },
    };

    console.log(`Summary: ${report.summary.ok} OK, ${report.summary.error} Error, ${report.summary.warning} Warning, ${report.summary.unknown} Unknown`);

    return report;
  }

  async runOnce(): Promise<MonitoringReport> {
    const report = await this.checkAllAndNotify();
    return report;
  }

  async runContinuous(): Promise<void> {
    this.isRunning = true;
    console.log(`Starting continuous monitoring. Interval: ${config.monitoring.checkIntervalMs}ms`);

    while (this.isRunning) {
      try {
        await this.checkAllAndNotify();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('Error during monitoring cycle:', err.message);
      }

      if (this.isRunning) {
        await sleep(config.monitoring.checkIntervalMs);
      }
    }

    console.log('Monitoring stopped');
  }

  stop(): void {
    this.isRunning = false;
  }

  async sendSummaryReport(): Promise<void> {
    const report = await this.checkAllAndNotify();
    await this.notifier.sendSummaryReport(report);
  }
}

export function generateStatusSummary(report: MonitoringReport): string {
  const lines: string[] = [
    `Dataset Monitoring Report`,
    `Generated: ${report.timestamp}`,
    ``,
    `Summary:`,
    `  Total: ${report.summary.total}`,
    `  OK: ${report.summary.ok}`,
    `  Error: ${report.summary.error}`,
    `  Warning: ${report.summary.warning}`,
    `  Unknown: ${report.summary.unknown}`,
    ``,
    `Datasets:`,
  ];

  for (const dataset of report.datasets) {
    const statusIcon = {
      ok: '[OK]',
      error: '[ERROR]',
      warning: '[WARN]',
      unknown: '[?]',
    }[dataset.status];

    lines.push(`  ${statusIcon} ${dataset.name}`);

    if (dataset.errorMessage) {
      lines.push(`       Error: ${dataset.errorMessage}`);
    }

    if (dataset.details?.lastSuccessfulFetch) {
      lines.push(`       Last Success: ${dataset.details.lastSuccessfulFetch}`);
    }
  }

  return lines.join('\n');
}
