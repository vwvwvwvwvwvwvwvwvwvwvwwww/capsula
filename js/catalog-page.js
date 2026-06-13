(function () {
  let booted = false;
  function run() {
  if (booted) return;
  const CA = window.CatalogApi;
  if (!CA) return;

  const params = new URLSearchParams(location.search);
  const gParam = params.get("gender");
  if (gParam === "men" || gParam === "women") CA.setGender(gParam);

  const gender = CA.currentGender();
  const products = CA.byGender(gender);

  const grid = document.getElementById("catalog-grid");
  const chipsEl = document.getElementById("catalog-chips");
  const empty = document.getElementById("catalog-empty");
  const searchEl = document.getElementById("catalog-search");
  const sortEl = document.getElementById("catalog-sort");
  const labelEl = document.getElementById("catalog-gender-label");
  if (!grid || !chipsEl) return;

  if (labelEl) {
    labelEl.textContent = gender === "men" ? "Мужской раздел" : "Женский раздел";
  }

  const fmt = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
  const inCatalog = new Set(products.map((p) => p.category));
  const limeOrder = window.CATALOG_SECTIONS && window.CATALOG_SECTIONS[gender];
  const sectionCats = limeOrder
    ? limeOrder.filter((c) => inCatalog.has(c))
    : [...inCatalog].sort((a, b) => a.localeCompare(b, "ru"));
  const categories = ["Все", ...sectionCats];

  const state = {
    gender,
    category: params.get("category") && categories.includes(params.get("category")) ? params.get("category") : "Все",
    search: params.get("q") || "",
    sort: "default",
  };

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

  function syncUrl() {
    const u = new URL(location.href);
    u.searchParams.set("gender", state.gender);
    if (state.category === "Все") u.searchParams.delete("category");
    else u.searchParams.set("category", state.category);
    if (state.search.trim()) u.searchParams.set("q", state.search.trim());
    else u.searchParams.delete("q");
    history.replaceState(null, "", u.pathname + u.search);
  }

  function filtered() {
    let list = products.slice();
    if (state.category !== "Все") list = list.filter((p) => p.category === state.category);
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          String(p.description || "").toLowerCase().includes(q)
      );
    }
    if (state.sort === "price-asc") list.sort((a, b) => a.price - b.price);
    if (state.sort === "price-desc") list.sort((a, b) => b.price - a.price);
    if (state.sort === "name") list.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    return list;
  }

  function renderChips() {
    chipsEl.innerHTML = "";
    categories.forEach((cat) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (cat === state.category ? " is-active" : "");
      b.textContent = cat;
      b.addEventListener("click", () => {
        state.category = cat;
        syncUrl();
        renderChips();
        renderGrid();
      });
      chipsEl.appendChild(b);
    });
  }

  function renderGrid() {
    const list = filtered();
    empty.hidden = list.length > 0;
    grid.innerHTML = "";
    list.forEach((p, i) => {
      const wrap = document.createElement("div");
      wrap.className = "tile-product";
      const imgAttrs =
        i < 4
          ? 'loading="eager" fetchpriority="high" decoding="async"'
          : 'loading="lazy" decoding="async"';
      wrap.innerHTML = `
        <a href="product.html?id=${encodeURIComponent(p.id)}"><img class="tile-product__img" src="${attrUrl(p.image)}" alt="${esc(p.title)}" ${imgAttrs} width="400" height="533" /></a>
        <div class="tile-product__body">
          <a class="tile-product__head" href="product.html?id=${encodeURIComponent(p.id)}">
            <div class="tile-product__cat">${esc(p.category)}</div>
            <h3 class="tile-product__title">${esc(p.title)}</h3>
          </a>
          <p class="tile-product__price">${fmt.format(p.price)}</p>
          <button type="button" class="btn btn--sm btn--primary js-add-cart" data-id="${esc(p.id)}">В корзину</button>
        </div>
      `;
      grid.appendChild(wrap);
    });
    grid.querySelectorAll(".js-add-cart").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.CartCore.add(btn.dataset.id);
        if (window.updateCartBadge) window.updateCartBadge();
      });
    });
  }

  if (searchEl) {
    searchEl.value = state.search;
    searchEl.addEventListener("input", () => {
      state.search = searchEl.value;
      syncUrl();
      renderGrid();
    });
  }

  if (sortEl) {
    sortEl.addEventListener("change", () => {
      state.sort = sortEl.value;
      renderGrid();
    });
  }

  renderChips();
  renderGrid();
  syncUrl();
  booted = true;
  if (window.VolnaMotion && window.VolnaMotion.scan) window.VolnaMotion.scan(document.body);
  }
  document.addEventListener("DOMContentLoaded", run, { once: true });
  window.addEventListener("volna:catalog", run);
})();
