/** Пресеты SMTP для популярных почтовых сервисов. */

const PROVIDERS = [
  {
    id: "yandex",
    label: "Яндекс",
    domains: ["yandex.ru", "yandex.com", "yandex.net", "ya.ru"],
    hosts: ["smtp.yandex.ru"],
    ports: [
      { port: 465, secure: true },
      { port: 587, secure: false },
    ],
    tls: { servername: "smtp.yandex.ru", minVersion: "TLSv1.2" },
    requireTlsOn587: true,
    authHint:
      "Яндекс: id.yandex.ru → Пароли приложений → «Почта». В SMTP_PASS — только пароль приложения. В Яндекс.Почте включите доступ для почтовых программ.",
  },
  {
    id: "mailru",
    label: "Mail.ru",
    domains: ["mail.ru", "inbox.ru", "bk.ru", "list.ru", "internet.ru", "xmail.ru"],
    hosts: ["smtp.mail.ru"],
    ports: [
      { port: 465, secure: true },
      { port: 587, secure: false },
    ],
    tls: { servername: "smtp.mail.ru", minVersion: "TLSv1.2" },
    requireTlsOn587: true,
    authHint:
      "Mail.ru: mail.ru → Настройки → Пароль и безопасность → Пароль для внешнего приложения. В SMTP_PASS — этот пароль, не основной пароль от почты.",
  },
  {
    id: "gmail",
    label: "Gmail",
    domains: ["gmail.com", "googlemail.com"],
    hosts: ["smtp.gmail.com"],
    ports: [
      { port: 465, secure: true },
      { port: 587, secure: false },
    ],
    requireTlsOn587: true,
    authHint:
      "Gmail: включите двухфакторную защиту и создайте App Password (Пароль приложения) в аккаунте Google.",
  },
  {
    id: "outlook",
    label: "Outlook / Hotmail",
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    hosts: ["smtp-mail.outlook.com", "smtp.office365.com"],
    ports: [{ port: 587, secure: false }],
    requireTlsOn587: true,
    authHint:
      "Outlook: используйте пароль от аккаунта Microsoft или пароль приложения, если включена 2FA.",
  },
  {
    id: "yahoo",
    label: "Yahoo",
    domains: ["yahoo.com", "yahoo.ru", "yandex.com.tr"],
    hosts: ["smtp.mail.yahoo.com"],
    ports: [
      { port: 465, secure: true },
      { port: 587, secure: false },
    ],
    requireTlsOn587: true,
    authHint: "Yahoo: в настройках безопасности создайте пароль приложения для почты.",
  },
  {
    id: "rambler",
    label: "Rambler",
    domains: ["rambler.ru", "lenta.ru", "ro.ru", "autorambler.ru", "myrambler.ru"],
    hosts: ["smtp.rambler.ru"],
    ports: [
      { port: 465, secure: true },
      { port: 587, secure: false },
    ],
    requireTlsOn587: true,
    authHint: "Rambler: в настройках почты включите SMTP и используйте пароль от ящика.",
  },
  {
    id: "icloud",
    label: "iCloud",
    domains: ["icloud.com", "me.com", "mac.com"],
    hosts: ["smtp.mail.me.com"],
    ports: [{ port: 587, secure: false }],
    requireTlsOn587: true,
    authHint: "iCloud: appleid.apple.com → Пароли приложений → создайте пароль для «Почта».",
  },
  {
    id: "proton",
    label: "Proton Mail",
    domains: ["proton.me", "protonmail.com", "pm.me"],
    hosts: ["smtp.protonmail.ch"],
    ports: [{ port: 587, secure: false }],
    requireTlsOn587: true,
    authHint: "Proton: нужен платный план с SMTP или используйте Proton Bridge на своём сервере.",
  },
];

function env(name) {
  return String(process.env[name] || "").trim();
}

function emailDomain(email) {
  const m = String(email || "").trim().toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : "";
}

function hostMatchesProvider(host, provider) {
  const h = String(host || "").toLowerCase();
  return provider.hosts.some((x) => h === x || h.endsWith(`.${x}`));
}

export function findProviderByEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return null;
  return PROVIDERS.find((p) => p.domains.includes(domain)) || null;
}

export function findProviderByHost(host) {
  const h = String(host || "").trim().toLowerCase();
  if (!h) return null;
  return PROVIDERS.find((p) => hostMatchesProvider(h, p)) || null;
}

export function findProviderById(id) {
  const key = String(id || "").trim().toLowerCase();
  if (!key) return null;
  return PROVIDERS.find((p) => p.id === key) || null;
}

export function resolveSmtpProvider() {
  const explicitHost = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const forced = findProviderById(env("SMTP_PROVIDER"));

  if (forced) {
    return {
      provider: forced,
      host: explicitHost || forced.hosts[0],
      source: "SMTP_PROVIDER",
    };
  }

  if (explicitHost) {
    const byHost = findProviderByHost(explicitHost);
    return {
      provider: byHost,
      host: explicitHost,
      source: "SMTP_HOST",
    };
  }

  const byEmail = findProviderByEmail(user);
  if (byEmail) {
    return {
      provider: byEmail,
      host: byEmail.hosts[0],
      source: "SMTP_USER",
    };
  }

  return { provider: null, host: "", source: null };
}

export function listSmtpProviders() {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    domains: p.domains,
    hosts: p.hosts,
  }));
}

function parseExplicitPort() {
  const raw = env("SMTP_PORT");
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isFinite(port) || port < 1) return null;
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return { port, secure };
}

/** Варианты подключения: host + port + secure + доп. TLS-опции. */
export function buildSmtpCandidates() {
  const user = env("SMTP_USER");
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
  const resolved = resolveSmtpProvider();
  const host = resolved.host;

  if (!host || !user || !pass) return [];

  const explicit = parseExplicitPort();
  const provider = resolved.provider || findProviderByHost(host);
  const auth = { user, pass };

  const makeOpts = (port, secure) => {
    const opts = { host, port, secure, auth };
    if (provider?.tls) opts.tls = { ...provider.tls };
    if (!secure && (provider?.requireTlsOn587 || port === 587)) opts.requireTLS = true;
    return opts;
  };

  if (explicit) {
    return [makeOpts(explicit.port, explicit.secure)];
  }

  const ports = provider?.ports || [
    { port: 465, secure: true },
    { port: 587, secure: false },
  ];

  const seen = new Set();
  const out = [];
  for (const p of ports) {
    const key = `${p.port}:${p.secure}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeOpts(p.port, p.secure));
  }
  return out;
}

export function formatAuthHint(err, resolved = resolveSmtpProvider()) {
  const msg = String(err?.message || err || "Ошибка почты");
  if (err?.code === "EAUTH" || /authentication failed|invalid login|535|534/i.test(msg)) {
    if (resolved.provider?.authHint) return resolved.provider.authHint;
    return "Ошибка SMTP-авторизации. Проверьте SMTP_USER и SMTP_PASS (обычно нужен пароль приложения, не основной пароль от почты).";
  }
  return msg;
}

export function describeMailSetup() {
  const user = env("SMTP_USER");
  const pass = Boolean(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
  const resolved = resolveSmtpProvider();
  const host = resolved.host || env("SMTP_HOST");
  const explicit = parseExplicitPort();
  const provider = resolved.provider || findProviderByHost(host) || findProviderByEmail(user);

  const configured = Boolean(host && user && pass);

  return {
    configured,
    host: host || null,
    port: explicit?.port || provider?.ports?.[0]?.port || 587,
    user,
    providerId: provider?.id || null,
    providerLabel: provider?.label || (host ? "Свой SMTP" : null),
    autoDetected: !env("SMTP_HOST") && resolved.source === "SMTP_USER",
    authHint: provider?.authHint || null,
    supportedProviders: listSmtpProviders(),
  };
}
