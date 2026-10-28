import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createWatchPartyHub } from './server/watchPartyHub.mjs';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function solfainWatchPartyPlugin(): Plugin {
  const hub = createWatchPartyHub();

  return {
    name: 'solfain-watch-party-hub',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void hub
          .handleHttpRequest(req, res)
          .then((handled: boolean) => {
            if (!handled) next();
          })
          .catch(() => next());
      });
      if (server.httpServer) {
        hub.attachToServer(server.httpServer);
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void hub
          .handleHttpRequest(req, res)
          .then((handled: boolean) => {
            if (!handled) next();
          })
          .catch(() => next());
      });
      if (server.httpServer) {
        hub.attachToServer(server.httpServer);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), solfainWatchPartyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: securityHeaders,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    headers: securityHeaders,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    css: true,
  },
});
