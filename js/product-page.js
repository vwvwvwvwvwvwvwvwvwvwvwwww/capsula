(function () {
  function run() {
    const CA = window.CatalogApi;
    const SC = window.SizeCharts;
    const root = document.getElementById("product-root");
    const missing = document.getElementById("product-missing");
    if (!root || !missing || !CA) return;

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const p = CA.find(id);

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

    if (!p) {
      missing.hidden = false;
      return;
    }

    CA.setGender(p.gender || "women");

    missing.hidden = true;
    document.title = `${p.title} — Капсула`;
    const backHref = `catalog.html?gender=${encodeURIComponent(p.gender || "women")}`;

    const sizes = SC ? SC.productSizes(p) : p.sizes || ["M"];
    const chartId = SC ? SC.resolveChartId(p) : p.sizeChart;
    const chart = SC ? SC.getChart(chartId) : null;
    let selectedSize = sizes[0];

    function sizeButtonsHtml() {
      return sizes
        .map((s) => {
          const active = s === selectedSize;
          return `<button type="button" class="size-picker__btn${active ? " is-active" : ""}" data-size="${esc(s)}" aria-pressed="${active ? "true" : "false"}">${esc(s)}</button>`;
        })
        .join("");
    }

    function updateSizeUi(rootEl) {
      const active = selectedSize;
      rootEl.querySelectorAll(".size-picker__btn").forEach((b) => {
        const on = b.dataset.size === active;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const val = rootEl.querySelector("#size-selected");
      if (val) val.textContent = active;
      const cartSize = rootEl.querySelector("#cart-size-label");
      if (cartSize) cartSize.textContent = active;
      const table = rootEl.querySelector("#size-chart-table");
      if (table && SC) table.innerHTML = SC.renderChartTableHtml(chart, active);
      const err = rootEl.querySelector("#size-err");
      if (err) err.hidden = true;
    }

    function chartBlockHtml() {
      if (!chart || !SC) return "";
      return `
        <details class="size-chart">
          <summary class="size-chart__toggle">Таблица размеров · ${esc(chart.title)}</summary>
          <div class="size-chart__body" id="size-chart-table">
            ${SC.renderChartTableHtml(chart, selectedSize)}
          </div>
        </details>`;
    }

    function relatedProducts() {
      const sameGender = CA.byGender(p.gender || "women").filter((item) => item.id !== p.id);
      const sameCategory = sameGender.filter((item) => item.category === p.category);
      const pool = sameCategory.length >= 4 ? sameCategory : sameCategory.concat(sameGender);
      const seen = new Set();
      return pool
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .slice(0, 4);
    }

    function relatedHtml() {
      const list = relatedProducts();
      if (!list.length) return "";
      const cards = list
        .map(
          (item) => `
            <article class="related-card">
              <a class="related-card__image-link" href="product.html?id=${encodeURIComponent(item.id)}">
                <img class="related-card__img" src="${attrUrl(item.image)}" alt="${esc(item.title)}" loading="lazy" width="320" height="426" />
              </a>
              <a class="related-card__body" href="product.html?id=${encodeURIComponent(item.id)}">
                <span class="related-card__cat">${esc(item.category)}</span>
                <strong class="related-card__title">${esc(item.title)}</strong>
                <span class="related-card__price">${fmt.format(item.price)}</span>
              </a>
            </article>`
        )
        .join("");
      return `
        <section class="product-related" aria-label="Похожие товары">
          <div class="product-related__head">
            <div>
              <p class="product-related__eyebrow">Вам может понравиться</p>
              <h2 class="product-related__title">Похожие товары</h2>
            </div>
            <a class="product-related__all" href="catalog.html?gender=${encodeURIComponent(p.gender || "women")}&category=${encodeURIComponent(p.category || "")}">Весь раздел</a>
          </div>
          <div class="product-related__grid">${cards}</div>
        </section>`;
    }

    function render() {
      root.innerHTML = `
    <div>
      <img class="product-page__img" src="${attrUrl(p.image)}" alt="${esc(p.title)}" width="720" height="960" />
    </div>
    <div>
      <p class="product-page__cat">${esc(p.category)} · ${p.gender === "men" ? "Мужское" : "Женское"}</p>
      <h1 class="product-page__title">${esc(p.title)}</h1>
      <p class="product-page__price">${fmt.format(p.price)}</p>
      <p class="product-page__desc">${esc(p.description || "")}</p>
      <div class="product-page__sizes">
        <div class="size-selected-banner" aria-live="polite">
          <span class="size-selected-banner__label">Ваш размер</span>
          <span class="size-selected-banner__value" id="size-selected">${esc(selectedSize)}</span>
        </div>
        <p class="size-picker__hint">Нажмите на размер, чтобы изменить</p>
        <div class="size-picker" id="size-picker" role="group" aria-label="Выбор размера">
          ${sizeButtonsHtml()}
        </div>
      </div>
      ${chartBlockHtml()}
      <div class="product-page__actions">
        <button type="button" class="btn btn--primary" id="btn-add-cart">В корзину · <span id="cart-size-label">${esc(selectedSize)}</span></button>
        <a class="btn btn--outline" href="${backHref}">Назад в каталог</a>
      </div>
      <p class="product-page__size-hint" id="size-err" hidden role="alert">Выберите размер</p>
    </div>
    ${relatedHtml()}
  `;

      root.querySelectorAll(".size-picker__btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedSize = btn.dataset.size;
          updateSizeUi(root);
        });
      });

      const addBtn = document.getElementById("btn-add-cart");
      addBtn.addEventListener("click", () => {
        if (!selectedSize) {
          const err = root.querySelector("#size-err");
          if (err) err.hidden = false;
          return;
        }
        window.CartCore.add(p.id, selectedSize);
        if (window.updateCartBadge) window.updateCartBadge();
        addBtn.classList.add("is-added");
        const prev = addBtn.dataset.label || addBtn.textContent;
        if (!addBtn.dataset.label) addBtn.dataset.label = prev;
        addBtn.textContent = `Добавлено · ${selectedSize}`;
        window.setTimeout(() => {
          addBtn.classList.remove("is-added");
          addBtn.innerHTML = `В корзину · <span id="cart-size-label">${esc(selectedSize)}</span>`;
        }, 1600);
      });
    }

    render();
  }
  window.addEventListener("sitechrome:mounted", run, { once: true });
  document.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("product-root");
    if (root && root.querySelector("#product-missing") && !root.querySelector("#product-missing").hidden) {
      const id = new URLSearchParams(location.search).get("id");
      if (id) run();
    }
  }, { once: true });
})();
