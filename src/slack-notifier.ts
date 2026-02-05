import { WebClient } from '@slack/web-api';
import { config, DATASET_CONFIGS } from './config';
import { DatasetStatus, CheckResult, MonitoringReport, SlackBlock } from './types';

export class SlackNotifier {
  private client: WebClient;
  private channelId: string;

  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.channelId = config.slack.channelId;
  }

  async sendDatasetAlert(result: CheckResult): Promise<void> {
    const { dataset, resolved, previousStatus } = result;
    const datasetConfig = DATASET_CONFIGS[dataset.id as keyof typeof DATASET_CONFIGS];

    const emoji = this.getStatusEmoji(dataset.status);
    const statusText = this.getStatusText(dataset.status);

    let headerText: string;
    if (resolved) {
      headerText = `:white_check_mark: Dataset Alert Resolved: ${dataset.name}`;
    } else if (dataset.status === 'error') {
      headerText = `:rotating_light: Dataset Alert: ${dataset.name}`;
    } else if (dataset.status === 'warning') {
      headerText = `:warning: Dataset Warning: ${dataset.name}`;
    } else {
      headerText = `${emoji} Dataset Status: ${dataset.name}`;
    }

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: headerText,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Status:*\n${emoji} ${statusText}`,
          },
          {
            type: 'mrkdwn',
            text: `*Last Updated:*\n${this.formatDate(dataset.lastUpdated)}`,
          },
        ],
      },
    ];

    if (dataset.errorMessage) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error Message:*\n\`\`\`${dataset.errorMessage}\`\`\``,
        },
      });
    }

    if (dataset.details) {
      const detailFields: Array<{ type: string; text: string }> = [];

      if (dataset.details.resourceUrl) {
        detailFields.push({
          type: 'mrkdwn',
          text: `*Resource URL:*\n${dataset.details.resourceUrl}`,
        });
      }

      if (dataset.details.fetchStatus) {
        detailFields.push({
          type: 'mrkdwn',
          text: `*Fetch Status:*\n${dataset.details.fetchStatus}`,
        });
      }

      if (dataset.details.lastSuccessfulFetch) {
        detailFields.push({
          type: 'mrkdwn',
          text: `*Last Successful Fetch:*\n${this.formatDate(dataset.details.lastSuccessfulFetch)}`,
        });
      }

      if (dataset.details.lastFailedFetch) {
        detailFields.push({
          type: 'mrkdwn',
          text: `*Last Failed Fetch:*\n${this.formatDate(dataset.details.lastFailedFetch)}`,
        });
      }

      if (detailFields.length > 0) {
        blocks.push({
          type: 'section',
          fields: detailFields.slice(0, 4), // Slack limits to 10 fields
        });
      }
    }

    if (resolved && previousStatus) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Previous Status:* ${this.getStatusEmoji(previousStatus)} ${this.getStatusText(previousStatus)}`,
        },
      });
    }

    // Add link to dashboard
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${config.resolvexo.baseUrl}${datasetConfig.path}|View Dataset in Dashboard>`,
      },
    });

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Checked at ${this.formatDate(result.checkedAt)}`,
        },
      ],
    });

    await this.client.chat.postMessage({
      channel: this.channelId,
      text: headerText,
      blocks: blocks as any,
    });
  }

  async sendSummaryReport(report: MonitoringReport): Promise<void> {
    const { summary, datasets } = report;

    const statusLine = [
      summary.ok > 0 ? `:white_check_mark: ${summary.ok} OK` : null,
      summary.error > 0 ? `:x: ${summary.error} Error` : null,
      summary.warning > 0 ? `:warning: ${summary.warning} Warning` : null,
      summary.unknown > 0 ? `:grey_question: ${summary.unknown} Unknown` : null,
    ]
      .filter(Boolean)
      .join('  |  ');

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Dataset Monitoring Summary',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Overview:* ${statusLine}`,
        },
      },
    ];

    // Add details for each dataset
    for (const dataset of datasets) {
      const emoji = this.getStatusEmoji(dataset.status);
      let text = `${emoji} *${dataset.name}*: ${this.getStatusText(dataset.status)}`;

      if (dataset.errorMessage) {
        text += `\n   _${dataset.errorMessage}_`;
      }

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Report generated at ${this.formatDate(report.timestamp)}`,
        },
      ],
    });

    await this.client.chat.postMessage({
      channel: this.channelId,
      text: `Dataset Monitoring Summary: ${statusLine}`,
      blocks: blocks as any,
    });
  }

  async sendSimpleMessage(message: string): Promise<void> {
    await this.client.chat.postMessage({
      channel: this.channelId,
      text: message,
    });
  }

  private getStatusEmoji(status: DatasetStatus['status']): string {
    switch (status) {
      case 'ok':
        return ':white_check_mark:';
      case 'error':
        return ':x:';
      case 'warning':
        return ':warning:';
      default:
        return ':grey_question:';
    }
  }

  private getStatusText(status: DatasetStatus['status']): string {
    switch (status) {
      case 'ok':
        return 'OK';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      default:
        return 'Unknown';
    }
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
    } catch {
      return dateString;
    }
  }
}
