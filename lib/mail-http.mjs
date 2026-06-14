/** Отправка через HTTPS API — работает на Railway Hobby (SMTP там заблокирован). */

function env(name) {
  return String(process.env[name] || "").trim();
}

function parseFrom(from) {
  const raw = String(from || "").trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (raw.includes("@")) return { name: "Капсула", email: raw };
  return { name: "Капсула", email: env("MAIL_FROM_EMAIL") || env("SMTP_USER") || "noreply@example.com" };
}

export function httpMailProvider() {
  if (env("BREVO_API_KEY")) return "brevo";
  if (env("RESEND_API_KEY")) return "resend";
  return null;
}

export function isHttpMailConfigured() {
  return Boolean(httpMailProvider());
}

export async function verifyHttpMail() {
  const provider = httpMailProvider();
  if (!provider) {
    return { ok: false, skipped: true, error: "HTTP-почта не настроена" };
  }
  if (provider === "brevo") {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": env("BREVO_API_KEY") },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.message || `Brevo API: ошибка ${res.status}` };
      }
      return { ok: true, provider: "brevo" };
    } catch (err) {
      return { ok: false, error: err.message || "Brevo API недоступен" };
    }
  }
  return { ok: true, provider: "resend" };
}

async function sendViaBrevo({ from, to, subject, text, html }) {
  const sender = parseFrom(from);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env("BREVO_API_KEY"),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.code || `Brevo: ошибка ${res.status}`;
    if (/sender/i.test(msg)) {
      throw new Error(
        `${msg}. В Brevo → Senders добавьте и подтвердите e-mail отправителя (${sender.email}).`,
      );
    }
    throw new Error(msg);
  }
  return { messageId: data.messageId || null };
}

async function sendViaResend({ from, to, subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Resend: ошибка ${res.status}`);
  }
  return { messageId: data.id || null };
}

export async function sendHttpMail(mail) {
  const provider = httpMailProvider();
  if (provider === "brevo") return sendViaBrevo(mail);
  if (provider === "resend") return sendViaResend(mail);
  throw new Error("HTTP-почта не настроена");
}

export function describeHttpMail() {
  const provider = httpMailProvider();
  if (!provider) return { configured: false };
  const from = parseFrom(env("MAIL_FROM") || env("SMTP_USER"));
  return {
    configured: true,
    provider,
    providerLabel: provider === "brevo" ? "Brevo (HTTPS)" : "Resend (HTTPS)",
    fromEmail: from.email,
    hint:
      provider === "brevo"
        ? "Railway Hobby блокирует SMTP. Brevo работает по HTTPS. В Brevo → Senders подтвердите e-mail отправителя."
        : "Railway Hobby блокирует SMTP. Resend работает по HTTPS. Для теста: MAIL_FROM=onboarding@resend.dev",
  };
}
