export interface ModelCapabilities {
  streaming?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  vision?: boolean;
  structuredOutput?: boolean;
}

export interface ModelInfo {
  id: string;
  provider: string;
  displayName?: string;
  capabilities?: ModelCapabilities;
  contextWindow?: number;
}
