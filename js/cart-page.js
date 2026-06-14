(function () {
  function run() {
  const linesEl = document.getElementById("cart-lines");
  const emptyEl = document.getElementById("cart-empty");
  const aside = document.getElementById("cart-aside");
  const sumEl = document.getElementById("cart-sum");
  const form = document.getElementById("preorder-form");
  const okEl = document.getElementById("preorder-success");
  if (!linesEl || !emptyEl || !aside || !sumEl || !form || !okEl) return;

  const fmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attrUrl(u) {
    return String(u).replace(/"/g, "");
  }

  function render() {
    const cart = window.CartCore.load();
    const has = cart.length > 0;
    emptyEl.hidden = has;
    aside.hidden = !has;
    linesEl.innerHTML = "";
    sumEl.textContent = fmt.format(window.CartCore.sum());

    cart.forEach((line) => {
      const p = window.CartCore.findProduct(line.id);
      const title = p ? p.title : line.snapshot.title;
      const price = p ? p.price : line.snapshot.price;
      const img = p ? p.image : line.snapshot.image;
      const sizeLabel = line.size || line.snapshot?.size || "";
      const sizeHtml = sizeLabel ? ` · размер ${esc(sizeLabel)}` : "";
      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `
        <img class="cart-line__img" src="${attrUrl(img)}" alt="" width="100" height="125" loading="lazy" />
        <div>
          <p class="cart-line__title">${esc(title)} × ${line.qty}${sizeHtml}</p>
          <p class="cart-line__meta">${fmt.format(price * line.qty)}</p>
          <button type="button" class="cart-line__remove" data-id="${esc(line.id)}" data-size="${esc(sizeLabel)}">Удалить</button>
        </div>
      `;
      linesEl.appendChild(row);
    });

    linesEl.querySelectorAll(".cart-line__remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.CartCore.remove(btn.dataset.id, btn.dataset.size);
        render();
        if (window.updateCartBadge) window.updateCartBadge();
      });
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    okEl.hidden = true;
    const cart = window.CartCore.load();
    if (!cart.length) return;

    const fd = new FormData(form);
    const raw = Object.fromEntries(fd.entries());
    const paymentMethod = String(raw.paymentMethod || "").trim();
    const deliveryMethod = String(raw.deliveryMethod || "").trim();
    if (!paymentMethod) {
      okEl.hidden = false;
      okEl.textContent = "Выберите способ оплаты.";
      okEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!deliveryMethod) {
      okEl.hidden = false;
      okEl.textContent = "Выберите способ доставки.";
      okEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const customer = {
      name: raw.name,
      phone: raw.phone,
      email: raw.email,
      city: raw.city,
      comment: raw.comment,
      paymentMethod,
      deliveryMethod,
    };
    const payload = {
      customer,
      lines: cart.map((l) => {
        const p = window.CartCore.findProduct(l.id);
        return {
          id: l.id,
          qty: l.qty,
          size: l.size || l.snapshot?.size || "",
          title: p ? p.title : l.snapshot.title,
          unitPrice: p ? p.price : l.snapshot.price,
        };
      }),
      total: window.CartCore.sum(),
      createdAt: new Date().toISOString(),
    };

    let serverMsg = "";
    if (window.VolnaApi && window.VolnaApi.submitPreorder) {
      const r = await window.VolnaApi.submitPreorder(payload);
      if (r.ok) {
        serverMsg = `Сохранено в базе, номер заявки: ${r.id}.`;
        if (r.mail?.ok) {
          serverMsg += " Уведомление отправлено на e-mail.";
        } else if (r.mail?.skipped) {
          serverMsg += " Почта на сервере не настроена — заявка сохранена, письмо не отправлено.";
        } else if (r.mail?.outbox?.length) {
          serverMsg += " SMTP недоступен — письмо сохранено в очередь на сервере.";
        } else if (r.mail?.error) {
          serverMsg += ` Письмо не отправилось (${r.mail.error}), заявка сохранена.`;
        }
      }
      else if (r.error !== "offline") {
        okEl.hidden = false;
        okEl.textContent =
          (r.error || "Ошибка сервера.") + " Заявка сохранена только в браузере.";
        try {
          localStorage.setItem("volna_last_preorder", JSON.stringify(payload));
        } catch (_) {}
        window.CartCore.clear();
        render();
        if (window.updateCartBadge) window.updateCartBadge();
        if (window.VolnaApi.refreshMe) window.VolnaApi.refreshMe();
        form.reset();
        return;
      }
    }

    try {
      localStorage.setItem("volna_last_preorder", JSON.stringify(payload));
    } catch (_) {}

    const accountHint = serverMsg && serverMsg.includes("номер")
      ? ' <a href="account.html">Смотреть в аккаунте →</a>'
      : "";
    const successHtml = serverMsg
      ? `Заявка принята. ${serverMsg}${accountHint}`
      : "Заявка принята. Сейчас сервер недоступен — попробуйте отправить заявку позже.";
    window.CartCore.clear();
    render();
    okEl.innerHTML = successHtml;
    okEl.hidden = false;
    okEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (window.updateCartBadge) window.updateCartBadge();
    if (window.VolnaApi && window.VolnaApi.refreshMe) window.VolnaApi.refreshMe();
    form.reset();
  });

  render();
  }
  window.addEventListener("sitechrome:mounted", run, { once: true });
})();
