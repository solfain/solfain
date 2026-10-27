import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWatchPartyHub } from './watchPartyHub.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(res, isImmutableAsset = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  );
  res.setHeader(
    'Content-Security-Policy',
    "object-src 'none'; base-uri 'self'; form-action 'self';",
  );
  if (isImmutableAsset) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

export function createProductionServer() {
  const partyHub = createWatchPartyHub();

  const server = http.createServer(async (req, res) => {
    try {
      const handledParty = await partyHub.handleHttpRequest(req, res);
      if (handledParty) return;

      const urlObj = new URL(req.url || '/', 'http://localhost');
      const decodedPath = decodeURIComponent(urlObj.pathname);
      const safeRelative = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const candidatePath = path.join(DIST_DIR, safeRelative);

      if (
        candidatePath.startsWith(DIST_DIR) &&
        fs.existsSync(candidatePath) &&
        fs.statSync(candidatePath).isFile()
      ) {
        const ext = path.extname(candidatePath).toLowerCase();
        setSecurityHeaders(res, safeRelative.startsWith('/assets/'));
        res.statusCode = 200;
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        fs.createReadStream(candidatePath).pipe(res);
        return;
      }

      const indexPath = path.join(DIST_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        setSecurityHeaders(res, false);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        fs.createReadStream(indexPath).pipe(res);
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Run "npm run build" before starting the production server.');
    } catch {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  partyHub.attachToServer(server);
  return { server, partyHub };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createProductionServer();
  server.listen(PORT, HOST, () => {
    console.log(`Solfain server + Watch Party WebSocket hub listening on http://${HOST}:${PORT}`);
  });
}
