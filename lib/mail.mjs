import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const fmtMoney = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function mailFrom() {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "kapsula@localhost";
}

function adminEmail() {
  return (process.env.MAIL_TO || process.env.SMTP_USER || "").trim();
}

export function isMailConfigured() {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "";
  return Boolean(host && user && String(pass).length > 0);
}

function createTransporter() {
  const port = Number(process.env.SMTP_PORT, 10) || 587;
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
    },
  });
}

function formatLines(payload) {
  const lines = Array.isArray(payload?.lines) ? payload.lines : [];
  return lines.map((l) => {
    const qty = Number(l.qty) || 1;
    const price = Number(l.unitPrice) || 0;
    const size = l.size ? `, размер ${l.size}` : "";
    return `— ${l.title || "Товар"}${size} × ${qty} — ${fmtMoney.format(price * qty)}`;
  });
}

export function buildPreorderMail(orderId, payload) {
  const customer = payload?.customer || {};
  const lines = formatLines(payload);
  const total =
    payload?.total != null ? fmtMoney.format(Math.round(Number(payload.total))) : "—";
  const name = [customer.name, customer.phone, customer.email, customer.city]
    .filter(Boolean)
    .join(" · ");

  const text = [
    `Предзаказ №${orderId} — Капсула`,
    "",
    name ? `Клиент: ${name}` : "",
    customer.comment ? `Комментарий: ${customer.comment}` : "",
    "",
    "Состав:",
    ...lines,
    "",
    `Итого: ${total}`,
    "",
    "Оплата на сайте не производится — с вами свяжется менеджер.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  const linesHtml = (Array.isArray(payload?.lines) ? payload.lines : [])
    .map((l) => {
      const qty = Number(l.qty) || 1;
      const price = Number(l.unitPrice) || 0;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(l.title || "—")}</td>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(l.size || "—")}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center">${qty}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right">${escapeHtml(fmtMoney.format(price * qty))}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><body style="font-family:Inter,Arial,sans-serif;color:#111;line-height:1.5">
    <h2 style="margin:0 0 12px">Предзаказ №${orderId}</h2>
    ${name ? `<p><strong>Клиент:</strong> ${escapeHtml(name)}</p>` : ""}
    ${customer.comment ? `<p><strong>Комментарий:</strong> ${escapeHtml(customer.comment)}</p>` : ""}
    <table style="border-collapse:collapse;width:100%;max-width:560px;margin:16px 0">
      <thead><tr style="background:#f5f5f5">
        <th style="padding:8px;border:1px solid #ddd;text-align:left">Товар</th>
        <th style="padding:8px;border:1px solid #ddd">Размер</th>
        <th style="padding:8px;border:1px solid #ddd">Кол-во</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:right">Сумма</th>
      </tr></thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <p style="font-size:18px"><strong>Итого: ${escapeHtml(total)}</strong></p>
    <p style="color:#666;font-size:14px">Оплата на сайте не производится — менеджер свяжется с вами.</p>
  </body></html>`;

  return { text, html, total, customerEmail: (customer.email || "").trim() };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function saveOutbox(root, orderId, message) {
  const dir = path.join(root, "data", "mail-outbox");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `order-${orderId}-${Date.now()}.txt`);
  fs.writeFileSync(file, message, "utf8");
  return file;
}

/**
 * Письма клиенту (если указан e-mail) и на MAIL_TO / SMTP_USER (магазин).
 */
export async function sendPreorderEmails(root, { orderId, payload, accountEmail }) {
  const { text, html, customerEmail: fromForm } = buildPreorderMail(orderId, payload);
  const customerTo = fromForm || (accountEmail || "").trim();
  const shopTo = adminEmail();
  const from = mailFrom();

  if (!isMailConfigured()) {
    const file = await saveOutbox(
      root,
      orderId,
      `Кому (клиент): ${customerTo || "—"}\nКому (магазин): ${shopTo || "—"}\n\n${text}`
    );
    console.warn(`[КАПСУЛА] SMTP не настроен — письмо сохранено: ${file}`);
    return { ok: false, skipped: true, outbox: file };
  }

  const transporter = createTransporter();
  const sent = [];

  if (customerTo) {
    const info = await transporter.sendMail({
      from,
      to: customerTo,
      subject: `Капсула — ваш предзаказ №${orderId}`,
      text,
      html,
    });
    sent.push({ role: "customer", to: customerTo, messageId: info.messageId });
  }

  if (shopTo && shopTo.toLowerCase() !== customerTo.toLowerCase()) {
    const info = await transporter.sendMail({
      from,
      to: shopTo,
      subject: `Капсула — новый предзаказ №${orderId}`,
      text: `Новая заявка с сайта.\n\n${text}`,
      html: html.replace("<h2", "<p><strong>Новая заявка с сайта</strong></p><h2"),
    });
    sent.push({ role: "shop", to: shopTo, messageId: info.messageId });
  } else if (shopTo && !customerTo) {
    const info = await transporter.sendMail({
      from,
      to: shopTo,
      subject: `Капсула — новый предзаказ №${orderId}`,
      text,
      html,
    });
    sent.push({ role: "shop", to: shopTo, messageId: info.messageId });
  }

  return { ok: true, sent };
}
