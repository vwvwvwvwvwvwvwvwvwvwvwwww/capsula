/**
 * Статика + JSON API. SQLite через better-sqlite3, только ручной SQL (без ORM).
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createStore } from "./lib/store.mjs";
import { readProducts, writeProducts, validateProducts, getProductsPath, ensureProductsFile } from "./lib/products-persist.mjs";
import { loadEnv } from "./lib/load-env.mjs";
import { sendPreorderEmails, sendOrderStatusEmail, isMailConfigured, verifySmtpConnection, getMailStatus } from "./lib/mail.mjs";
import { bootstrapUniSenderContacts } from "./lib/mail-http.mjs";
import { normalizePaymentMethod } from "./lib/payment-methods.mjs";
import { normalizeDeliveryMethod } from "./lib/delivery-methods.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);
process.env.APP_ROOT = ROOT;
loadEnv(ROOT);
if (!process.env.MAIL_OUTBOX_DIR && String(process.env.DB_PATH || "").startsWith("/data")) {
  process.env.MAIL_OUTBOX_DIR = "/data/mail-outbox";
}
const PORT = Number(process.env.PORT, 10) || 3333;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "app.db");

const store = createStore(DB_PATH);
ensureProductsFile(ROOT);

void bootstrapUniSenderContacts(store.listNotificationEmails()).then((boot) => {
  if (boot.skipped) return;
  const n = boot.subscribed?.length || 0;
  if (n) console.log(`[mail] UniSender: в список добавлено адресов: ${n}`);
  if (!boot.sender?.confirmed && boot.sender?.hint) {
    console.warn(`[mail] UniSender: ${boot.sender.hint}`);
  }
  if (boot.failed?.length) {
    console.warn(`[mail] UniSender: не добавлены: ${boot.failed.map((f) => f.email).join(", ")}`);
  }
}).catch((err) => {
  console.warn("[mail] UniSender bootstrap:", err.message || err);
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function safePath(urlPathname) {
  const rel = urlPathname === "/" || urlPathname === "" ? "index.html" : urlPathname.replace(/^\//, "");
  const resolved = path.resolve(ROOT, rel);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    return null;
  }
  return resolved;
}

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getSid(req) {
  return parseCookies(req.headers.cookie).sid || "";
}

function cookieHeader(token, maxAgeSec) {
  const parts = [`sid=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  return parts.join("; ");
}

function clearCookieHeader() {
  return "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/** Локальные origin для превью / другого порта (куки всё равно только при том же host:port). */
function applyApiCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== "string") return;
  const extra = (process.env.CORS_ORIGIN || "").trim();
  const allow =
    /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin) ||
    (extra && origin === extra);
  if (!allow) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireUser(req) {
  const user = store.getUserByToken(getSid(req));
  return user;
}

async function handleApi(req, res) {
  applyApiCors(req, res);
  const method = req.method || "GET";
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let p = url.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  p = p.toLowerCase();

  try {
    if (method === "GET" && p === "/api/ping") {
      return sendJson(res, 200, { ok: true, service: "kapsula" });
    }

    if (method === "GET" && p === "/api/products") {
      try {
        const products = readProducts(ROOT);
        return sendJson(res, 200, { products });
      } catch (e) {
        console.error(e);
        return sendJson(res, 500, { error: "Не удалось прочитать каталог" });
      }
    }

    if (method === "GET" && p === "/api/me") {
      const user = requireUser(req);
      return sendJson(res, 200, { user });
    }

    if (method === "GET" && p === "/api/my/orders") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      const orderId = Number(url.searchParams.get("id"));
      if (Number.isFinite(orderId) && orderId > 0) {
        const order = store.getOrderForUser(user.id, orderId);
        if (!order) return sendJson(res, 404, { error: "Заказ не найден" });
        return sendJson(res, 200, { order });
      }
      return sendJson(res, 200, { orders: store.listOrdersForUser(user.id) });
    }

    if (method === "GET" && p === "/api/order-statuses") {
      return sendJson(res, 200, { statuses: store.orderStatuses() });
    }

    if (method === "POST" && p === "/api/register") {
      const body = await readJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Некорректный JSON" });
      const r = store.register({
        email: body.email,
        password: body.password,
        name: body.name,
      });
      if (!r.ok) return sendJson(res, 400, { error: r.error });
      const session = store.createSessionForUserId(r.userId);
      if (!session) return sendJson(res, 500, { error: "Не удалось создать сессию" });
      res.setHeader("Set-Cookie", cookieHeader(session.token, 60 * 60 * 24 * 7));
      return sendJson(res, 201, { user: session.user });
    }

    if (method === "POST" && p === "/api/login") {
      const body = await readJsonBody(req);
      if (body === null) return sendJson(res, 400, { error: "Некорректный JSON" });
      const r = store.login({ email: body.email, password: body.password });
      if (!r.ok) return sendJson(res, 401, { error: r.error });
      res.setHeader("Set-Cookie", cookieHeader(r.token, 60 * 60 * 24 * 7));
      return sendJson(res, 200, { user: r.user });
    }

    if (method === "POST" && p === "/api/logout") {
      store.logout(getSid(req));
      res.setHeader("Set-Cookie", clearCookieHeader());
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && p === "/api/admin/users") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      return sendJson(res, 200, { users: store.listUsersAdmin() });
    }

    if (method === "GET" && p === "/api/admin/mail-status") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      const status = await getMailStatus();
      return sendJson(res, 200, status);
    }

    if (method === "POST" && p === "/api/admin/test-mail") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      const status = await getMailStatus();
      if (!status.configured) {
        return sendJson(res, 400, { ok: false, error: status.error || "SMTP не настроен" });
      }
      const to = status.mailTo || user.email;
      const mail = await sendPreorderEmails({
        orderId: 0,
        payload: {
          customer: { name: "Тест админки", phone: "+79990000000", email: to },
          lines: [{ title: "Тестовый товар", size: "M", qty: 1, unitPrice: 1000 }],
          total: 1000,
        },
        accountEmail: user.email,
      });
      return sendJson(res, mail.ok ? 200 : 502, mail);
    }

    if (method === "GET" && p === "/api/admin/preorders") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      return sendJson(res, 200, { preorders: store.listPreordersAdmin() });
    }

    if (method === "PATCH" && p === "/api/admin/preorder/status") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      const body = await readJsonBody(req);
      if (body === null || typeof body !== "object") return sendJson(res, 400, { error: "Некорректный JSON" });
      const before = store.getPreorderNotifyInfo(body.id);
      if (!before) return sendJson(res, 404, { error: "Заказ не найден" });
      const r = store.updatePreorderStatus(body.id, body.status);
      if (!r.ok) return sendJson(res, 400, { error: r.error });

      let mail = null;
      if (before.status !== r.status) {
        try {
          mail = await sendOrderStatusEmail({
            orderId: before.id,
            status: r.status,
            statusLabel: r.statusLabel,
            payload: before.payload,
            accountEmail: before.userEmail || before.customerEmail,
          });
        } catch (mailErr) {
          console.error("[КАПСУЛА] Ошибка письма о статусе:", mailErr);
          mail = { ok: false, error: mailErr.message || "Ошибка почты" };
        }
      }

      return sendJson(res, 200, { ...r, mail });
    }

    if (method === "GET" && p === "/api/admin/preorder") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      const id = Number(url.searchParams.get("id"));
      if (!Number.isFinite(id) || id < 1) return sendJson(res, 400, { error: "Некорректный id" });
      const payload = store.getPreorderPayload(id);
      if (!payload) return sendJson(res, 404, { error: "Не найдено" });
      return sendJson(res, 200, { id, payload });
    }

    if (method === "PUT" && p === "/api/admin/products") {
      const user = requireUser(req);
      if (!user) return sendJson(res, 401, { error: "Требуется вход" });
      if (user.role !== "admin") return sendJson(res, 403, { error: "Нужны права администратора" });
      const body = await readJsonBody(req);
      if (body === null || typeof body !== "object") return sendJson(res, 400, { error: "Некорректный JSON" });
      const products = body.products;
      const v = validateProducts(products);
      if (!v.ok) return sendJson(res, 400, { error: v.error });
      const normalized = products.map((p) => ({
        id: String(p.id).trim(),
        gender: p.gender,
        title: String(p.title).trim(),
        category: String(p.category).trim(),
        price: Math.round(Number(p.price)),
        image: String(p.image).trim(),
        description: typeof p.description === "string" ? p.description.trim() : "",
      }));
      try {
        writeProducts(ROOT, normalized);
        return sendJson(res, 200, { ok: true, products: normalized });
      } catch (e) {
        console.error(e);
        return sendJson(res, 500, { error: "Не удалось записать каталог" });
      }
    }

    if (method === "POST" && p === "/api/preorders") {
      const body = await readJsonBody(req);
      if (body === null || typeof body !== "object") return sendJson(res, 400, { error: "Некорректный JSON" });
      const paymentMethod = normalizePaymentMethod(body?.customer?.paymentMethod);
      if (!paymentMethod) {
        return sendJson(res, 400, { error: "Выберите способ оплаты" });
      }
      const deliveryMethod = normalizeDeliveryMethod(body?.customer?.deliveryMethod);
      if (!deliveryMethod) {
        return sendJson(res, 400, { error: "Выберите способ доставки" });
      }
      if (body.customer && typeof body.customer === "object") {
        body.customer.paymentMethod = paymentMethod;
        body.customer.deliveryMethod = deliveryMethod;
      }
      const u = requireUser(req);
      const { id } = store.createPreorder(u ? u.id : null, body);
      let mail = { ok: false, skipped: true };
      try {
        mail = await sendPreorderEmails({
          orderId: id,
          payload: body,
          accountEmail: u?.email || null,
        });
      } catch (mailErr) {
        console.error("[КАПСУЛА] Ошибка отправки e-mail:", mailErr);
        mail = { ok: false, error: mailErr.message || "Ошибка почты" };
      }
      return sendJson(res, 201, { id, ok: true, mail });
    }

    return sendJson(res, 404, { error: "Метод не найден" });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: "Внутренняя ошибка сервера" });
  }
}

const gzipAsync = promisify(zlib.gzip);

const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg"]);

function cacheControlFor(ext) {
  if (ext === ".html") return "no-cache";
  if ([".js", ".mjs", ".css", ".json"].includes(ext)) return "no-cache";
  if ([".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"].includes(ext)) return "public, max-age=86400";
  return "public, max-age=300";
}

async function respondStatic(req, res, data, contentType, ext) {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": cacheControlFor(ext),
  };
  const accept = String(req.headers["accept-encoding"] || "");
  if (COMPRESSIBLE.has(ext) && data.length > 512 && accept.includes("gzip")) {
    const gz = await gzipAsync(data);
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    res.end(gz);
    return;
  }
  res.writeHead(200, headers);
  res.end(data);
}

async function handleStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const filePath = safePath(decodeURIComponent(url.pathname));
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, "index.html");
      const data = await fs.readFile(indexPath);
      await respondStatic(req, res, data, MIME[".html"], ".html");
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    await respondStatic(req, res, data, MIME[ext] || "application/octet-stream", ext);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not found");
    } else {
      res.writeHead(500);
      res.end("Server error");
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (/^\/api(\/|$)/i.test(url.pathname)) {
    handleApi(req, res);
  } else {
    handleStatic(req, res);
  }
});

const PORT_PREFERRED = PORT;

function bindServer(p) {
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && p < PORT_PREFERRED + 30) {
      console.warn(`[КАПСУЛА] Порт ${p} занят (запущен другой процесс). Пробуем ${p + 1}…`);
      setImmediate(() => bindServer(p + 1));
    } else {
      console.error(err);
      console.error(
        `[КАПСУЛА] Не удалось занять порт. Освободите ${PORT_PREFERRED} (например: lsof -i :${PORT_PREFERRED}  → kill PID) или задайте PORT=3340 npm start`
      );
      process.exit(1);
    }
  });
  server.listen(p, () => {
    server.removeAllListeners("error");
    const addr = server.address();
    const actual = typeof addr === "object" && addr && addr.port != null ? addr.port : p;
    if (actual !== PORT_PREFERRED) {
      console.warn(`[КАПСУЛА] Используется порт ${actual} вместо ${PORT_PREFERRED}. Откройте в браузере новый URL из строк ниже.`);
    }
    console.log(
      `[КАПСУЛА] Слушаем порт ${actual}. На Railway в Networking → Generate Domain укажите тот же номер (или не задавайте PORT вручную — подставится автоматически).`
    );
    console.log(`Капсула: http://127.0.0.1:${actual}/`);
    console.log(`Капсула: http://localhost:${actual}/`);
    console.log(`Проверка API: http://127.0.0.1:${actual}/api/ping  → JSON с "service":"kapsula"`);
    console.log(`БД: ${DB_PATH}`);
    console.log(`Каталог (товары): ${getProductsPath(ROOT)}`);
    console.log(
      "Вход: откройте страницу по адресу выше (не смешивайте 127.0.0.1 и localhost — куки разные)."
    );
    if (!isMailConfigured()) {
      console.warn(
        "Почта: SMTP не настроен — письма сохраняются в data/mail-outbox. Задайте SMTP_HOST, SMTP_USER, SMTP_PASS в .env или Railway Variables."
      );
    } else {
      verifySmtpConnection()
        .then((r) => {
          if (r.ok) {
            console.log("Почта: SMTP подключён — уведомления о предзаказах включены.");
          } else {
            console.warn(`Почта: SMTP настроен, но подключение не удалось: ${r.error}`);
            console.warn("Письма будут сохраняться в data/mail-outbox до исправления SMTP_PASS.");
          }
        })
        .catch((err) => {
          console.warn("Почта: не удалось проверить SMTP:", err?.message || err);
        });
    }
  });
}

bindServer(PORT_PREFERRED);
