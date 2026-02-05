import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  resolvexo: {
    baseUrl: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };
  slack: {
    botToken: string;
    channelId: string;
  };
  monitoring: {
    checkIntervalMs: number;
    maxRetries: number;
    retryDelayMs: number;
  };
}

export const config: Config = {
  resolvexo: {
    baseUrl: process.env.RESOLVEXO_BASE_URL || 'https://dashboard.resolvexo.com',
    apiKey: process.env.RESOLVEXO_API_KEY,
    username: process.env.RESOLVEXO_USERNAME,
    password: process.env.RESOLVEXO_PASSWORD,
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    channelId: process.env.SLACK_CHANNEL_ID || '',
  },
  monitoring: {
    checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '300000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
  },
};

export const DATASET_CONFIGS = {
  'wip-tab-portfolio-timeline': {
    name: 'WIP Tab - Portfolio Timeline',
    path: '/backoffice/catalog/datasets/wip-tab-portfolio-timeline/',
    apiPath: '/api/v1/datasets/wip-tab-portfolio-timeline/status',
    description: 'Portfolio Timeline dataset for WIP tab',
  },
} as const;

export type DatasetId = keyof typeof DATASET_CONFIGS;
