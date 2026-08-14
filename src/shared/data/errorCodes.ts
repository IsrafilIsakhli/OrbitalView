export type ProviderErrorCategory = "authentication" | "network" | "rateLimit" | "storage" | "upstream" | "validation";

export interface SafeProviderError {
  category: ProviderErrorCategory;
  code: string;
  correlationId: string;
  provider: string;
  retryable: boolean;
  retryAfterUnixMs: number | null;
}
