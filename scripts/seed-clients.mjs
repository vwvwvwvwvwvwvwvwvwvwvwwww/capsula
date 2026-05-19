/**
 * Тестовые аккаунты покупателей (role=user).
 * Запуск: npm run seed-clients
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../lib/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "app.db");

/** Пароль у всех клиентов по умолчанию — client123 */
const DEFAULT_PASSWORD = process.env.CLIENT_PASSWORD || "client123";

const CLIENTS = [
  { email: "anna@kapsula.local", name: "Анна" },
  { email: "ivan@kapsula.local", name: "Иван" },
  { email: "maria@kapsula.local", name: "Мария" },
  { email: "dmitry@kapsula.local", name: "Дмитрий" },
  { email: "elena@kapsula.local", name: "Елена" },
  { email: "oleg@kapsula.local", name: "Олег" },
];

const store = createStore(DB_PATH);
let created = 0;
let updated = 0;

for (const c of CLIENTS) {
  const r = store.upsertClient({
    email: c.email,
    password: DEFAULT_PASSWORD,
    name: c.name,
  });
  if (!r.ok) {
    console.error(`✗ ${c.email}: ${r.error}`);
    continue;
  }
  if (r.created) {
    created++;
    console.log(`+ клиент ${c.email} · ${c.name}`);
  } else {
    updated++;
    console.log(`↻ обновлён ${c.email} · ${c.name}`);
  }
}

console.log(`\n[КАПСУЛА] Клиентов: создано ${created}, обновлено ${updated}. Пароль: ${DEFAULT_PASSWORD}`);
