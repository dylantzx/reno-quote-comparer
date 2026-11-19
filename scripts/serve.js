// Tiny static file server for local development (GitHub Pages serves the
// same public/ folder in production). Usage: npm start
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const port = Number(process.env.PORT) || 3000;

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, url.endsWith("/") ? url + "index.html" : url);
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(port, () => console.log(`Reno Quote Comparer at http://localhost:${port}`));
