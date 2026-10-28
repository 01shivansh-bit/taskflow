const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'todos.json');
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')
  : __dirname;

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Ensure data folder and todos.json exist
function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

// Read todos from disk
function readTodos() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading todos data:', err);
    return [];
  }
}

// Write todos to disk atomically
function writeTodos(todos) {
  ensureDataFile();
  const tempPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(todos, null, 2), 'utf-8');
  fs.renameSync(tempPath, DATA_FILE);
}

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse JSON request body
function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        // Protect against large payloads (>1MB)
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', err => reject(err));
  });
}

// Serve static files from public directory
function serveStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname;
  // Prevent directory traversal attacks
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file is inside public directory
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = parsedUrl;
  const method = req.method.toUpperCase();

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- API ROUTES ---

  // GET /healthz - Cloud Run & GCP Liveness/Readiness Health Check
  if (pathname === '/healthz' && method === 'GET') {
    return sendJSON(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  // GET /api/todos - List all todos
  if (pathname === '/api/todos' && method === 'GET') {
    const todos = readTodos();
    return sendJSON(res, 200, todos);
  }

  // POST /api/todos - Add a new todo
  if (pathname === '/api/todos' && method === 'POST') {
    try {
      const body = await parseJSONBody(req);
      const title = (body.title || '').trim();

      if (!title) {
        return sendJSON(res, 400, { error: 'Task title is required.' });
      }
      if (title.length > 250) {
        return sendJSON(res, 400, { error: 'Task title cannot exceed 250 characters.' });
      }

      const todos = readTodos();
      let dueDate = null;
      if (body.dueDate && typeof body.dueDate === 'string' && body.dueDate.trim().length > 0) {
        dueDate = body.dueDate.trim();
      }

      const newTodo = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        title,
        completed: false,
        createdAt: new Date().toISOString(),
        dueDate
      };

      todos.unshift(newTodo);
      writeTodos(todos);

      return sendJSON(res, 201, newTodo);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON request body.' });
    }
  }

  // PATCH /api/todos/:id - Update todo (completed status, title, or dueDate)
  const patchMatch = pathname.match(/^\/api\/todos\/([a-zA-Z0-9_-]+)$/);
  if (patchMatch && method === 'PATCH') {
    const id = patchMatch[1];
    try {
      const body = await parseJSONBody(req);
      const todos = readTodos();
      const index = todos.findIndex(t => t.id === id);

      if (index === -1) {
        return sendJSON(res, 404, { error: 'Todo not found.' });
      }

      if (typeof body.completed === 'boolean') {
        todos[index].completed = body.completed;
      }
      if (typeof body.title === 'string' && body.title.trim().length > 0) {
        todos[index].title = body.title.trim();
      }
      if (body.dueDate !== undefined) {
        todos[index].dueDate = (typeof body.dueDate === 'string' && body.dueDate.trim().length > 0) ? body.dueDate.trim() : null;
      }

      writeTodos(todos);
      return sendJSON(res, 200, todos[index]);
    } catch (err) {
      return sendJSON(res, 400, { error: 'Invalid JSON request body.' });
    }
  }

  // DELETE /api/todos?completed=true - Clear all completed todos
  if (pathname === '/api/todos' && method === 'DELETE' && searchParams.get('completed') === 'true') {
    let todos = readTodos();
    const beforeCount = todos.length;
    todos = todos.filter(t => !t.completed);
    writeTodos(todos);
    return sendJSON(res, 200, {
      message: 'Completed todos cleared',
      deletedCount: beforeCount - todos.length
    });
  }

  // DELETE /api/todos/:id - Delete a todo by ID
  const deleteMatch = pathname.match(/^\/api\/todos\/([a-zA-Z0-9_-]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const id = deleteMatch[1];
    let todos = readTodos();
    const initialLength = todos.length;
    todos = todos.filter(t => t.id !== id);

    if (todos.length === initialLength) {
      return sendJSON(res, 404, { error: 'Todo not found.' });
    }

    writeTodos(todos);
    return sendJSON(res, 200, { success: true, id });
  }

  // Fallback: serve static assets from public/
  serveStaticFile(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  To-Do App is running!`);
  console.log(`  Local: http://localhost:${PORT}`);
  console.log(`  Host:  0.0.0.0:${PORT} (GCP Cloud Run Ready)`);
  console.log(`========================================\n`);
});

// Graceful shutdown handling for GCP Cloud Run container lifecycle
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down server gracefully...`);
  server.close(() => {
    console.log('Server closed cleanly. Process terminating.');
    process.exit(0);
  });

  // Force termination if connections hang past 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

