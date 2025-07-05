const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const port = process.env.PORT || 3000;
const root = path.join(__dirname);

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ summary: "Analysis coming soon" }));
    });
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

function broadcast(sender, data) {
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    broadcast(ws, data);
  });
});

if (require.main === module) {
  start();
}

module.exports = { start, server, wss };
