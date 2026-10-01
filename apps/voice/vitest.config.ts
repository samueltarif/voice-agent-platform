import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@voice-agent/integrations': resolve(__dirname, '../../packages/integrations/src/index.ts'),
    },
  },
});
