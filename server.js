import WebSocket from 'ws';
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import adminInspections from './api/admin-inspections.js';
import adminProfiles from './api/admin-profiles.js';
import createUser from './api/create-user.js';
import manageUser from './api/manage-user.js';
import mobileInspections from './api/mobile-inspections.js';
import ping from './api/ping.js';
import registerPushToken from './api/register-push-token.js';
import repairAuthSession from './api/repair-auth-session.js';
import sessionProfile from './api/session-profile.js';
import submitInspection from './api/submit-inspection.js';
import updateProfilePhoto from './api/update-profile-photo.js';
import webLogin from './api/web-login.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3020;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Normalize /vistorias prefix if forwarded intact by reverse proxy
app.use((req, res, next) => {
  if (req.url.startsWith('/vistorias/')) {
    req.url = req.url.substring('/vistorias'.length);
  } else if (req.url === '/vistorias') {
    req.url = '/';
  }
  next();
});

// Wrap Vercel serverless function to Express route
const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('API Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
};

// API Routes
app.all('/api/admin-inspections', wrap(adminInspections));
app.all('/api/admin-profiles', wrap(adminProfiles));
app.all('/api/create-user', wrap(createUser));
app.all('/api/manage-user', wrap(manageUser));
app.all('/api/mobile-inspections', wrap(mobileInspections));
app.all('/api/ping', wrap(ping));
app.all('/api/register-push-token', wrap(registerPushToken));
app.all('/api/repair-auth-session', wrap(repairAuthSession));
app.all('/api/session-profile', wrap(sessionProfile));
app.all('/api/submit-inspection', wrap(submitInspection));
app.all('/api/update-profile-photo', wrap(updateProfilePhoto));
app.all('/api/web-login', wrap(webLogin));

// Healthcheck
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'vistorias-web' }));

// Serve static built SPA assets
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for client-side routing
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Vistorias Web & API running on http://0.0.0.0:${PORT}`);
});
