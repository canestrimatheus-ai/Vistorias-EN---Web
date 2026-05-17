import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';
import { defineConfig, loadEnv } from 'vite';
import manageUserHandler from './api/manage-user.js';

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function createUserHandler(req, res, env) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Supabase server credentials are not configured.' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const token = String(req.headers.authorization || '').replace('Bearer ', '').trim();
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid authorization token.' }));
      return;
    }

    const { data: callerProfile, error: profileError } = await admin
      .from('profiles')
      .select('access_role, active')
      .eq('id', callerData.user.id)
      .maybeSingle();

    if (profileError || callerProfile?.access_role !== 'admin' || callerProfile?.active === false) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only active web administrators can create users.' }));
      return;
    }

    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    const normalizedRole = body.access_role === 'admin' ? 'admin' : 'app';

    if (!normalizedEmail || !body.password || !body.full_name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Name, email and password are required.' }));
      return;
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: normalizedEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        name: body.full_name,
        access_role: normalizedRole,
      },
    });

    if (createError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: createError.message }));
      return;
    }

    const { error: upsertError } = await admin.from('profiles').upsert({
      id: created.user.id,
      email: normalizedEmail,
      full_name: body.full_name,
      access_role: normalizedRole,
      active: true,
    });

    if (upsertError) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: upsertError.message }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user: created.user }));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: 'local-admin-api',
        configureServer(server) {
          server.middlewares.use('/api/create-user', (req, res) => {
            createUserHandler(req, res, env);
          });
          server.middlewares.use('/api/manage-user', async (req, res) => {
            try {
              const body = await readJsonBody(req);
              await manageUserHandler(
                { method: req.method, headers: req.headers, body },
                {
                  status(statusCode) {
                    res.statusCode = statusCode;
                    return this;
                  },
                  json(payload) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(payload));
                  },
                },
              );
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        },
      },
    ],
  };
});
