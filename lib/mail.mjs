import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const fmtMoney = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function env(name) {
  return String(process.env[name] || "").trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isYandexHost(host) {
  return /(^|\.)yandex\.(ru|com|net)$/i.test(host);
}

function mailFrom() {
  const user = env("SMTP_USER");
  const custom = env("MAIL_FROM") || env("SMTP_FROM");
  if (custom) return custom;
  return user ? `Kapsula <${user}>` : "Kapsula <no-reply@localhost>";
}

function shopEmail() {
  return env("MAIL_TO") || env("ORDER_NOTIFY_EMAIL") || env("SMTP_USER");
}

function outboxDir() {
  if (env("MAIL_OUTBOX_DIR")) return path.resolve(env("MAIL_OUTBOX_DIR"));
  const root = env("APP_ROOT") || process.cwd();
  return path.join(root, "data", "mail-outbox");
}

export function isMailConfigured() {
  return Boolean(env("SMTP_HOST") && env("SMTP_USER") && (process.env.SMTP_PASS || process.env.SMTP_PASSWORD));
}

function smtpPassword() {
  return process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
}

function createTransportOptions(host, port, secure) {
  const opts = {
    host,
    port,
    secure,
    auth: {
      user: env("SMTP_USER"),
      pass: smtpPassword(),
    },
  };
  if (isYandexHost(host)) {
    opts.tls = { servername: "smtp.yandex.ru", minVersion: "TLSv1.2" };
    if (!secure) opts.requireTLS = true;
  }
  return opts;
}

function createTransporter() {
  const host = env("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || (isYandexHost(host) ? 465 : 587));
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return nodemailer.createTransport(createTransportOptions(host, port, secure));
}

/** Для Яндекса пробуем 465 (SSL) и 587 (STARTTLS). */
function createTransporterCandidates() {
  const host = env("SMTP_HOST");
  if (!isYandexHost(host) || env("SMTP_PORT")) return [createTransporter()];
  return [
    nodemailer.createTransport(createTransportOptions(host, 465, true)),
    nodemailer.createTransport(createTransportOptions(host, 587, false)),
  ];
}

function formatSmtpError(err) {
  const msg = String(err?.message || err || "Ошибка почты");
  if (err?.code === "EAUTH" || /authentication failed/i.test(msg)) {
    if (isYandexHost(env("SMTP_HOST"))) {
      return (
        "Ошибка входа в Яндекс SMTP. Создайте пароль приложения: " +
        "id.yandex.ru → Безопасность → Пароли приложений → Почта. " +
        "Включите доступ для «Почтовых программ» в настройках Яндекс.Почты."
      );
    }
    return "Ошибка SMTP-авторизации. Проверьте SMTP_USER и SMTP_PASS (пароль приложения, не обычный пароль).";
  }
  return msg;
}

function saveToOutbox({ orderId, role, to, subject, text, html, error }) {
  const dir = outboxDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `order-${orderId}-${role}-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        orderId,
        role,
        to,
        subject,
        text,
        html,
        error: error || null,
        savedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return file;
}

function buildOrderMessage(orderId, payload) {
  const customer = payload?.customer || {};
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  const total = payload?.total != null ? fmtMoney.format(Math.round(Number(payload.total))) : "—";
  const customerLine = [customer.name, customer.phone, customer.email, customer.city]
    .filter(Boolean)
    .join(" · ");

  const textLines = lines.map((line) => {
    const qty = Number(line.qty) || 1;
    const price = Number(line.unitPrice) || 0;
    const size = line.size ? `, размер ${line.size}` : "";
    return `- ${line.title || "Товар"}${size} x ${qty}: ${fmtMoney.format(price * qty)}`;
  });

  const text = [
    `Предзаказ №${orderId} — Капсула`,
    "",
    customerLine ? `Клиент: ${customerLine}` : "",
    customer.comment ? `Комментарий: ${customer.comment}` : "",
    "",
    "Состав:",
    ...textLines,
    "",
    `Итого: ${total}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const rows = lines
    .map((line) => {
      const qty = Number(line.qty) || 1;
      const price = Number(line.unitPrice) || 0;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(line.title || "—")}</td>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(line.size || "—")}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center">${qty}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right">${escapeHtml(fmtMoney.format(price * qty))}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
    <h2 style="margin:0 0 12px">Предзаказ №${orderId}</h2>
    ${customerLine ? `<p><strong>Клиент:</strong> ${escapeHtml(customerLine)}</p>` : ""}
    ${customer.comment ? `<p><strong>Комментарий:</strong> ${escapeHtml(customer.comment)}</p>` : ""}
    <table style="border-collapse:collapse;width:100%;max-width:620px;margin:16px 0">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px;border:1px solid #ddd;text-align:left">Товар</th>
        <th style="padding:8px;border:1px solid #ddd">Размер</th>
        <th style="padding:8px;border:1px solid #ddd">Кол-во</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right">Сумма</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:18px"><strong>Итого: ${escapeHtml(total)}</strong></p>
  </body></html>`;

  return {
    text,
    html,
    customerEmail: String(customer.email || "").trim(),
  };
}

async function sendOneMail(transporter, mail) {
  const info = await transporter.sendMail(mail);
  return { messageId: info.messageId || null };
}

async function deliverMail({ orderId, role, mail }) {
  if (!isMailConfigured()) {
    const file = saveToOutbox({
      orderId,
      role,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      error: "SMTP не настроен",
    });
    return { role, to: mail.to, outbox: file, skipped: true };
  }

  const candidates = createTransporterCandidates();
  let lastErr = null;
  for (const transporter of candidates) {
    try {
      const info = await sendOneMail(transporter, mail);
      return { role, to: mail.to, messageId: info.messageId };
    } catch (err) {
      lastErr = err;
    }
  }

  const file = saveToOutbox({
    orderId,
    role,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    error: formatSmtpError(lastErr),
  });
  return { role, to: mail.to, outbox: file, error: formatSmtpError(lastErr) };
}

export async function verifySmtpConnection() {
  if (!isMailConfigured()) {
    return { ok: false, skipped: true, error: "SMTP не настроен (нужны SMTP_HOST, SMTP_USER, SMTP_PASS)" };
  }
  const candidates = createTransporterCandidates();
  let lastErr = null;
  for (const transporter of candidates) {
    try {
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, error: formatSmtpError(lastErr) };
}

export async function getMailStatus() {
  const host = env("SMTP_HOST");
  const configured = isMailConfigured();
  if (!configured) {
    return {
      configured: false,
      error: "SMTP не настроен. В Railway Variables задайте SMTP_HOST, SMTP_USER, SMTP_PASS.",
    };
  }
  const verify = await verifySmtpConnection();
  return {
    configured: true,
    host,
    port: Number(process.env.SMTP_PORT || (isYandexHost(host) ? 465 : 587)),
    user: env("SMTP_USER"),
    mailTo: shopEmail(),
    verified: verify.ok,
    error: verify.error || null,
  };
}

export async function sendPreorderEmails({ orderId, payload, accountEmail }) {
  const { text, html, customerEmail } = buildOrderMessage(orderId, payload);
  const from = mailFrom();
  const customerTo = customerEmail || String(accountEmail || "").trim();
  const shopTo = shopEmail();
  const deliveries = [];

  if (shopTo) {
    deliveries.push(
      deliverMail({
        orderId,
        role: "shop",
        mail: {
          from,
          to: shopTo,
          subject: `Капсула — новый предзаказ №${orderId}`,
          text: `Новая заявка с сайта.\n\n${text}`,
          html: `<p><strong>Новая заявка с сайта.</strong></p>${html}`,
        },
      }),
    );
  }

  if (customerTo && customerTo.toLowerCase() !== String(shopTo || "").toLowerCase()) {
    deliveries.push(
      deliverMail({
        orderId,
        role: "customer",
        mail: {
          from,
          to: customerTo,
          subject: `Капсула — ваш предзаказ №${orderId}`,
          text,
          html,
        },
      }),
    );
  }

  const results = await Promise.all(deliveries);
  const sent = results.filter((r) => r.messageId);
  const outbox = results.filter((r) => r.outbox);
  const errors = results.filter((r) => r.error).map((r) => r.error);

  if (sent.length) {
    return { ok: true, sent, outbox: outbox.length ? outbox : undefined, warnings: errors.length ? errors : undefined };
  }

  if (!isMailConfigured()) {
    return { ok: false, skipped: true, outbox: outbox.length ? outbox : undefined };
  }

  return {
    ok: false,
    error: errors[0] || "Письмо не отправлено",
    outbox: outbox.length ? outbox : undefined,
  };
}
