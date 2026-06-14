import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { hashPassword, verifyPassword } from "./password.mjs";
import { normalizeOrderStatus, orderStatusLabel, ORDER_STATUSES } from "./order-status.mjs";
import { paymentMethodLabel } from "./payment-methods.mjs";
import { deliveryMethodLabel } from "./delivery-methods.mjs";

const SESSION_DAYS = 7;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createStore(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  const db = new Database(dbFilePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preorders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      payload_json TEXT NOT NULL,
      total INTEGER,
      status TEXT NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_preorders_created ON preorders(created_at);
  `);

  migratePreordersStatus(db);
  seedAdminIfNeeded(db);

  function migratePreordersStatus(database) {
    const cols = database.prepare(`PRAGMA table_info(preorders)`).all();
    if (!cols.some((c) => c.name === "status")) {
      database.exec(`ALTER TABLE preorders ADD COLUMN status TEXT NOT NULL DEFAULT 'new'`);
    }
  }

  function parsePayload(json) {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function summarizePayload(payload) {
    const lines = Array.isArray(payload?.lines) ? payload.lines : [];
    const itemsCount = lines.reduce((n, l) => n + (Number(l.qty) || 1), 0);
    const preview = lines
      .slice(0, 3)
      .map((l) => {
        const t = l.title || "Товар";
        const sz = l.size ? ` (${l.size})` : "";
        const q = l.qty > 1 ? ` ×${l.qty}` : "";
        return `${t}${sz}${q}`;
      })
      .join(", ");
    return { itemsCount, preview, lines };
  }

  function publicOrder(row, withPayload = false) {
    const payload = parsePayload(row.payload_json);
    const summary = summarizePayload(payload);
    const base = {
      id: row.id,
      total: row.total,
      status: normalizeOrderStatus(row.status),
      statusLabel: orderStatusLabel(row.status),
      createdAt: row.created_at,
      itemsCount: summary.itemsCount,
      preview: summary.preview,
    };
    if (withPayload && payload) {
      base.payload = payload;
      base.lines = summary.lines;
    }
    return base;
  }

  const stmtUserByEmail = db.prepare(
    `SELECT id, email, name, role, password_hash, created_at FROM users WHERE email = ?`
  );
  const stmtInsertUser = db.prepare(
    `INSERT INTO users (email, password_hash, name, role, created_at) VALUES (@email, @password_hash, @name, @role, @created_at)`
  );
  const stmtInsertSession = db.prepare(
    `INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (@user_id, @token, @expires_at, @created_at)`
  );
  const stmtUserByToken = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `);
  const stmtDeleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`);
  const stmtDeleteExpired = db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`);
  const stmtInsertPreorder = db.prepare(
    `INSERT INTO preorders (user_id, payload_json, total, status, created_at) VALUES (@user_id, @payload_json, @total, @status, @created_at)`
  );
  const stmtListUsers = db.prepare(
    `SELECT id, email, name, role, created_at FROM users ORDER BY id ASC`
  );
  const stmtListPreorders = db.prepare(`
    SELECT p.id, p.user_id, p.total, p.status, p.created_at, p.payload_json, u.email AS user_email
    FROM preorders p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.id DESC
    LIMIT 200
  `);
  const stmtListPreordersByUser = db.prepare(`
    SELECT id, total, status, created_at, payload_json
    FROM preorders
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
  `);
  const stmtPreorderByUser = db.prepare(`
    SELECT id, total, status, created_at, payload_json
    FROM preorders
    WHERE id = ? AND user_id = ?
  `);
  const stmtUpdatePreorderStatus = db.prepare(`UPDATE preorders SET status = ? WHERE id = ?`);
  const stmtPreorderNotify = db.prepare(`
    SELECT p.id, p.user_id, p.total, p.status, p.payload_json, u.email AS user_email
    FROM preorders p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `);

  /** Админ: из ADMIN_EMAIL + ADMIN_PASSWORD или дефолт, если в базе ещё нет role=admin. */
  function seedAdminIfNeeded(database) {
    const explicitEmail = String(process.env.ADMIN_EMAIL || "").trim();
    const explicitPassword = String(process.env.ADMIN_PASSWORD || "").trim();

    if (explicitEmail && explicitPassword) {
      const em = normalizeEmail(explicitEmail);
      if (!isValidEmail(em)) {
        console.warn(`[КАПСУЛА] ADMIN_EMAIL некорректен: ${explicitEmail}`);
        return;
      }
      const row = database.prepare(`SELECT id, role FROM users WHERE email = ?`).get(em);
      const ts = nowSec();
      const hash = hashPassword(explicitPassword);
      const name = "Администратор";
      if (row) {
        database
          .prepare(`UPDATE users SET password_hash = ?, name = ?, role = 'admin' WHERE id = ?`)
          .run(hash, name, row.id);
        console.log(`[КАПСУЛА] Администратор обновлён: ${em}`);
      } else {
        database
          .prepare(
            `INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, 'admin', ?)`
          )
          .run(em, hash, name, ts);
        console.log(`[КАПСУЛА] Создан администратор: ${em}`);
      }
      return;
    }

    const hasAdmin = database.prepare(`SELECT 1 AS x FROM users WHERE role = 'admin' LIMIT 1`).get();
    if (hasAdmin) return;
    const email = normalizeEmail("admin@kapsula.local");
    const taken = database.prepare(`SELECT 1 AS x FROM users WHERE email = ? LIMIT 1`).get(email);
    if (taken) return;
    const password = "admin123";
    const ts = nowSec();
    database
      .prepare(
        `INSERT INTO users (email, password_hash, name, role, created_at) VALUES (?, ?, ?, 'admin', ?)`
      )
      .run(email, hashPassword(password), "Администратор", ts);
    console.warn(
      `[КАПСУЛА] Создан администратор по умолчанию: ${email} / admin123. Задайте ADMIN_EMAIL и ADMIN_PASSWORD в Variables.`
    );
  }

  function cleanupSessions() {
    stmtDeleteExpired.run(nowSec());
  }

  function publicUser(row) {
    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
  }

  return {
    register({ email, password, name }) {
      cleanupSessions();
      const em = normalizeEmail(email);
      if (!isValidEmail(em)) return { ok: false, error: "Некорректный e-mail" };
      if (String(password).length < 6) return { ok: false, error: "Пароль не короче 6 символов" };
      const nm = String(name || "").trim().slice(0, 120);
      const exists = stmtUserByEmail.get(em);
      if (exists) return { ok: false, error: "Такой e-mail уже зарегистрирован" };
      const ts = nowSec();
      try {
        const info = stmtInsertUser.run({
          email: em,
          password_hash: hashPassword(password),
          name: nm || "Покупатель",
          role: "user",
          created_at: ts,
        });
        return { ok: true, userId: Number(info.lastInsertRowid) };
      } catch (e) {
        if (e && e.code === "SQLITE_CONSTRAINT_UNIQUE") return { ok: false, error: "Такой e-mail уже зарегистрирован" };
        throw e;
      }
    },

    /** Сессия после успешной регистрации */
    createSessionForUserId(userId) {
      const row = db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(userId);
      if (!row) return null;
      const token = crypto.randomBytes(32).toString("hex");
      const ts = nowSec();
      const exp = ts + SESSION_DAYS * 24 * 60 * 60;
      stmtInsertSession.run({
        user_id: row.id,
        token,
        expires_at: exp,
        created_at: ts,
      });
      return { token, user: publicUser(row) };
    },

    login({ email, password }) {
      cleanupSessions();
      const em = normalizeEmail(email);
      const row = stmtUserByEmail.get(em);
      if (!row || !verifyPassword(password, row.password_hash)) {
        return { ok: false, error: "Неверный e-mail или пароль" };
      }
      const token = crypto.randomBytes(32).toString("hex");
      const ts = nowSec();
      const exp = ts + SESSION_DAYS * 24 * 60 * 60;
      stmtInsertSession.run({
        user_id: row.id,
        token,
        expires_at: exp,
        created_at: ts,
      });
      return { ok: true, token, user: publicUser(row) };
    },

    logout(token) {
      if (!token) return;
      stmtDeleteSession.run(token);
    },

    /**
     * Клиент (role=user): создать или обновить пароль и имя. Админский e-mail не трогаем.
     */
    upsertClient({ email, password, name }) {
      const em = normalizeEmail(email);
      if (!isValidEmail(em)) return { ok: false, error: "Некорректный e-mail" };
      if (String(password).length < 6) return { ok: false, error: "Пароль не короче 6 символов" };
      const nm = (String(name || "").trim().slice(0, 120) || "Покупатель").trim() || "Покупатель";
      const row = stmtUserByEmail.get(em);
      const ts = nowSec();
      if (row) {
        if (row.role === "admin") {
          return { ok: false, error: "Этот e-mail занят администратором" };
        }
        db.prepare(
          `UPDATE users SET password_hash = @password_hash, name = @name, role = 'user' WHERE id = @id`
        ).run({
          password_hash: hashPassword(password),
          name: nm,
          id: row.id,
        });
        return { ok: true, created: false, userId: row.id, email: em };
      }
      try {
        const info = stmtInsertUser.run({
          email: em,
          password_hash: hashPassword(password),
          name: nm,
          role: "user",
          created_at: ts,
        });
        return { ok: true, created: true, userId: Number(info.lastInsertRowid), email: em };
      } catch (e) {
        if (e && e.code === "SQLITE_CONSTRAINT_UNIQUE") return { ok: false, error: "Такой e-mail уже зарегистрирован" };
        throw e;
      }
    },

    /**
     * Новый администратор или выдача role=admin и смена пароля существующему пользователю с этим e-mail.
     */
    upsertAdmin({ email, password, name }) {
      const em = normalizeEmail(email);
      if (!isValidEmail(em)) return { ok: false, error: "Некорректный e-mail" };
      if (String(password).length < 6) return { ok: false, error: "Пароль не короче 6 символов" };
      const nm = (String(name || "").trim().slice(0, 120) || "Администратор").trim() || "Администратор";
      const row = stmtUserByEmail.get(em);
      const ts = nowSec();
      if (row) {
        db.prepare(
          `UPDATE users SET password_hash = @password_hash, name = @name, role = 'admin' WHERE id = @id`
        ).run({
          password_hash: hashPassword(password),
          name: nm,
          id: row.id,
        });
        return { ok: true, created: false, userId: row.id, email: em };
      }
      try {
        const info = stmtInsertUser.run({
          email: em,
          password_hash: hashPassword(password),
          name: nm,
          role: "admin",
          created_at: ts,
        });
        return { ok: true, created: true, userId: Number(info.lastInsertRowid), email: em };
      } catch (e) {
        if (e && e.code === "SQLITE_CONSTRAINT_UNIQUE") return { ok: false, error: "Такой e-mail уже зарегистрирован" };
        throw e;
      }
    },

    getUserByToken(token) {
      if (!token) return null;
      cleanupSessions();
      const row = stmtUserByToken.get(token, nowSec());
      return publicUser(row);
    },

    createPreorder(userId, payload) {
      const ts = nowSec();
      const total = payload && typeof payload.total === "number" ? Math.round(payload.total) : null;
      const json = JSON.stringify(payload);
      const info = stmtInsertPreorder.run({
        user_id: userId || null,
        payload_json: json,
        total,
        status: "new",
        created_at: ts,
      });
      return { id: Number(info.lastInsertRowid), status: "new" };
    },

    listOrdersForUser(userId) {
      if (!userId) return [];
      return stmtListPreordersByUser.all(userId).map((r) => publicOrder(r, false));
    },

    getOrderForUser(userId, orderId) {
      if (!userId || !orderId) return null;
      const row = stmtPreorderByUser.get(orderId, userId);
      if (!row) return null;
      return publicOrder(row, true);
    },

    updatePreorderStatus(orderId, status) {
      const id = Number(orderId);
      if (!Number.isFinite(id) || id < 1) return { ok: false, error: "Некорректный id" };
      const st = normalizeOrderStatus(status);
      const info = stmtUpdatePreorderStatus.run(st, id);
      if (!info.changes) return { ok: false, error: "Заказ не найден" };
      return { ok: true, status: st, statusLabel: orderStatusLabel(st) };
    },

    orderStatuses() {
      return ORDER_STATUSES.map((id) => ({ id, label: orderStatusLabel(id) }));
    },

    listUsersAdmin() {
      return stmtListUsers.all().map((r) => publicUser(r));
    },

    listNotificationEmails() {
      const emails = new Set();
      for (const row of stmtListUsers.all()) {
        const e = String(row.email || "").trim().toLowerCase();
        if (e.includes("@")) emails.add(e);
      }
      for (const row of stmtListPreorders.all()) {
        const payload = parsePayload(row.payload_json);
        const e = String(payload?.customer?.email || "").trim().toLowerCase();
        if (e.includes("@")) emails.add(e);
      }
      return [...emails];
    },

    listPreordersAdmin() {
      return stmtListPreorders.all().map((r) => {
        const payload = parsePayload(r.payload_json);
        const customer = payload?.customer || {};
        return {
          id: r.id,
          userId: r.user_id,
          userEmail: r.user_email,
          customerName: customer.name || "",
          customerPhone: customer.phone || "",
          customerEmail: customer.email || "",
          paymentMethod: customer.paymentMethod || "",
          paymentLabel: paymentMethodLabel(customer.paymentMethod) || "—",
          deliveryMethod: customer.deliveryMethod || "",
          deliveryLabel: deliveryMethodLabel(customer.deliveryMethod) || "—",
          total: r.total,
          status: normalizeOrderStatus(r.status),
          statusLabel: orderStatusLabel(r.status),
          createdAt: r.created_at,
          itemsCount: summarizePayload(payload).itemsCount,
        };
      });
    },

    getPreorderPayload(id) {
      const row = db.prepare(`SELECT payload_json FROM preorders WHERE id = ?`).get(id);
      if (!row) return null;
      try {
        return JSON.parse(row.payload_json);
      } catch {
        return null;
      }
    },

    getPreorderNotifyInfo(id) {
      const orderId = Number(id);
      if (!Number.isFinite(orderId) || orderId < 1) return null;
      const row = stmtPreorderNotify.get(orderId);
      if (!row) return null;
      const payload = parsePayload(row.payload_json);
      const customer = payload?.customer || {};
      return {
        id: row.id,
        status: normalizeOrderStatus(row.status),
        statusLabel: orderStatusLabel(row.status),
        userEmail: row.user_email || null,
        customerEmail: String(customer.email || "").trim() || null,
        customerName: String(customer.name || "").trim() || null,
        payload,
      };
    },
  };
}
