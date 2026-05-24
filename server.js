const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "docs");
const dataDir = path.join(publicDir, "data");
const uploadDir = path.join(publicDir, "uploads");
const itemsPath = path.join(dataDir, "items.json");

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const sessions = new Set();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mind": "application/octet-stream",
  ".ico": "image/x-icon",
};

function ensureStorage() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(itemsPath)) {
    fs.writeFileSync(itemsPath, "[]\n");
  }
}

function readItems() {
  ensureStorage();
  return JSON.parse(fs.readFileSync(itemsPath, "utf8"));
}

function writeItems(items) {
  ensureStorage();
  fs.writeFileSync(itemsPath, `${JSON.stringify(items, null, 2)}\n`);
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
  );
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return cookies.ar_admin_session && sessions.has(cookies.ar_admin_session);
}

function readBody(req, maxBytes = 35 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("資料太大，請壓縮圖片或影片後再上傳。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeExt(fileName, fallback) {
  const ext = path.extname(fileName || "").toLowerCase();
  if (/^\.[a-z0-9]+$/.test(ext)) return ext;
  return fallback;
}

function writeBase64File(prefix, originalName, base64, fallbackExt) {
  const ext = safeExt(originalName, fallbackExt);
  const id = crypto.randomUUID();
  const fileName = `${prefix}-${id}${ext}`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
  return `/uploads/${fileName}`;
}

function deleteUploadedFile(urlPath) {
  if (!urlPath || !urlPath.startsWith("/uploads/")) return;
  const filePath = path.join(publicDir, urlPath);
  if (!filePath.startsWith(uploadDir)) return;
  fs.rmSync(filePath, { force: true });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, cleanPath));

  if (!filePath.startsWith(publicDir)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/items") {
      const items = readItems().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      const publicItems = items.filter((item) => item.published);
      sendJson(res, 200, publicItems);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/items") {
      if (!isAuthed(req)) return sendJson(res, 401, { error: "請先登入後台。" });
      sendJson(res, 200, readItems());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/login") {
      const body = JSON.parse(await readBody(req, 1024 * 1024));
      if (body.password !== adminPassword) {
        return sendJson(res, 401, { error: "密碼不正確。" });
      }
      const sessionId = crypto.randomUUID();
      sessions.add(sessionId);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `ar_admin_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/`,
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/logout") {
      const cookies = parseCookies(req);
      if (cookies.ar_admin_session) sessions.delete(cookies.ar_admin_session);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "ar_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!isAuthed(req)) {
      sendJson(res, 401, { error: "請先登入後台。" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/items") {
      const body = JSON.parse(await readBody(req));
      const items = readItems();

      if (!body.title || !body.image?.base64 || !body.video?.base64 || !body.target?.base64) {
        return sendJson(res, 400, { error: "請上傳圖片、影片，並產生或提供辨識檔。" });
      }

      const item = {
        id: crypto.randomUUID(),
        title: String(body.title).trim(),
        published: Boolean(body.published),
        sortOrder: Number(body.sortOrder || items.length + 1),
        imageUrl: writeBase64File("image", body.image.name, body.image.base64, ".jpg"),
        videoUrl: writeBase64File("video", body.video.name, body.video.base64, ".mp4"),
        targetUrl: writeBase64File("target", body.target.name || "target.mind", body.target.base64, ".mind"),
        imageWidth: Number(body.imageWidth || 1),
        imageHeight: Number(body.imageHeight || 1),
        videoWidth: Number(body.videoWidth || 1),
        videoHeight: Number(body.videoHeight || 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      items.push(item);
      writeItems(items);
      sendJson(res, 201, item);
      return;
    }

    const itemMatch = url.pathname.match(/^\/api\/admin\/items\/([^/]+)$/);
    if (itemMatch && req.method === "PATCH") {
      const body = JSON.parse(await readBody(req, 1024 * 1024));
      const items = readItems();
      const item = items.find((entry) => entry.id === itemMatch[1]);
      if (!item) return sendJson(res, 404, { error: "找不到項目。" });

      if (typeof body.title === "string") item.title = body.title.trim();
      if (typeof body.published === "boolean") item.published = body.published;
      if (body.sortOrder !== undefined) item.sortOrder = Number(body.sortOrder || 0);
      item.updatedAt = new Date().toISOString();

      writeItems(items);
      sendJson(res, 200, item);
      return;
    }

    if (itemMatch && req.method === "DELETE") {
      const items = readItems();
      const index = items.findIndex((entry) => entry.id === itemMatch[1]);
      if (index === -1) return sendJson(res, 404, { error: "找不到項目。" });

      const [item] = items.splice(index, 1);
      deleteUploadedFile(item.imageUrl);
      deleteUploadedFile(item.videoUrl);
      deleteUploadedFile(item.targetUrl);
      writeItems(items);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "找不到 API。" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "伺服器發生錯誤。" });
  }
}

ensureStorage();

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`AR web app is running at http://${host}:${port}`);
  console.log(`Admin password: ${adminPassword}`);
});
