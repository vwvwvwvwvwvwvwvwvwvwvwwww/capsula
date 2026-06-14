/** Отправка через HTTPS API — работает на Railway Hobby (SMTP там заблокирован). */

function env(name) {
  return String(process.env[name] || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseSeedEmails() {
  return env("UNISENDER_SEED_EMAILS")
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter((e) => e.includes("@"));
}

async function unisenderApi(method, params = {}) {
  const apiKey = env("UNISENDER_API_KEY");
  if (!apiKey) throw new Error("UNISENDER_API_KEY не задан");
  const body = new URLSearchParams({ format: "json", api_key: apiKey });
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") body.set(key, String(value));
  }
  const res = await fetch(`https://api.unisender.com/ru/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const err = new Error(String(data.error));
    err.code = data.code;
    throw err;
  }
  return data.result;
}

export async function subscribeUniSenderContact(email, name = "") {
  const listId = env("UNISENDER_LIST_ID");
  const addr = normalizeEmail(email);
  if (!listId || !addr) return { email: addr, skipped: true };
  const params = {
    list_ids: listId,
    "fields[email]": addr,
    double_optin: "0",
    overwrite: "2",
  };
  if (name) params["fields[Name]"] = String(name).trim();
  try {
    const result = await unisenderApi("subscribe", params);
    return { email: addr, ok: true, personId: result?.person_id || null };
  } catch (err) {
    const msg = String(err.message || err);
    if (/already|уже|exists|duplicate|добавлен/i.test(msg)) {
      return { email: addr, ok: true, already: true };
    }
    return { email: addr, ok: false, error: msg };
  }
}

export async function createUniSenderList(title = "Капсула — уведомления") {
  const result = await unisenderApi("createList", { title });
  return result?.id || null;
}

async function ensureUniSenderSenderConfirmed(senderEmail) {
  const email = normalizeEmail(senderEmail);
  if (!email) return { skipped: true };
  try {
    const result = await unisenderApi("getCheckedEmail", {});
    const checked = Array.isArray(result)
      ? result.map(normalizeEmail)
      : Array.isArray(result?.emails)
        ? result.emails.map(normalizeEmail)
        : [];
    if (checked.includes(email)) return { email, confirmed: true };
    return {
      email,
      confirmed: false,
      hint:
        `Отправитель ${email} не подтверждён в UniSender. ` +
        `unisender.com → Сообщения → создать письмо → «От кого» ${email} → запрос подтверждения → ссылка в почте.`,
    };
  } catch (err) {
    return { email, confirmed: false, error: String(err.message || err) };
  }
}

export async function requestUniSenderSenderConfirm(senderEmail) {
  const email = normalizeEmail(senderEmail);
  if (!email) return { skipped: true };
  try {
    await unisenderApi("validateSender", { email });
    return { email, validationSent: true };
  } catch (err) {
    return { email, validationSent: false, error: String(err.message || err) };
  }
}

function formatUniSenderSendError(error, senderEmail) {
  const msg = String(error?.message || error || "");
  if (/free plan|confirmed emails/i.test(msg)) {
    return (
      `${msg} На бесплатном тарифе UniSender API шлёт только на подтверждённые адреса. ` +
      `1) Подтвердите отправителя ${senderEmail} на unisender.com (Сообщения → От кого → запрос подтверждения). ` +
      `2) Получатель должен быть в списке UNISENDER_LIST_ID — сайт добавляет его автоматически при отправке. ` +
      `3) Для писем любым клиентам нужен UniSender Go или платный тариф.`
    );
  }
  return `${msg}. В unisender.com подтвердите e-mail отправителя и проверьте UNISENDER_LIST_ID.`;
}

export async function bootstrapUniSenderContacts(extraEmails = []) {
  if (httpMailProvider() !== "unisender") return { skipped: true, reason: "not_unisender" };

  const emails = new Set(parseSeedEmails());
  const from = parseFrom(env("MAIL_FROM") || env("SMTP_USER"));
  if (from.email) emails.add(normalizeEmail(from.email));
  if (env("MAIL_TO")) emails.add(normalizeEmail(env("MAIL_TO")));
  if (env("ADMIN_EMAIL")) emails.add(normalizeEmail(env("ADMIN_EMAIL")));
  for (const raw of extraEmails) {
    const e = normalizeEmail(raw);
    if (e.includes("@")) emails.add(e);
  }

  const sender = await ensureUniSenderSenderConfirmed(from.email);
  const subscribed = [];
  const failed = [];
  for (const email of emails) {
    const row = await subscribeUniSenderContact(email);
    if (row.ok) subscribed.push(email);
    else if (!row.skipped) failed.push({ email, error: row.error });
  }

  return {
    listId: env("UNISENDER_LIST_ID"),
    sender,
    subscribed,
    failed,
    total: emails.size,
  };
}

function parseFrom(from) {
  const raw = String(from || "").trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (raw.includes("@")) return { name: "Капсула", email: raw };
  return { name: "Капсула", email: env("MAIL_FROM_EMAIL") || env("SMTP_USER") || "noreply@example.com" };
}

export function smtpMailForced() {
  const mode = env("MAIL_TRANSPORT").toLowerCase();
  return mode === "smtp" || env("MAIL_USE_SMTP") === "1" || env("MAIL_USE_SMTP") === "true";
}

export function mailTransportDiagnostics() {
  return {
    forcedSmtp: smtpMailForced(),
    hasUnisenderGo: Boolean(env("UNISENDER_GO_API_KEY")),
    hasUnisenderApiKey: Boolean(env("UNISENDER_API_KEY")),
    hasUnisenderListId: Boolean(env("UNISENDER_LIST_ID")),
    hasUnisenderClassic: Boolean(env("UNISENDER_API_KEY") && env("UNISENDER_LIST_ID")),
    hasBrevo: Boolean(env("BREVO_API_KEY")),
    hasResend: Boolean(env("RESEND_API_KEY")),
    hasSmtpUser: Boolean(env("SMTP_USER")),
    hasSmtpPass: Boolean(process.env.SMTP_PASS || process.env.SMTP_PASSWORD),
  };
}

export function httpMailProvider() {
  if (smtpMailForced()) return null;
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
  await subscribeUniSenderContact(to);
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
    throw new Error(formatUniSenderSendError({ message: data.error }, sender.email));
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
    try {
      const from = parseFrom(env("MAIL_FROM") || env("SMTP_USER"));
      const sender = await ensureUniSenderSenderConfirmed(from.email);
      if (!sender.confirmed) {
        return {
          ok: false,
          provider: "unisender",
          error: sender.hint || sender.error || "Подтвердите e-mail отправителя на unisender.com",
        };
      }
      return { ok: true, provider: "unisender" };
    } catch (err) {
      return { ok: false, provider: "unisender", error: String(err.message || err) };
    }
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
      "Бесплатный UniSender. Нужны UNISENDER_API_KEY и UNISENDER_LIST_ID. Получатели добавляются в список автоматически. Подтвердите e-mail отправителя на unisender.com.",
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
