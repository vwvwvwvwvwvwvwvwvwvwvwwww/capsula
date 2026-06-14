import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  buildSmtpCandidates,
  describeMailSetup,
  formatAuthHint,
  resolveSmtpProvider,
} from "./smtp-providers.mjs";
import { orderStatusLabel, orderStatusNotifyText, shouldNotifyStatusChange } from "./order-status.mjs";
import { paymentMethodLabel } from "./payment-methods.mjs";
import { deliveryMethodLabel } from "./delivery-methods.mjs";
import {
  describeHttpMail,
  isHttpMailConfigured,
  mailTransportDiagnostics,
  sendHttpMail,
  smtpMailForced,
  verifyHttpMail,
} from "./mail-http.mjs";

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
  if (isHttpMailConfigured()) return true;
  const setup = describeMailSetup();
  return setup.configured;
}

function createTransporters() {
  return buildSmtpCandidates().map((opts) =>
    nodemailer.createTransport({ ...opts, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 }),
  );
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: таймаут ${ms / 1000} с`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function formatSmtpError(err) {
  const msg = formatAuthHint(err, resolveSmtpProvider());
  if (/таймаут|timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return (
      `${msg}. На Railway Hobby SMTP (порты 465/587) заблокирован — используйте BREVO_API_KEY (HTTPS) или тариф Pro.`
    );
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
  const payment = paymentMethodLabel(customer.paymentMethod);
  const delivery = deliveryMethodLabel(customer.deliveryMethod);
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
    payment ? `Способ оплаты: ${payment}` : "",
    delivery ? `Способ доставки: ${delivery}` : "",
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
    ${payment ? `<p><strong>Способ оплаты:</strong> ${escapeHtml(payment)}</p>` : ""}
    ${delivery ? `<p><strong>Способ доставки:</strong> ${escapeHtml(delivery)}</p>` : ""}
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
      error: "Почта не настроена",
    });
    return { role, to: mail.to, outbox: file, skipped: true };
  }

  if (isHttpMailConfigured()) {
    try {
      const info = await sendHttpMail(mail);
      return { role, to: mail.to, messageId: info.messageId, via: "https" };
    } catch (err) {
      const file = saveToOutbox({
        orderId,
        role,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        error: String(err.message || err),
      });
      return { role, to: mail.to, outbox: file, error: String(err.message || err) };
    }
  }

  const transporters = createTransporters();
  let lastErr = null;
  for (const transporter of transporters) {
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
  if (isHttpMailConfigured()) return verifyHttpMail();
  if (!isMailConfigured()) {
    return {
      ok: false,
      skipped: true,
      error: "SMTP не настроен (нужны SMTP_USER, SMTP_PASS; SMTP_HOST подставится автоматически)",
    };
  }
  const transporters = createTransporters();
  let lastErr = null;
  for (const transporter of transporters) {
    try {
      await withTimeout(transporter.verify(), 12_000, "SMTP");
      return { ok: true };
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, error: formatSmtpError(lastErr) };
}

export async function getMailStatus() {
  const envDiag = mailTransportDiagnostics();
  const http = describeHttpMail();
  if (http.configured) {
    const verify = await verifyHttpMail();
    return {
      configured: true,
      transport: "https",
      host: http.providerLabel,
      port: 443,
      user: http.fromEmail,
      mailTo: shopEmail(),
      providerId: http.provider,
      providerLabel: http.providerLabel,
      autoDetected: false,
      authHint: http.hint,
      verified: verify.ok,
      error: verify.error || null,
      envDiag,
      supportedProviders: describeMailSetup().supportedProviders,
    };
  }

  const setup = describeMailSetup();
  if (!setup.configured) {
    const hints = [];
    if (envDiag.hasUnisenderGo || envDiag.hasUnisenderClassic) {
      hints.push("Удалите UNISENDER_* в Railway и сделайте Redeploy, либо задайте MAIL_TRANSPORT=smtp.");
    }
    if (smtpMailForced() && !envDiag.hasSmtpUser) {
      hints.push("MAIL_TRANSPORT=smtp задан, но нет SMTP_USER.");
    }
    return {
      configured: false,
      error:
        "SMTP не настроен. Минимум: SMTP_USER, SMTP_PASS, MAIL_TO. Хост подставится по домену почты (Яндекс, Mail.ru, Gmail…).",
      authHint: hints.join(" "),
      envDiag,
      supportedProviders: setup.supportedProviders,
    };
  }
  const verify = await verifySmtpConnection();
  return {
    configured: true,
    transport: "smtp",
    host: setup.host,
    port: setup.port,
    user: setup.user,
    mailTo: shopEmail(),
    providerId: setup.providerId,
    providerLabel: setup.providerLabel,
    autoDetected: setup.autoDetected,
    authHint: setup.authHint,
    verified: verify.ok,
    error: verify.error || null,
    envDiag,
    supportedProviders: setup.supportedProviders,
  };
}

export async function sendPreorderEmails({ orderId, payload, accountEmail }) {
  const { text, html, customerEmail } = buildOrderMessage(orderId, payload);
  const from = mailFrom();
  const fromForm = String(payload?.customer?.email || "").trim();
  const customerTo = fromForm || String(accountEmail || "").trim();
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

  if (customerTo) {
    deliveries.push(
      deliverMail({
        orderId,
        role: "customer",
        mail: {
          from,
          to: customerTo,
          replyTo: shopTo || undefined,
          subject: `Капсула — ваш предзаказ №${orderId}`,
          text,
          html,
        },
      }),
    );
  } else {
    deliveries.push(
      Promise.resolve({
        role: "customer",
        to: null,
        skipped: true,
        error: "Клиент не указал e-mail в заявке",
      }),
    );
  }

  const results = await Promise.all(deliveries);
  const shop = results.find((r) => r.role === "shop") || null;
  const customer = results.find((r) => r.role === "customer") || null;
  const sent = results.filter((r) => r.messageId);
  const errors = results.filter((r) => r.error).map((r) => r.error);

  if (sent.length) {
    return {
      ok: true,
      shop,
      customer,
      sent,
      outbox: results.filter((r) => r.outbox).map((r) => r.outbox),
      warnings: errors.length ? errors : undefined,
    };
  }

  if (!isMailConfigured()) {
    return {
      ok: false,
      skipped: true,
      shop,
      customer,
      outbox: results.filter((r) => r.outbox).map((r) => r.outbox),
    };
  }

  return {
    ok: false,
    error: errors[0] || "Письмо не отправлено",
    shop,
    customer,
    outbox: results.filter((r) => r.outbox).map((r) => r.outbox),
  };
}

function resolveCustomerEmail(payload, accountEmail) {
  const fromForm = String(payload?.customer?.email || "").trim();
  if (fromForm) return fromForm;
  return String(accountEmail || "").trim();
}

export async function sendOrderStatusEmail({ orderId, status, statusLabel, payload, accountEmail }) {
  if (!shouldNotifyStatusChange(status)) {
    return { ok: false, skipped: true, reason: "no_notify" };
  }

  const customerTo = resolveCustomerEmail(payload, accountEmail);
  if (!customerTo) {
    return { ok: false, skipped: true, error: "У заказа нет e-mail клиента" };
  }

  const label = statusLabel || orderStatusLabel(status);
  const lead = orderStatusNotifyText(status) || `Статус вашего заказа: ${label}.`;
  const { text: orderText, html: orderHtml } = buildOrderMessage(orderId, payload);
  const from = mailFrom();

  const text = [
    `Заказ №${orderId} — Капсула`,
    "",
    `Статус: ${label}`,
    lead,
    "",
    orderText,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.5">
    <h2 style="margin:0 0 12px">Заказ №${orderId}</h2>
    <p style="font-size:17px;margin:0 0 8px"><strong>Статус: ${escapeHtml(label)}</strong></p>
    <p style="margin:0 0 16px;color:#333">${escapeHtml(lead)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:16px 0" />
    ${orderHtml}
  </body></html>`;

  const result = await deliverMail({
    orderId,
    role: `status-${status}`,
    mail: {
      from,
      to: customerTo,
      subject: `Капсула — заказ №${orderId}: ${label}`,
      text,
      html,
    },
  });

  if (result.messageId) {
    return { ok: true, to: customerTo, messageId: result.messageId, status: label };
  }
  if (result.skipped) {
    return { ok: false, skipped: true, to: customerTo, outbox: result.outbox };
  }
  return { ok: false, to: customerTo, error: result.error, outbox: result.outbox };
}
