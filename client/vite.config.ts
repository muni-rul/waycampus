import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';

/**
 * Selective Public Copy Plugin:
 * Ensures lightweight mobile and web bundles by excluding the 20,000+ panorama tiles
 * and 474 raw 4K equirectangular master panoramas from dist/ (and hence APK assets).
 * Serves them seamlessly in dev, while production clients stream them on-demand from the CDN/server.
 */
function selectivePublicCopyPlugin(): Plugin {
  return {
    name: 'selective-public-copy',
    apply: 'build',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'public');
      const outDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(srcDir) || !fs.existsSync(outDir)) return;

      const copyRecursive = (src: string, dest: string, skipNames: Set<string>) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (skipNames.has(entry.name)) continue;
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath, new Set(['panoramas']));
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };

      // Exclude panorama-tiles at top level
      copyRecursive(srcDir, outDir, new Set(['panorama-tiles']));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), selectivePublicCopyPlugin()],
  build: {
    copyPublicDir: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
