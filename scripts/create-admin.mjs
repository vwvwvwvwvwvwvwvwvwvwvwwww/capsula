import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../lib/store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DB_PATH = process.env.DB_PATH || path.join(ROOT, "data", "app.db");

const email = process.argv[2];
const password = process.argv[3];
const name = process.argv.slice(4).join(" ").trim() || undefined;

if (!email || !password) {
  console.error("Использование: npm run create-admin -- <email> <пароль> [имя]");
  console.error("Пример:     npm run create-admin -- boss@example.com MySecret1 Админ");
  process.exit(1);
}

const store = createStore(DB_PATH);
const r = store.upsertAdmin({ email, password, name });
if (!r.ok) {
  console.error(r.error || "Ошибка");
  process.exit(1);
}
console.log(
  r.created
    ? `[КАПСУЛА] Создан администратор id=${r.userId} · ${r.email}`
    : `[КАПСУЛА] Пользователь повышен до admin и обновлён пароль · id=${r.userId} · ${r.email}`,
);
