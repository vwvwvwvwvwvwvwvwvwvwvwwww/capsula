/**
 * Проверка SMTP. Запуск: npm run test-mail
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "../lib/load-env.mjs";
import { describeMailSetup } from "../lib/smtp-providers.mjs";
import { isMailConfigured, verifySmtpConnection, sendPreorderEmails } from "../lib/mail.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.APP_ROOT = ROOT;
loadEnv(ROOT);

const setup = describeMailSetup();

console.log("[КАПСУЛА] Проверка почты…");
console.log("SMTP_USER:", process.env.SMTP_USER || "(не задан)");
console.log("SMTP_HOST:", setup.host || process.env.SMTP_HOST || "(авто по домену)");
console.log("Провайдер:", setup.providerLabel || "(не определён)");
console.log("MAIL_TO:", process.env.MAIL_TO || process.env.SMTP_USER || "(не задан)");
console.log("configured:", isMailConfigured());

const verify = await verifySmtpConnection();
if (!verify.ok) {
  console.error("\n✗ SMTP:", verify.skipped ? verify.error : verify.error);
  if (setup.authHint) console.error("\nПодсказка:", setup.authHint);
  process.exit(verify.skipped ? 0 : 1);
}

console.log("✓ Подключение к SMTP успешно");

const to = process.env.MAIL_TO || process.env.SMTP_USER;
const result = await sendPreorderEmails({
  orderId: 0,
  payload: {
    customer: { name: "Тест", phone: "+79990000000", email: to },
    lines: [{ title: "Тестовый товар", size: "M", qty: 1, unitPrice: 1000 }],
    total: 1000,
  },
  accountEmail: null,
});

console.log("\nРезультат отправки:", JSON.stringify(result, null, 2));
if (result.ok) {
  console.log(`\n✓ Письмо отправлено. Проверьте входящие и папку «Спам»: ${to}`);
} else {
  console.error("\n✗ Отправка не удалась.");
  if (result.outbox?.length) {
    console.error("Письмо сохранено в data/mail-outbox — проверьте файлы там.");
  }
  process.exit(1);
}
