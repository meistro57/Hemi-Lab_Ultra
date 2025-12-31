const http = require("http");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const WebSocket = require("ws");
const rateLimit = require("express-rate-limit");

const port = process.env.PORT || 3000;
const root = path.join(__dirname);
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, "users.json");
const SESSIONS_FILE =
  process.env.SESSIONS_FILE || path.join(__dirname, "sessions.json");
const SALT_ROUNDS = 12;

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
};

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// Rate limiter for authentication endpoints
const authLimiter = new Map();
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_AUTH_ATTEMPTS = 5;

function checkRateLimit(ip, endpoint) {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();

  if (!authLimiter.has(key)) {
    authLimiter.set(key, { count: 1, resetTime: now + AUTH_WINDOW_MS });
    return true;
  }

  const limit = authLimiter.get(key);
  if (now > limit.resetTime) {
    authLimiter.set(key, { count: 1, resetTime: now + AUTH_WINDOW_MS });
    return true;
  }

  if (limit.count >= MAX_AUTH_ATTEMPTS) {
    return false;
  }

  limit.count++;
  return true;
}

// Session token management
const sessions = new Map(); // token -> username
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function generateToken() {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString("hex");
}

function validateToken(token) {
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session.username;
}

function createSession(username) {
  const token = generateToken();
  sessions.set(token, {
    username,
    expiresAt: Date.now() + SESSION_EXPIRY
  });
  return token;
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { text } = JSON.parse(body || "{}");
        const words = (text || "")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .split(/\s+/)
          .filter(Boolean);
        const freq = {};
        words.forEach((w) => {
          freq[w] = (freq[w] || 0) + 1;
        });
        const top = Object.keys(freq)
          .sort((a, b) => freq[b] - freq[a])
          .slice(0, 3);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ summary: `Top keywords: ${top.join(", ")}` })
        );
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/register") {
    const ip = req.socket.remoteAddress;
    if (!checkRateLimit(ip, "register")) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many registration attempts. Try again later." }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { username, password } = JSON.parse(body || "{}");
        if (!username || !password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Username and password required" }));
          return;
        }

        if (password.length < 8) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Password must be at least 8 characters" }));
          return;
        }

        const users = loadUsers();
        if (users[username]) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Username already exists" }));
          return;
        }

        const hashedPassword = await hashPassword(password);
        users[username] = { password: hashedPassword };
        saveUsers(users);

        const token = createSession(username);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, token }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/login") {
    const ip = req.socket.remoteAddress;
    if (!checkRateLimit(ip, "login")) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many login attempts. Try again later." }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { username, password } = JSON.parse(body || "{}");
        if (!username || !password) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Username and password required" }));
          return;
        }

        const users = loadUsers();
        const user = users[username];

        // Use a dummy hash to prevent timing attacks that could enumerate usernames
        const dummyHash = "$2b$12$dummyhashtopreventtimingattacksXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
        const hashToCompare = user ? user.password : dummyHash;

        const ok = await verifyPassword(password, hashToCompare);

        if (ok && user) {
          const token = createSession(username);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, token }));
        } else {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid credentials" }));
        }
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Server error" }));
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sessions") {
    const token = getAuthToken(req);
    const username = validateToken(token);

    if (!username) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const session = JSON.parse(body || "{}");
        const sessions = loadSessions();
        session.timestamp = Date.now();
        session.user = username; // Associate session with authenticated user
        sessions.push(session);
        saveSessions(sessions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/sessions")) {
    const token = getAuthToken(req);
    const username = validateToken(token);

    if (!username) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    try {
      const sessions = loadSessions();
      // Users can only see their own sessions
      const data = sessions.filter((s) => s.user === username);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server error" }));
    }
    return;
  }
  const filePath = req.url === "/" ? "/index.html" : req.url;
  const fullPath = path.join(root, filePath);

  // Prevent path traversal attacks by ensuring the resolved path is within root
  const resolvedPath = path.resolve(fullPath);
  const resolvedRoot = path.resolve(root);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(fullPath);
    const type = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

// Start WebSocket server for EEG data and browser clients. The Python
// EEG bridge should connect here and send JSON messages that will be
// forwarded to any connected browsers.
const wss = new WebSocket.Server({ server });
const groups = new Map();

function start(portOverride = port, pingInterval = 30000) {
  const srv = server.listen(portOverride, () => {
    console.log(`Hemi-Lab server running at http://localhost:${portOverride}`);
  });
  const interval = setInterval(() => {
    const msg = JSON.stringify({ type: "ping", time: Date.now() });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }, pingInterval);
  srv.on("close", () => clearInterval(interval));
  return srv;
}

function broadcast(sender, data, group) {
  wss.clients.forEach((client) => {
    if (client === sender || client.readyState !== WebSocket.OPEN) return;
    if (group && client.group !== group) return;
    client.send(data);
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "join") {
      ws.group = msg.group;
      if (!groups.has(ws.group)) groups.set(ws.group, new Set());
      groups.get(ws.group).add(ws);
      return;
    }
    broadcast(ws, JSON.stringify(msg), ws.group);
  });
  ws.on("close", () => {
    if (ws.group && groups.has(ws.group)) {
      groups.get(ws.group).delete(ws);
    }
  });
});

if (require.main === module) {
  start();
}

module.exports = { start, server, wss };
