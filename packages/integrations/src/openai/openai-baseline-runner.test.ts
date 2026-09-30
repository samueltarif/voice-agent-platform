import { describe, it, expect } from 'vitest';
import { runOpenAiBaseline } from '../../../../scripts/benchmarks/voice/run-openai-baseline.js';
import { resolve } from 'node:path';

const isLiveBaseline =
  process.env.OPENAI_RUN_LIVE_BASELINE === 'true' && Boolean(process.env.OPENAI_API_KEY);
const describeBaseline = isLiveBaseline ? describe : describe.skip;

describeBaseline('OpenAI Baseline Live Benchmark Runner', () => {
  it('executes frozen 12-case baseline dataset sequentially with zero retries', async () => {
    const datasetPath = resolve('scripts/benchmarks/voice/openai-baseline-v1-cases.json');
    await expect(runOpenAiBaseline(datasetPath)).resolves.not.toThrow();
  }, 120000);
});
