import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

export default defineConfig({
  plugins: [react()],
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.ts'],
    css: true,
  },
});
