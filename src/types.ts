export interface DatasetStatus {
  id: string;
  name: string;
  status: 'ok' | 'error' | 'warning' | 'unknown';
  lastUpdated: string;
  errorMessage?: string;
  errorCount?: number;
  successCount?: number;
  details?: DatasetDetails;
}

export interface DatasetDetails {
  resourceUrl?: string;
  fetchStatus?: string;
  recordCount?: number;
  lastSuccessfulFetch?: string;
  lastFailedFetch?: string;
  failureReason?: string;
}

export interface CheckResult {
  dataset: DatasetStatus;
  checkedAt: string;
  resolved: boolean;
  previousStatus?: 'ok' | 'error' | 'warning' | 'unknown';
}

export interface SlackMessage {
  channel: string;
  text: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: string;
    url?: string;
  }>;
}

export interface MonitoringReport {
  timestamp: string;
  datasets: DatasetStatus[];
  summary: {
    total: number;
    ok: number;
    error: number;
    warning: number;
    unknown: number;
  };
}
