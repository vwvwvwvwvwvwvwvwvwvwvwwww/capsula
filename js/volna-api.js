(function () {
  if (typeof window === "undefined") return;
  /**
   * Пусто — запросы к API на том же адресе, что и страница (нормально после «npm start»).
   * Задавайте только если HTML отдаётся с другого origin: window.VOLNA_API_BASE = "http://127.0.0.1:3333"
   */
  if (typeof window.VOLNA_API_BASE !== "string") window.VOLNA_API_BASE = "";

  window.volnaApiUrl = function (path) {
    const base = String(window.VOLNA_API_BASE || "").replace(/\/$/, "");
    const p = String(path || "").startsWith("/") ? path : "/" + path;
    if (base) return base + p;
    try {
      const { protocol, origin } = window.location || {};
      if (protocol === "http:" || protocol === "https:") return origin + p;
    } catch (_) {}
    return p;
  };
})();
