(function () {
  const gate = document.getElementById("admin-gate");
  const content = document.getElementById("admin-content");
  const usersBody = document.querySelector("#admin-users-table tbody");
  const preBody = document.querySelector("#admin-preorders-table tbody");
  const usersErr = document.getElementById("admin-users-err");
  const preErr = document.getElementById("admin-preorders-err");
  const detail = document.getElementById("admin-preorder-detail");

  const productsBody = document.querySelector("#admin-products-table tbody");
  const productsErr = document.getElementById("admin-products-err");
  const productsOk = document.getElementById("admin-products-ok");
  const btnSaveProducts = document.getElementById("admin-products-save");
  const btnAddProduct = document.getElementById("admin-products-add");
  const mailStatusEl = document.getElementById("admin-mail-status");
  const mailTestBtn = document.getElementById("admin-mail-test");
  const mailErr = document.getElementById("admin-mail-err");
  const mailOk = document.getElementById("admin-mail-ok");

  let catalogDraft = [];

  async function apiJson(url, options = {}) {
    const { method = "GET", body } = options;
    const opts = { method, credentials: "include" };
    if (body !== undefined) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(
      typeof window.volnaApiUrl === "function" ? window.volnaApiUrl(url) : url,
      opts
    );
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
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cloneCatalog(src) {
    return JSON.parse(JSON.stringify(src || []));
  }

  function showProductsErr(msg) {
    if (!productsErr) return;
    productsErr.textContent = msg || "";
    productsErr.hidden = !msg;
    if (productsOk) {
      productsOk.hidden = true;
      productsOk.textContent = "";
    }
  }

  function showProductsOk(msg) {
    if (!productsOk) return;
    productsOk.textContent = msg || "";
    productsOk.hidden = !msg;
    if (productsErr) {
      productsErr.hidden = true;
      productsErr.textContent = "";
    }
  }

  async function loadProductCatalog() {
    if (!productsBody) return;
    showProductsErr("");
    const { res, data } = await apiJson("/api/products");
    if (!res.ok) {
      showProductsErr(data.error || "Не удалось загрузить каталог");
      catalogDraft = [];
      productsBody.innerHTML = "";
      return;
    }
    catalogDraft = cloneCatalog(data.products || []);
    renderProductsTable();
  }

  function renderProductsTable() {
    if (!productsBody) return;
    productsBody.innerHTML = "";
    const fmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
    catalogDraft.forEach((p, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${esc(p.id)}</code></td>
        <td>${esc(p.title)}</td>
        <td>${esc(fmt.format(p.price))}</td>
        <td>${p.gender === "men" ? "men" : "women"}</td>
        <td>${esc(p.category)}</td>
        <td>
          <button type="button" class="btn-link js-pe" data-i="${index}">Изменить</button>
          ·
          <button type="button" class="btn-link js-pd" data-i="${index}">Удалить</button>
        </td>`;
      productsBody.appendChild(tr);
    });
    productsBody.querySelectorAll(".js-pe").forEach((btn) => {
      btn.addEventListener("click", () => openProductModal(Number(btn.dataset.i)));
    });
    productsBody.querySelectorAll(".js-pd").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.i);
        if (!Number.isFinite(i) || i < 0 || i >= catalogDraft.length) return;
        if (confirm(`Удалить товар «${catalogDraft[i].title}» из черновика? (сохраните каталог кнопкой ниже)`)) {
          catalogDraft.splice(i, 1);
          renderProductsTable();
          showProductsOk("");
        }
      });
    });
  }

  function openProductModal(index) {
    const isNew = index < 0 || index >= catalogDraft.length;
    const p = isNew
      ? {
          id: `n${Date.now().toString(36)}`,
          gender: "women",
          title: "",
          category: "",
          price: 1990,
          image: "",
          description: "",
          sizeChart: "women_clothing",
          sizes: ["XS", "S", "M", "L", "XL"],
        }
      : { ...catalogDraft[index] };

    const backdrop = document.createElement("div");
    backdrop.className = "admin-modal-backdrop";
    backdrop.setAttribute("role", "presentation");
    const modal = document.createElement("div");
    modal.className = "admin-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "admin-product-edit-title");
    modal.innerHTML = `
      <h2 class="admin-modal__title" id="admin-product-edit-title">${isNew ? "Новый товар" : "Редактирование"}</h2>
      <form class="admin-modal__form" id="admin-product-form">
        <div class="form__row">
          <label for="pf-id">ID (в URL карточки)</label>
          <input id="pf-id" name="id" required autocomplete="off" ${isNew ? "" : "readonly"} />
        </div>
        <div class="form__row">
          <label for="pf-title">Название</label>
          <input id="pf-title" name="title" required />
        </div>
        <div class="form__row">
          <label for="pf-price">Цена (₽)</label>
          <input id="pf-price" name="price" type="number" min="0" step="1" required />
        </div>
        <div class="form__row">
          <label for="pf-gender">Раздел</label>
          <select id="pf-gender" name="gender">
            <option value="women">women (женский каталог)</option>
            <option value="men">men (мужской каталог)</option>
          </select>
        </div>
        <div class="form__row">
          <label for="pf-category">Категория</label>
          <input id="pf-category" name="category" required />
        </div>
        <div class="form__row">
          <label for="pf-image">URL картинки</label>
          <input id="pf-image" name="image" required />
        </div>
        <div class="form__row">
          <label for="pf-sizes">Размеры (через запятую)</label>
          <input id="pf-sizes" name="sizes" placeholder="XS, S, M, L, XL" />
        </div>
        <div class="form__row">
          <label for="pf-sizechart">Тип размерной сетки</label>
          <select id="pf-sizechart" name="sizeChart">
            <option value="women_clothing">women_clothing</option>
            <option value="women_bottoms">women_bottoms</option>
            <option value="women_skirts">women_skirts</option>
            <option value="women_shoes">women_shoes</option>
            <option value="men_clothing">men_clothing</option>
            <option value="men_bottoms">men_bottoms</option>
            <option value="men_shoes">men_shoes</option>
            <option value="one_size">one_size</option>
          </select>
        </div>
        <div class="form__row">
          <label for="pf-desc">Описание</label>
          <textarea id="pf-desc" name="description" rows="3"></textarea>
        </div>
        <div class="admin-modal__actions">
          <button type="submit" class="btn btn--primary btn--sm">Сохранить в черновике</button>
          <button type="button" class="btn btn--ghost btn--sm" id="admin-product-cancel">Отмена</button>
        </div>
      </form>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const form = modal.querySelector("#admin-product-form");
    modal.querySelector("#pf-id").value = p.id;
    modal.querySelector("#pf-title").value = p.title;
    modal.querySelector("#pf-price").value = String(p.price);
    modal.querySelector("#pf-gender").value = p.gender === "men" ? "men" : "women";
    modal.querySelector("#pf-category").value = p.category;
    modal.querySelector("#pf-image").value = p.image;
    modal.querySelector("#pf-desc").value = p.description || "";
    modal.querySelector("#pf-sizes").value = Array.isArray(p.sizes) ? p.sizes.join(", ") : "";
    modal.querySelector("#pf-sizechart").value = p.sizeChart || "women_clothing";

    function close() {
      backdrop.remove();
    }

    modal.querySelector("#admin-product-cancel").addEventListener("click", close);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const next = {
        id: String(modal.querySelector("#pf-id").value || "").trim(),
        title: String(modal.querySelector("#pf-title").value || "").trim(),
        price: Math.round(Number(modal.querySelector("#pf-price").value)),
        gender: modal.querySelector("#pf-gender").value === "men" ? "men" : "women",
        category: String(modal.querySelector("#pf-category").value || "").trim(),
        image: String(modal.querySelector("#pf-image").value || "").trim(),
        description: String(modal.querySelector("#pf-desc").value || "").trim(),
        sizeChart: String(modal.querySelector("#pf-sizechart").value || "women_clothing").trim(),
        sizes: String(modal.querySelector("#pf-sizes").value || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (!next.id) return;
      if (isNew) {
        if (catalogDraft.some((x) => x.id === next.id)) {
          alert("Такой id уже есть.");
          return;
        }
        catalogDraft.push(next);
      } else {
        const oldId = catalogDraft[index].id;
        if (next.id !== oldId && catalogDraft.some((x) => x.id === next.id)) {
          alert("Такой id уже занят другим товаром.");
          return;
        }
        catalogDraft[index] = next;
      }
      renderProductsTable();
      showProductsOk("");
      close();
    });
  }

  async function saveProductCatalog() {
    if (!btnSaveProducts) return;
    showProductsErr("");
    showProductsOk("");
    btnSaveProducts.disabled = true;
    try {
      const { res, data } = await apiJson("/api/admin/products", {
        method: "PUT",
        body: { products: catalogDraft },
      });
      if (!res.ok) {
        showProductsErr(data.error || `Ошибка ${res.status}`);
        return;
      }
      catalogDraft = cloneCatalog(data.products || catalogDraft);
      if (Array.isArray(data.products)) {
        window.CATALOG_PRODUCTS = data.products;
        try {
          window.dispatchEvent(new CustomEvent("volna:catalog"));
        } catch (_) {}
      }
      showProductsOk("Каталог сохранён на сервере.");
      renderProductsTable();
    } finally {
      btnSaveProducts.disabled = false;
    }
  }

  async function loadMailStatus() {
    if (!mailStatusEl) return;
    const { res, data } = await apiJson("/api/admin/mail-status");
    if (!res.ok) {
      mailStatusEl.textContent = data.error || "Не удалось проверить почту";
      return;
    }
    if (!data.configured) {
      const providers = (data.supportedProviders || [])
        .map((p) => p.label)
        .join(", ");
      mailStatusEl.innerHTML =
        "<strong>Почта не настроена.</strong> Письма не отправляются — заявки только в базе.<br>" +
        "<strong>Railway Hobby блокирует SMTP.</strong> Для России: <code>UNISENDER_GO_API_KEY</code> (go.unisender.ru).<br>" +
        "Или <code>UNISENDER_API_KEY</code> + <code>UNISENDER_LIST_ID</code> (unisender.com, бесплатно). Контакты в список добавляются автоматически.<br>" +
        "Или тариф Railway Pro для SMTP Mail.ru.<br>" +
        (providers ? `SMTP-провайдеры (только Pro): ${esc(providers)}.` : "");
      if (mailTestBtn) mailTestBtn.hidden = true;
      return;
    }
    const diag = data.envDiag || {};
    const lines = [
      data.transport === "https"
        ? `Транспорт: <strong>${esc(data.providerLabel || "HTTPS API")}</strong> (HTTPS API)`
        : data.providerLabel
          ? `Провайдер: <strong>${esc(data.providerLabel)}</strong>${data.autoDetected ? " (хост по e-mail)" : ""}`
          : null,
      data.transport === "https"
        ? `Отправитель: ${esc(data.user)}`
        : `SMTP: ${esc(data.host)}:${data.port}, от ${esc(data.user)}`,
      `Получатель заявок (MAIL_TO): ${esc(data.mailTo || "—")}`,
      diag.forcedSmtp ? "Режим: <strong>MAIL_TRANSPORT=smtp</strong> (UniSender игнорируется)" : null,
      data.verified
        ? "<strong style=\"color:var(--ok,#0a7)\">Подключение успешно — письма должны уходить.</strong>"
        : `<strong style="color:var(--err,#c00)">Ошибка:</strong> ${esc(data.error || "неизвестно")}`,
    ].filter(Boolean);
    if (!data.verified && data.authHint) {
      lines.push(esc(data.authHint));
    }
    if (data.transport === "https" && (diag.hasUnisenderGo || diag.hasUnisenderClassic)) {
      lines.push(
        "<strong style=\"color:var(--err,#c00)\">В Railway всё ещё заданы UNISENDER_* переменные.</strong> " +
          "Удалите их, добавьте <code>MAIL_TRANSPORT=smtp</code> и сделайте <strong>Redeploy</strong>.",
      );
    }
    mailStatusEl.innerHTML = lines.map((l) => `<span style="display:block;margin:0 0 6px">${l}</span>`).join("");
    if (mailTestBtn) mailTestBtn.hidden = !data.verified;
  }

  async function init() {
    const me = await apiJson("/api/me");
    const user = me.data.user;
    if (!user || user.role !== "admin") {
      gate.textContent = "Доступ запрещён. Войдите под учётной записью администратора.";
      return;
    }
    gate.hidden = true;
    content.hidden = false;

    void loadMailStatus();
    if (mailTestBtn && !mailTestBtn.dataset.bound) {
      mailTestBtn.dataset.bound = "1";
      mailTestBtn.addEventListener("click", async () => {
        if (mailErr) mailErr.hidden = true;
        if (mailOk) mailOk.hidden = true;
        mailTestBtn.disabled = true;
        const { res, data } = await apiJson("/api/admin/test-mail", { method: "POST", body: {} });
        mailTestBtn.disabled = false;
        if (!res.ok || !data.ok) {
          if (mailErr) {
            mailErr.textContent = data.error || "Не удалось отправить тестовое письмо";
            mailErr.hidden = false;
          }
          return;
        }
        if (mailOk) {
          mailOk.textContent = "Тестовое письмо отправлено. Проверьте входящие и папку «Спам».";
          mailOk.hidden = false;
        }
        await loadMailStatus();
      });
    }

    const ur = await apiJson("/api/admin/users");
    if (!ur.res.ok) {
      usersErr.textContent = ur.data.error || "Ошибка";
      usersErr.hidden = false;
    } else if (usersBody) {
      usersBody.innerHTML = "";
      const roleLabel = (r) => (r === "admin" ? "админ" : "клиент");
      (ur.data.users || []).forEach((u) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${u.id}</td><td>${esc(u.email)}</td><td>${esc(u.name || "")}</td><td>${esc(roleLabel(u.role))}</td>`;
        usersBody.appendChild(tr);
      });
    }

    const pr = await apiJson("/api/admin/preorders");
    if (!pr.res.ok) {
      preErr.textContent = pr.data.error || "Ошибка";
      preErr.hidden = false;
    } else if (preBody) {
      preBody.innerHTML = "";
      const statusOptions = [
        ["new", "Новый"],
        ["confirmed", "Подтверждён"],
        ["processing", "В обработке"],
        ["ready", "Готов к выдаче"],
        ["completed", "Выполнен"],
        ["cancelled", "Отменён"],
      ];
      (pr.data.preorders || []).forEach((p) => {
        const tr = document.createElement("tr");
        const email = p.userEmail || "гость";
        const client = p.customerName ? `${p.customerName} · ${email}` : email;
        const phone = String(p.customerPhone || "").trim();
        const telHref = phone.replace(/[^\d+]/g, "");
        const phoneHtml = phone
          ? `<a class="admin-phone-link" href="tel:${esc(telHref)}">${esc(phone)}</a>`
          : '<span class="admin-muted">не указан</span>';
        const sum = p.total != null ? `${p.total} ₽` : "—";
        let dateStr = "—";
        if (p.createdAt) {
          try {
            dateStr = new Date(p.createdAt * 1000).toLocaleString("ru-RU");
          } catch {
            dateStr = String(p.createdAt);
          }
        }
        const payment = p.paymentLabel || "—";
        const delivery = p.deliveryLabel || "—";
        const opts = statusOptions
          .map(
            ([v, label]) =>
              `<option value="${v}"${p.status === v ? " selected" : ""}>${esc(label)}</option>`
          )
          .join("");
        tr.innerHTML = `<td>${p.id}</td><td>${esc(client)}</td><td>${phoneHtml}</td><td>${esc(delivery)}</td><td>${esc(payment)}</td><td><select class="admin-status-select" data-id="${p.id}">${opts}</select></td><td>${esc(sum)}</td><td>${esc(dateStr)}</td><td><button type="button" class="btn-link js-po" data-id="${p.id}">JSON</button></td>`;
        preBody.appendChild(tr);
      });
      preBody.querySelectorAll(".admin-status-select").forEach((sel) => {
        sel.addEventListener("change", async () => {
          const id = sel.dataset.id;
          const status = sel.value;
          sel.disabled = true;
          const { res, data } = await apiJson("/api/admin/preorder/status", {
            method: "PATCH",
            body: { id: Number(id), status },
          });
          sel.disabled = false;
          if (!res.ok) {
            alert(data.error || "Не удалось обновить статус");
            return;
          }
          if (data.mail?.ok) {
            const hint = document.createElement("p");
            hint.className = "admin-inline-ok";
            hint.textContent = `Статус обновлён. Клиенту отправлено письмо: ${data.mail.to}`;
            preErr.hidden = true;
            preErr.insertAdjacentElement("afterend", hint);
            window.setTimeout(() => hint.remove(), 5000);
          } else if (data.mail?.error) {
            alert(`Статус сохранён, но письмо не ушло: ${data.mail.error}`);
          } else if (data.mail?.skipped && data.mail?.error) {
            alert(`Статус сохранён. Письмо не отправлено: ${data.mail.error}`);
          }
        });
      });
      preBody.querySelectorAll(".js-po").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const { res, data } = await apiJson(`/api/admin/preorder?id=${encodeURIComponent(btn.dataset.id)}`);
          if (!res.ok) {
            detail.textContent = data.error || "Ошибка";
            detail.hidden = false;
            return;
          }
          detail.textContent = JSON.stringify(data.payload, null, 2);
          detail.hidden = false;
        });
      });
    }

    await loadProductCatalog();
    if (btnAddProduct) btnAddProduct.addEventListener("click", () => openProductModal(-1));
    if (btnSaveProducts) btnSaveProducts.addEventListener("click", saveProductCatalog);
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0), { once: true });
})();
