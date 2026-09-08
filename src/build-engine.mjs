import { build } from 'esbuild';
import path from 'node:path';
await build({
  entryPoints: ['src/agentready-entry.ts'], outfile: 'src/agentready-engine.cjs',
  bundle: true, platform: 'node', format: 'cjs', target: 'node22', packages: 'external',
  plugins: [{ name: 'public-network-transport', setup(builder) {
    builder.onResolve({ filter: /^undici$/ }, args => args.importer.endsWith('/core/src/http.ts') ? { path: path.resolve('src/public-fetch.js') } : undefined);
  } }]
});
