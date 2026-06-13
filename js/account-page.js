(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const FETCH_MS = 20000;

  function resolveApiUrl(path) {
    return typeof window.volnaApiUrl === "function" ? window.volnaApiUrl(path) : path;
  }

  async function apiJson(url, options = {}) {
    const { method = "GET", body } = options;
    const opts = { method, credentials: "include" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
    opts.signal = ctrl.signal;
    try {
      const res = await fetch(resolveApiUrl(url), opts);
      const text = await res.text();
      let data = {};
      let bodyParsedOk = false;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      const headerJson = ct.includes("application/json");
      if (text) {
        try {
          data = JSON.parse(text);
          bodyParsedOk = true;
        } catch {
          data = { error: text.slice(0, 200) };
        }
      }
      const apiLooksJson = headerJson || bodyParsedOk;
      return { res, data, apiLooksJson };
    } finally {
      clearTimeout(timer);
    }
  }

  function httpErrorMessage(res, data, apiLooksJson) {
    const raw =
      data && typeof data.error === "string"
        ? data.error.trim()
        : "";
    if (!apiLooksJson && (res.status === 404 || /^not\s*found$/i.test(raw))) {
      return "Сервер временно недоступен. Попробуйте позже или обновите страницу.";
    }
    if (raw) return raw;
    return `Ошибка ${res.status}`;
  }

  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const panelLogin = document.getElementById("panel-login");
  const panelRegister = document.getElementById("panel-register");
  const loginForm = document.getElementById("form-login");
  const regForm = document.getElementById("form-register");
  const loginErr = document.getElementById("login-err");
  const regErr = document.getElementById("register-err");

  function showTab(which) {
    const login = which === "login";
    if (tabLogin) {
      tabLogin.classList.toggle("is-active", login);
      tabLogin.setAttribute("aria-selected", login ? "true" : "false");
    }
    if (tabRegister) {
      tabRegister.classList.toggle("is-active", !login);
      tabRegister.setAttribute("aria-selected", login ? "false" : "true");
    }
    if (panelLogin) {
      panelLogin.classList.toggle("is-visible", login);
      panelLogin.toggleAttribute("hidden", !login);
    }
    if (panelRegister) {
      panelRegister.classList.toggle("is-visible", !login);
      panelRegister.toggleAttribute("hidden", login);
    }
  }

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener("click", () => showTab("login"));
    tabRegister.addEventListener("click", () => showTab("register"));
  }

  if (location.hash === "#register") {
    showTab("register");
    requestAnimationFrame(() => panelRegister && panelRegister.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  function showErr(el, msg) {
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function setBusy(form, busy) {
    if (!form) return;
    const btn = form.querySelector(".account-form__submit");
    if (!btn) return;
    btn.disabled = busy;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = busy ? "…" : btn.dataset.label;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr(loginErr, "");
      const fd = new FormData(loginForm);
      const email = String(fd.get("email") || "").trim();
      const password = fd.get("password");

      if (!email) {
        showErr(loginErr, "Укажите e-mail.");
        return;
      }
      if (!EMAIL_RE.test(email)) {
        showErr(loginErr, "Некорректный e-mail.");
        return;
      }
      if (password == null || String(password).length === 0) {
        showErr(loginErr, "Укажите пароль.");
        return;
      }

      setBusy(loginForm, true);
      try {
        const { res, data, apiLooksJson } = await apiJson("/api/login", {
          method: "POST",
          body: { email, password },
        });
        if (!res.ok) {
          showErr(loginErr, httpErrorMessage(res, data, apiLooksJson));
          return;
        }
        if (
          !apiLooksJson ||
          !data ||
          typeof data.user !== "object" ||
          data.user === null ||
          Array.isArray(data.user)
        ) {
          showErr(loginErr, "Сервер вернул неожиданный ответ. Попробуйте обновить страницу.");
          return;
        }
        try {
          if (window.VolnaApi && window.VolnaApi.refreshMe) await window.VolnaApi.refreshMe();
        } catch {
          /* ignore */
        }
        await showAccountDashboard(data.user);
      } catch (err) {
        if (err && err.name === "AbortError") {
          showErr(loginErr, "Превышено время ожидания. Попробуйте позже.");
        } else {
          showErr(loginErr, "Нет связи с сервером. Проверьте подключение к интернету.");
        }
      } finally {
        setBusy(loginForm, false);
      }
    });
  }

  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      showErr(regErr, "");
      const fd = new FormData(regForm);
      const email = String(fd.get("email") || "").trim();
      const password = fd.get("password");
      const name = String(fd.get("name") || "").trim();

      if (!email) {
        showErr(regErr, "Укажите e-mail.");
        return;
      }
      if (!EMAIL_RE.test(email)) {
        showErr(regErr, "Некорректный e-mail.");
        return;
      }
      if (password == null || String(password).length < 6) {
        showErr(regErr, "Пароль от 6 символов.");
        return;
      }

      setBusy(regForm, true);
      try {
        const { res, data, apiLooksJson } = await apiJson("/api/register", {
          method: "POST",
          body: { email, password, name },
        });
        if (!res.ok) {
          showErr(regErr, httpErrorMessage(res, data, apiLooksJson));
          return;
        }
        if (
          !apiLooksJson ||
          !data ||
          typeof data.user !== "object" ||
          data.user === null ||
          Array.isArray(data.user)
        ) {
          showErr(regErr, "Сервер вернул неожиданный ответ. Попробуйте обновить страницу.");
          return;
        }
        try {
          if (window.VolnaApi && window.VolnaApi.refreshMe) await window.VolnaApi.refreshMe();
        } catch {
          /* ignore */
        }
        await showAccountDashboard(data.user);
      } catch (err) {
        if (err && err.name === "AbortError") {
          showErr(regErr, "Превышено время ожидания. Попробуйте позже.");
        } else {
          showErr(regErr, "Сеть: нет ответа.");
        }
      } finally {
        setBusy(regForm, false);
      }
    });
  }

  const dashboard = document.getElementById("account-dashboard");
  const authCard = document.getElementById("account-auth-card");
  const heroLead = document.getElementById("account-hero-lead");
  const greeting = document.getElementById("account-greeting");
  const orderList = document.getElementById("order-list");
  const orderDetail = document.getElementById("order-detail");
  const orderDetailBody = document.getElementById("order-detail-body");
  const ordersLoading = document.getElementById("orders-loading");
  const ordersEmpty = document.getElementById("orders-empty");
  const ordersErr = document.getElementById("orders-err");
  const orderDetailBack = document.getElementById("order-detail-back");
  const accountLogout = document.getElementById("account-logout");
  const fmtMoney = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts * 1000).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  function statusBadge(status, label) {
    const OS = window.OrderStatus;
    const cls = OS ? OS.badgeClass(status) : "order-status";
    const text = label || (OS ? OS.label(status) : status);
    return `<span class="${cls}">${escHtml(text)}</span>`;
  }

  function setAuthVisible(loggedIn) {
    if (dashboard) dashboard.hidden = !loggedIn;
    if (authCard) authCard.hidden = loggedIn;
    if (heroLead) {
      heroLead.textContent = loggedIn
        ? "История предзаказов и статусы"
        : "Вход в магазин или новая регистрация";
    }
  }

  function showOrdersList() {
    if (orderList) orderList.hidden = false;
    if (orderDetail) orderDetail.hidden = true;
  }

  async function loadOrders() {
    if (!orderList) return;
    if (ordersErr) ordersErr.hidden = true;
    if (ordersEmpty) ordersEmpty.hidden = true;
    if (ordersLoading) ordersLoading.hidden = false;
    orderList.innerHTML = "";

    try {
      const { res, data } = await apiJson("/api/my/orders");
      if (!res.ok) {
        if (ordersErr) {
          ordersErr.textContent = data.error || `Ошибка ${res.status}`;
          ordersErr.hidden = false;
        }
        return;
      }
      const orders = data.orders || [];
      if (!orders.length) {
        if (ordersEmpty) ordersEmpty.hidden = false;
        return;
      }
      orders.forEach((o) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "order-card";
        const sum = o.total != null ? fmtMoney.format(o.total) : "—";
        const items =
          o.itemsCount > 0
            ? `${o.itemsCount} ${o.itemsCount === 1 ? "товар" : o.itemsCount < 5 ? "товара" : "товаров"}`
            : "";
        card.innerHTML = `
          <div class="order-card__head">
            <span class="order-card__id">Заказ №${o.id}</span>
            ${statusBadge(o.status, o.statusLabel)}
          </div>
          <p class="order-card__meta">${escHtml(formatDate(o.createdAt))} · ${escHtml(sum)}${items ? ` · ${escHtml(items)}` : ""}</p>
          ${o.preview ? `<p class="order-card__preview">${escHtml(o.preview)}</p>` : ""}
        `;
        card.addEventListener("click", () => openOrderDetail(o.id));
        orderList.appendChild(card);
      });
    } catch {
      if (ordersErr) {
        ordersErr.textContent = "Не удалось загрузить заказы.";
        ordersErr.hidden = false;
      }
    } finally {
      if (ordersLoading) ordersLoading.hidden = true;
    }
  }

  async function openOrderDetail(id) {
    if (!orderDetail || !orderDetailBody) return;
    orderDetailBody.innerHTML = "<p class=\"account-dashboard__sub\">Загрузка…</p>";
    orderList.hidden = true;
    orderDetail.hidden = false;

    const { res, data } = await apiJson(`/api/my/orders?id=${encodeURIComponent(id)}`);
    if (!res.ok || !data.order) {
      orderDetailBody.innerHTML = `<p class="form__err">${escHtml(data.error || "Не найдено")}</p>`;
      return;
    }
    const o = data.order;
    const lines = Array.isArray(o.lines) ? o.lines : o.payload?.lines || [];
    const customer = o.payload?.customer || {};
    const linesHtml = lines.length
      ? `<table class="order-detail__table"><thead><tr><th>Товар</th><th>Размер</th><th>Кол-во</th><th>Цена</th></tr></thead><tbody>${lines
          .map((l) => {
            const price = l.unitPrice != null ? fmtMoney.format(l.unitPrice) : "—";
            const lineSum =
              l.unitPrice != null && l.qty ? fmtMoney.format(l.unitPrice * l.qty) : "—";
            return `<tr><td>${escHtml(l.title || "—")}</td><td>${escHtml(l.size || "—")}</td><td>${l.qty || 1}</td><td>${escHtml(lineSum)}</td></tr>`;
          })
          .join("")}</tbody></table>`
      : "<p>Нет позиций в заказе.</p>";

    orderDetailBody.innerHTML = `
      <div class="order-detail__head">
        <h3 class="order-detail__title">Заказ №${o.id}</h3>
        ${statusBadge(o.status, o.statusLabel)}
      </div>
      <p class="order-detail__meta">${escHtml(formatDate(o.createdAt))}</p>
      <p class="order-detail__total">Сумма: <strong>${o.total != null ? escHtml(fmtMoney.format(o.total)) : "—"}</strong></p>
      ${
        customer.name || customer.phone
          ? `<p class="order-detail__customer">${escHtml([customer.name, customer.phone, customer.email].filter(Boolean).join(" · "))}</p>`
          : ""
      }
      <h4 class="order-detail__subtitle">Состав</h4>
      ${linesHtml}
    `;
  }

  if (orderDetailBack) {
    orderDetailBack.addEventListener("click", () => {
      showOrdersList();
    });
  }

  if (accountLogout) {
    accountLogout.addEventListener("click", async () => {
      await apiJson("/api/logout", { method: "POST", body: {} });
      if (window.VolnaApi && window.VolnaApi.refreshMe) await window.VolnaApi.refreshMe();
      setAuthVisible(false);
      showOrdersList();
    });
  }

  async function showAccountDashboard(user) {
    if (!user || user.role === "admin") {
      if (user && user.role === "admin") {
        window.location.href = "admin.html";
      }
      return;
    }
    setAuthVisible(true);
    if (greeting) {
      greeting.textContent = user.name
        ? `Здравствуйте, ${user.name}`
        : `Вы вошли как ${user.email}`;
    }
    showOrdersList();
    await loadOrders();
    const q = new URLSearchParams(location.search).get("order");
    if (q) openOrderDetail(Number(q));
  }

  (async function initAccountView() {
    try {
      const { res, data } = await apiJson("/api/me");
      if (res.ok && data.user) {
        await showAccountDashboard(data.user);
      } else {
        setAuthVisible(false);
      }
    } catch {
      setAuthVisible(false);
    }
  })();
})();
