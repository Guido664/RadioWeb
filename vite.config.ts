import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Ensures that if the user places `catalog_stations.csv` in the project root
 * (`./catalog_stations.csv`) instead of `./public/catalog_stations.csv`,
 * it is automatically synced into `public/catalog_stations.csv` for both dev and Vercel builds.
 */
function syncRootCatalogCsvPlugin(): Plugin {
  const syncCsv = () => {
    try {
      const rootCsv = path.resolve(__dirname, 'catalog_stations.csv');
      const publicDir = path.resolve(__dirname, 'public');
      const publicCsv = path.resolve(publicDir, 'catalog_stations.csv');

      if (fs.existsSync(rootCsv)) {
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        const rootStat = fs.statSync(rootCsv);
        const publicExists = fs.existsSync(publicCsv);
        const publicStat = publicExists ? fs.statSync(publicCsv) : null;

        // Copy if public/catalog_stations.csv doesn't exist or differs in size/mtime
        if (
          !publicStat ||
          rootStat.size !== publicStat.size ||
          rootStat.mtimeMs > publicStat.mtimeMs
        ) {
          fs.copyFileSync(rootCsv, publicCsv);
        }
      }
    } catch {
      // Ignore fs errors in restricted environments
    }
  };

  return {
    name: 'sync-root-catalog-csv',
    buildStart() {
      syncCsv();
    },
    configureServer() {
      syncCsv();
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [syncRootCatalogCsvPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
