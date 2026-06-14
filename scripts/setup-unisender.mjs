/**
 * Настройка UniSender: создать список, добавить контакты, запросить подтверждение отправителя.
 * Запуск: npm run setup-unisender
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/load-env.mjs";
import {
  bootstrapUniSenderContacts,
  createUniSenderList,
  requestUniSenderSenderConfirm,
  subscribeUniSenderContact,
} from "../lib/mail-http.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.APP_ROOT = ROOT;
loadEnv(ROOT);

const apiKey = String(process.env.UNISENDER_API_KEY || "").trim();
if (!apiKey) {
  console.error("Задайте UNISENDER_API_KEY в .env или Railway Variables.");
  process.exit(1);
}

let listId = String(process.env.UNISENDER_LIST_ID || "").trim();
if (!listId) {
  console.log("UNISENDER_LIST_ID не задан — создаём список…");
  listId = String((await createUniSenderList("Капсула — уведомления")) || "");
  if (!listId) {
    console.error("Не удалось создать список. Создайте вручную на unisender.com → Контакты → Списки.");
    process.exit(1);
  }
  console.log(`✓ Список создан. Добавьте в Railway Variables:\n  UNISENDER_LIST_ID=${listId}`);
  process.env.UNISENDER_LIST_ID = listId;
}

const seed = String(process.env.UNISENDER_SEED_EMAILS || "")
  .split(/[,;\s]+/)
  .map((e) => e.trim())
  .filter((e) => e.includes("@"));

function mailFromEmail() {
  const raw = String(process.env.MAIL_FROM || "").trim();
  const m = raw.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  if (raw.includes("@")) return raw;
  return String(process.env.SMTP_USER || "").trim();
}

const extra = [
  process.env.MAIL_TO,
  process.env.ADMIN_EMAIL,
  process.env.SMTP_USER,
  mailFromEmail(),
  ...seed,
].filter(Boolean);

console.log("\nДобавляем контакты в список", listId, "…");
const boot = await bootstrapUniSenderContacts(extra);
console.log("Подписано:", boot.subscribed?.join(", ") || "(ничего)");
if (boot.failed?.length) {
  console.warn("Ошибки:", boot.failed);
}

const fromEmail = mailFromEmail() || process.env.MAIL_TO;

if (fromEmail && !boot.sender?.confirmed) {
  console.log(`\nОтправитель ${fromEmail} не подтверждён — запрашиваем письмо подтверждения…`);
  const req = await requestUniSenderSenderConfirm(fromEmail);
  if (req.validationSent) {
    console.log(`✓ Письмо отправлено на ${fromEmail}. Откройте ссылку в почте.`);
  } else {
    console.warn("Не удалось запросить подтверждение:", req.error || "неизвестно");
    console.log("Вручную: unisender.com → Сообщения → «От кого» → запрос подтверждения.");
  }
} else if (boot.sender?.confirmed) {
  console.log(`\n✓ Отправитель ${fromEmail} уже подтверждён в UniSender.`);
}

if (process.argv.includes("--test")) {
  const testTo = process.env.MAIL_TO || fromEmail;
  if (testTo) {
    await subscribeUniSenderContact(testTo, "Тест");
    console.log(`\nТестовый контакт добавлен: ${testTo}`);
  }
}

console.log("\nГотово. Variables для Railway:");
console.log(`  UNISENDER_API_KEY=${apiKey.slice(0, 8)}…`);
console.log(`  UNISENDER_LIST_ID=${listId}`);
console.log(`  MAIL_FROM=Капсула <${fromEmail || "kapsula.shop@bk.ru"}>`);
console.log(`  MAIL_TO=${process.env.MAIL_TO || fromEmail || "kapsula.shop@bk.ru"}`);
