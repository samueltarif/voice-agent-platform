import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const distToSrcPlugin = {
  name: 'l2-dist-to-src',
  resolveId(id) {
    const clean = id.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
    if (clean.includes('typesafe-jev-turn-decision-adapter.js')) {
      return resolve(__dirname, 'src/typesafe/typesafe-jev-turn-decision-adapter.ts');
    }
    if (clean.includes('openai-conversation-model-adapter.js')) {
      return resolve(__dirname, 'src/openai/openai-conversation-model-adapter.ts');
    }
    if (clean.includes('operating-hours-capability-matcher.js')) {
      return resolve(__dirname, '../../apps/voice/src/operating-hours-capability-matcher.ts');
    }
    if (clean.includes('frozen-policy-interpreter.js')) {
      return resolve(__dirname, '../../apps/voice/src/frozen-policy-interpreter.ts');
    }
    if (clean.includes('operating-hours-turn-handler.js')) {
      return resolve(__dirname, '../../apps/voice/src/operating-hours-turn-handler.ts');
    }
    return null;
  },
};

export default defineConfig({
  plugins: [distToSrcPlugin],
});
