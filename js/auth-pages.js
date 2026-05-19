(function () {
  function resolveApiUrl(path) {
    return typeof window.volnaApiUrl === "function" ? window.volnaApiUrl(path) : path;
  }

  function apiJson(url, options = {}) {
    const { method = "GET", body } = options;
    const opts = { method, credentials: "include" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    return fetch(resolveApiUrl(url), opts).then(async (res) => {
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { error: text };
        }
      }
      return { res, data };
    });
  }

  function bindLogout() {
    const btn = document.getElementById("site-header-logout");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", async () => {
        await apiJson("/api/logout", { method: "POST", body: {} });
        refreshAuthUI(null);
        if (window.updateCartBadge) window.updateCartBadge();
      });
    }
  }

  function refreshAuthUI(user) {
    const guest = document.getElementById("site-auth-guest");
    const userEl = document.getElementById("site-auth-user");
    const email = document.getElementById("site-auth-email");
    const footerAdmin = document.getElementById("footer-admin-link");
    const navAdmin = document.getElementById("nav-admin-link");

    if (guest) guest.hidden = !!user;
    if (userEl) userEl.hidden = !user;
    if (email && user) email.textContent = user.email;
    const isAdmin = user && user.role === "admin";
    if (footerAdmin) footerAdmin.hidden = !isAdmin;
    if (navAdmin) navAdmin.hidden = !isAdmin;
    bindLogout();
  }

  async function refreshMe() {
    try {
      const { res, data } = await apiJson("/api/me");
      if (!res.ok) {
        refreshAuthUI(null);
        return null;
      }
      const user = data.user || null;
      refreshAuthUI(user);
      return user;
    } catch {
      refreshAuthUI(null);
      return null;
    }
  }

  function onMounted() {
    fillAuthSlot();
    refreshMe();
    if (window.updateCartBadge) window.updateCartBadge();
  }

  function fillAuthSlot() {
    const slot = document.getElementById("site-auth-slot");
    if (!slot) return;
    slot.innerHTML = `
      <span id="site-auth-guest">
        <a class="site-text-link" href="account.html">Вход</a>
        <span class="site-auth-sep">/</span>
        <a class="site-text-link" href="account.html#register">Регистрация</a>
      </span>
      <span class="site-auth-user" id="site-auth-user" hidden>
        <a class="site-text-link site-text-link--strong" id="site-auth-email" href="account.html"></a>
        <button type="button" class="site-text-btn" id="site-header-logout">Выйти</button>
      </span>
      <a class="site-text-link site-text-link--admin" id="nav-admin-link" href="admin.html" hidden>Админ</a>
    `;
  }

  window.addEventListener("sitechrome:mounted", onMounted);

  window.VolnaApi = {
    async submitPreorder(payload) {
      try {
        const { res, data } = await apiJson("/api/preorders", { method: "POST", body: payload });
        if (!res.ok) return { ok: false, error: data.error || `Ошибка ${res.status}` };
        const mail = data.mail || data.email;
        return { ok: true, id: data.id, email: mail };
      } catch {
        return { ok: false, error: "offline" };
      }
    },
    refreshMe,
  };
})();
