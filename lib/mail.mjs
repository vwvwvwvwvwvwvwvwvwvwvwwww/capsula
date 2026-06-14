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
  const setup = describeMailSetup();
  return setup.configured;
}

function createTransporters() {
  return buildSmtpCandidates().map((opts) => nodemailer.createTransport(opts));
}

function formatSmtpError(err) {
  return formatAuthHint(err, resolveSmtpProvider());
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
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      lastErr = err;
    }
  }
  return { ok: false, error: formatSmtpError(lastErr) };
}

export async function getMailStatus() {
  const setup = describeMailSetup();
  if (!setup.configured) {
    return {
      configured: false,
      error:
        "SMTP не настроен. Минимум: SMTP_USER, SMTP_PASS, MAIL_TO. Хост подставится по домену почты (Яндекс, Mail.ru, Gmail…).",
      supportedProviders: setup.supportedProviders,
    };
  }
  const verify = await verifySmtpConnection();
  return {
    configured: true,
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
    supportedProviders: setup.supportedProviders,
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
