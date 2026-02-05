import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, DATASET_CONFIGS, DatasetId } from './config';
import { DatasetStatus, DatasetDetails } from './types';
import { withRetry } from './retry';

export class ResolveXOClient {
  private client: AxiosInstance;
  private authToken?: string;

  constructor() {
    this.client = axios.create({
      baseURL: config.resolvexo.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use((requestConfig) => {
      if (this.authToken) {
        requestConfig.headers.Authorization = `Bearer ${this.authToken}`;
      } else if (config.resolvexo.apiKey) {
        requestConfig.headers['X-API-Key'] = config.resolvexo.apiKey;
      }
      return requestConfig;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401 && config.resolvexo.username) {
          await this.authenticate();
          if (error.config) {
            return this.client.request(error.config);
          }
        }
        throw error;
      }
    );
  }

  async authenticate(): Promise<void> {
    if (!config.resolvexo.username || !config.resolvexo.password) {
      throw new Error('Username and password required for authentication');
    }

    try {
      const response = await axios.post(`${config.resolvexo.baseUrl}/api/v1/auth/login`, {
        username: config.resolvexo.username,
        password: config.resolvexo.password,
      });

      this.authToken = response.data.token || response.data.access_token;
      console.log('Successfully authenticated with ResolveXO');
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`Authentication failed: ${axiosError.message}`);
    }
  }

  async getDatasetStatus(datasetId: DatasetId): Promise<DatasetStatus> {
    const datasetConfig = DATASET_CONFIGS[datasetId];

    return withRetry(
      async () => {
        try {
          // Try API endpoint first
          const response = await this.client.get(datasetConfig.apiPath);
          return this.parseApiResponse(datasetId, response.data);
        } catch (error) {
          const axiosError = error as AxiosError;

          // If API endpoint fails, try to scrape the dashboard page
          if (axiosError.response?.status === 404) {
            return this.scrapeDatasetPage(datasetId);
          }

          throw error;
        }
      },
      {
        maxRetries: config.monitoring.maxRetries,
        delayMs: config.monitoring.retryDelayMs,
        onRetry: (attempt, err) => {
          console.log(`Retry ${attempt} for dataset ${datasetId}: ${err.message}`);
        },
      }
    );
  }

  private parseApiResponse(datasetId: DatasetId, data: any): DatasetStatus {
    const datasetConfig = DATASET_CONFIGS[datasetId];

    // Handle various API response formats
    const status = this.determineStatus(data);
    const details: DatasetDetails = {
      resourceUrl: data.resource_url || data.resourceUrl,
      fetchStatus: data.fetch_status || data.fetchStatus,
      recordCount: data.record_count || data.recordCount,
      lastSuccessfulFetch: data.last_successful_fetch || data.lastSuccessfulFetch,
      lastFailedFetch: data.last_failed_fetch || data.lastFailedFetch,
      failureReason: data.failure_reason || data.failureReason || data.error_message,
    };

    return {
      id: datasetId,
      name: datasetConfig.name,
      status,
      lastUpdated: data.updated_at || data.lastUpdated || new Date().toISOString(),
      errorMessage: data.error_message || data.errorMessage || data.failure_reason,
      errorCount: data.error_count || data.errorCount,
      successCount: data.success_count || data.successCount,
      details,
    };
  }

  private determineStatus(data: any): DatasetStatus['status'] {
    // Check various status indicators
    if (data.status) {
      const normalizedStatus = data.status.toLowerCase();
      if (['ok', 'success', 'healthy', 'active'].includes(normalizedStatus)) {
        return 'ok';
      }
      if (['error', 'failed', 'unhealthy', 'critical'].includes(normalizedStatus)) {
        return 'error';
      }
      if (['warning', 'degraded', 'partial'].includes(normalizedStatus)) {
        return 'warning';
      }
    }

    // Check for error indicators
    if (data.error || data.error_message || data.failure_reason) {
      return 'error';
    }

    // Check fetch status
    if (data.fetch_status === 'Cannot fetch the resource') {
      return 'error';
    }

    // Check if resource is accessible
    if (data.is_healthy === true || data.isHealthy === true) {
      return 'ok';
    }

    if (data.is_healthy === false || data.isHealthy === false) {
      return 'error';
    }

    return 'unknown';
  }

  private async scrapeDatasetPage(datasetId: DatasetId): Promise<DatasetStatus> {
    const datasetConfig = DATASET_CONFIGS[datasetId];

    try {
      const response = await this.client.get(datasetConfig.path, {
        headers: { Accept: 'text/html' },
      });

      // Parse HTML response to extract status information
      const html = response.data as string;
      return this.parseHtmlStatus(datasetId, html);
    } catch (error) {
      const axiosError = error as AxiosError;

      return {
        id: datasetId,
        name: datasetConfig.name,
        status: 'unknown',
        lastUpdated: new Date().toISOString(),
        errorMessage: `Unable to fetch dataset status: ${axiosError.message}`,
      };
    }
  }

  private parseHtmlStatus(datasetId: DatasetId, html: string): DatasetStatus {
    const datasetConfig = DATASET_CONFIGS[datasetId];

    // Look for common status patterns in HTML
    const errorPatterns = [
      /Cannot fetch the resource/i,
      /error/i,
      /failed/i,
      /status[:\s]*error/i,
      /class="[^"]*error[^"]*"/i,
    ];

    const okPatterns = [
      /status[:\s]*ok/i,
      /status[:\s]*success/i,
      /healthy/i,
      /class="[^"]*success[^"]*"/i,
    ];

    const hasError = errorPatterns.some(pattern => pattern.test(html));
    const hasOk = okPatterns.some(pattern => pattern.test(html));

    let status: DatasetStatus['status'] = 'unknown';
    let errorMessage: string | undefined;

    if (hasError && !hasOk) {
      status = 'error';
      // Try to extract error message
      const errorMatch = html.match(/Cannot fetch the resource|error[:\s]*([^<\n]+)/i);
      errorMessage = errorMatch ? errorMatch[0] : 'Dataset error detected';
    } else if (hasOk && !hasError) {
      status = 'ok';
    }

    return {
      id: datasetId,
      name: datasetConfig.name,
      status,
      lastUpdated: new Date().toISOString(),
      errorMessage,
    };
  }

  async checkAllDatasets(): Promise<DatasetStatus[]> {
    const datasetIds = Object.keys(DATASET_CONFIGS) as DatasetId[];
    const results: DatasetStatus[] = [];

    for (const datasetId of datasetIds) {
      try {
        const status = await this.getDatasetStatus(datasetId);
        results.push(status);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.push({
          id: datasetId,
          name: DATASET_CONFIGS[datasetId].name,
          status: 'unknown',
          lastUpdated: new Date().toISOString(),
          errorMessage: `Failed to check status: ${err.message}`,
        });
      }
    }

    return results;
  }
}
