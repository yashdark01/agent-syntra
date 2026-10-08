import { describeProviderContract } from '../packages/providers/src/contracts/provider-contract.js';
import { MockLLMProvider } from '@syntra/providers';

// Validate the MockLLMProvider against the shared provider contract test suite
describeProviderContract('MockLLMProvider', () => new MockLLMProvider({
  fixedResponse: 'Standard contract response test',
  chunkSize: 4,
  chunkDelayMs: 0,
}));
