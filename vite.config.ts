import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// A short, human-checkable build stamp (v1.1 UI pass): shown in Settings
// so "did my last deploy actually land" has a one-glance answer. Falls
// back to just the date if git isn't available (e.g. a source-only
// deploy environment) rather than failing the build.
function buildVersion(): string {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname }).toString().trim();
    return `${date}-${hash}`;
  } catch {
    return date;
  }
}

export default defineConfig({
  root: 'src/frontend',
  plugins: [preact()],
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion()),
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
