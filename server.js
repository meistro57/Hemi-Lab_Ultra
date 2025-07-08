const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const port = process.env.PORT || 3000;
const root = path.join(__dirname);
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, "users.json");
const SESSIONS_FILE =
  process.env.SESSIONS_FILE || path.join(__dirname, "sessions.json");

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

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
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
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/register") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { username, password } = JSON.parse(body || "{}");
      if (!username || !password) {
        res.writeHead(400);
        res.end("invalid");
        return;
      }
      const users = loadUsers();
      if (users[username]) {
        res.writeHead(409);
        res.end("exists");
        return;
      }
      users[username] = { password: hashPassword(password) };
      saveUsers(users);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/login") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { username, password } = JSON.parse(body || "{}");
      const users = loadUsers();
      const user = users[username];
      const ok = user && user.password === hashPassword(password);
      res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: !!ok }));
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/sessions") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const session = JSON.parse(body || "{}");
      const sessions = loadSessions();
      session.timestamp = Date.now();
      sessions.push(session);
      saveSessions(sessions);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/sessions")) {
    const sessions = loadSessions();
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const user = urlObj.searchParams.get("user");
    const data = user ? sessions.filter((s) => s.user === user) : sessions;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
    return;
  }
  const filePath = req.url === "/" ? "/index.html" : req.url;
  const fullPath = path.join(root, filePath);

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
