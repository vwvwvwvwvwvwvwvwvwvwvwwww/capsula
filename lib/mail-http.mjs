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
  if (env("UNISENDER_GO_API_KEY")) return "unisender_go";
  if (env("UNISENDER_API_KEY") && env("UNISENDER_LIST_ID")) return "unisender";
  if (env("BREVO_API_KEY")) return "brevo";
  if (env("RESEND_API_KEY")) return "resend";
  return null;
}

export function isHttpMailConfigured() {
  return Boolean(httpMailProvider());
}

function unisenderGoBase() {
  const custom = env("UNISENDER_GO_API_URL");
  if (custom) return custom.replace(/\/$/, "");
  return "https://goapi.unisender.ru/ru/transactional/api/v1";
}

async function sendViaUnisenderGo({ from, to, subject, text, html }) {
  const sender = parseFrom(from);
  const url = `${unisenderGoBase()}/email/send.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-KEY": env("UNISENDER_GO_API_KEY"),
    },
    body: JSON.stringify({
      message: {
        recipients: [{ email: to }],
        body: { html: html || `<pre>${text}</pre>`, plaintext: text || "" },
        subject,
        from_email: sender.email,
        from_name: sender.name,
        track_links: 0,
        track_read: 0,
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.message || JSON.stringify(data) || `UniSender Go: ${res.status}`;
    throw new Error(
      `${msg}. В go.unisender.ru подтвердите домен/e-mail отправителя (${sender.email}).`,
    );
  }
  if (data.status === "error") {
    throw new Error(data.message || "UniSender Go: ошибка отправки");
  }
  return { messageId: data.job_id || data.email_id || null };
}

async function sendViaUnisenderClassic({ from, to, subject, text, html }) {
  const sender = parseFrom(from);
  const params = new URLSearchParams({
    format: "json",
    api_key: env("UNISENDER_API_KEY"),
    email: to,
    sender_name: sender.name,
    sender_email: sender.email,
    subject,
    body: html || text || "",
    list_id: env("UNISENDER_LIST_ID"),
  });
  const res = await fetch("https://api.unisender.com/ru/api/sendEmail", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    throw new Error(
      `${data.error}. В unisender.com подтвердите e-mail отправителя и создайте список контактов (UNISENDER_LIST_ID).`,
    );
  }
  return { messageId: data.result?.email_id || null };
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
    throw new Error(data.message || `Brevo: ошибка ${res.status}`);
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

export async function verifyHttpMail() {
  const provider = httpMailProvider();
  if (!provider) {
    return { ok: false, skipped: true, error: "HTTP-почта не настроена" };
  }
  if (provider === "unisender_go") {
    try {
      const res = await fetch(`${unisenderGoBase()}/project/list.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-API-KEY": env("UNISENDER_GO_API_KEY"),
        },
        body: "{}",
      });
      if (res.status === 401) return { ok: false, error: "Неверный UNISENDER_GO_API_KEY" };
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.message || `UniSender Go: ${res.status}` };
      }
      return { ok: true, provider: "unisender_go" };
    } catch (err) {
      return { ok: false, error: err.message || "UniSender Go недоступен" };
    }
  }
  if (provider === "unisender") {
    return { ok: true, provider: "unisender" };
  }
  if (provider === "brevo") {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": env("BREVO_API_KEY") },
      });
      if (!res.ok) return { ok: false, error: `Brevo API: ошибка ${res.status}` };
      return { ok: true, provider: "brevo" };
    } catch (err) {
      return { ok: false, error: err.message || "Brevo недоступен" };
    }
  }
  return { ok: true, provider: "resend" };
}

export async function sendHttpMail(mail) {
  const provider = httpMailProvider();
  if (provider === "unisender_go") return sendViaUnisenderGo(mail);
  if (provider === "unisender") return sendViaUnisenderClassic(mail);
  if (provider === "brevo") return sendViaBrevo(mail);
  if (provider === "resend") return sendViaResend(mail);
  throw new Error("HTTP-почта не настроена");
}

export function describeHttpMail() {
  const provider = httpMailProvider();
  if (!provider) return { configured: false };
  const from = parseFrom(env("MAIL_FROM") || env("SMTP_USER"));
  const labels = {
    unisender_go: "UniSender Go (HTTPS, Россия)",
    unisender: "UniSender (HTTPS, Россия)",
    brevo: "Brevo (HTTPS)",
    resend: "Resend (HTTPS)",
  };
  const hints = {
    unisender_go:
      "Российский сервис. Railway Hobby блокирует SMTP — используйте UNISENDER_GO_API_KEY. Регистрация: go.unisender.ru",
    unisender:
      "Бесплатный UniSender. Нужны UNISENDER_API_KEY и UNISENDER_LIST_ID (список на unisender.com). Подтвердите e-mail отправителя.",
    brevo: "Brevo (может быть недоступен из РФ). Подтвердите отправителя в Brevo.",
    resend: "Resend. Для теста: MAIL_FROM=onboarding@resend.dev",
  };
  return {
    configured: true,
    provider,
    providerLabel: labels[provider] || provider,
    fromEmail: from.email,
    hint: hints[provider],
  };
}
