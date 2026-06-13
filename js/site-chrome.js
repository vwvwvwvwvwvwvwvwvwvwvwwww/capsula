/**
 * Общая шапка/подвал для всех страниц (один источник разметки).
 */
(function () {
  const PAGES = [
    { href: "index.html", label: "Главная" },
    { href: "catalog.html", label: "Каталог" },
    { href: "preorder.html", label: "Предзаказ" },
    { href: "about.html", label: "О бренде" },
    { href: "cart.html", label: "Корзина" },
    { href: "account.html", label: "Аккаунт" },
  ];

  function currentFile() {
    let p = (location.pathname || "").split("/").pop();
    if (!p || p === "") p = "index.html";
    return p;
  }

  function cartCount() {
    return window.CartCore ? window.CartCore.totalQty() : 0;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCategoryStrip() {
    const strip = document.getElementById("site-cat-strip");
    if (!strip || !window.CatalogApi) return;
    const g = window.CatalogApi.currentGender();
    const prods = window.CatalogApi.byGender(g);
    const inCatalog = new Set(prods.map((p) => p.category));
    const limeOrder = window.CATALOG_SECTIONS && window.CATALOG_SECTIONS[g];
    const cats = limeOrder
      ? limeOrder.filter((c) => inCatalog.has(c))
      : [...inCatalog].sort((a, b) => a.localeCompare(b, "ru"));
    strip.innerHTML = cats
      .map(
        (c) =>
          `<a class="site-cat-pill" href="catalog.html?gender=${encodeURIComponent(g)}&category=${encodeURIComponent(c)}">${escapeHtml(c)}</a>`
      )
      .join("");
  }

  function renderHeader() {
    const root = document.getElementById("site-header-root");
    if (!root) return;
    const cur = currentFile();
    const hideGenderNav = cur === "admin.html";
    const navItems = PAGES.map(
      (item) =>
        `<li><a class="site-nav__link${item.href === cur ? " is-active" : ""}" href="${item.href}">${item.label}</a></li>`
    ).join("");

    const gNav = window.CatalogApi ? window.CatalogApi.currentGender() : "women";
    const womenActive = gNav === "women" ? " is-active" : "";
    const menActive = gNav === "men" ? " is-active" : "";

    const genderBlock = hideGenderNav
      ? ""
      : `
        <div class="site-wrap site-gender-row">
          <nav class="site-gender" aria-label="Женское и мужское">
            <a class="site-gender__tab${womenActive}" href="catalog.html?gender=women">Женское</a>
            <a class="site-gender__tab${menActive}" href="catalog.html?gender=men">Мужское</a>
          </nav>
        </div>
        <div class="site-subnav">
          <div class="site-wrap site-subnav__scroll" id="site-cat-strip"></div>
        </div>`;

    root.innerHTML = `
      <div class="site-topbar">
        <div class="site-wrap site-topbar__inner">
          <span>Доставка по РФ · Оплата при получении · На сайте только предзаказ</span>
          <a class="site-topbar__phone" href="tel:+79000000000">+7 (900) 000-00-00</a>
        </div>
      </div>
      <header class="site-header">
        <div class="site-wrap site-header__row">
          <a class="site-logo" href="index.html">КАПСУЛА</a>
          <nav class="site-nav" aria-label="Разделы">
            <button type="button" class="site-nav__burger" id="site-nav-burger" aria-expanded="false" aria-controls="site-nav-list">Меню</button>
            <ul class="site-nav__list" id="site-nav-list">${navItems}</ul>
          </nav>
          <div class="site-header__tools">
            <a class="site-icon-link" href="catalog.html?gender=${encodeURIComponent(gNav)}" title="Каталог">Поиск</a>
            <span class="site-auth-slot" id="site-auth-slot"></span>
            <a class="site-cart-link" href="cart.html">Корзина <span class="site-cart-badge" id="site-cart-badge">${cartCount()}</span></a>
          </div>
        </div>
        ${genderBlock}
      </header>
    `;

    if (!hideGenderNav) renderCategoryStrip();

    const burger = document.getElementById("site-nav-burger");
    const list = document.getElementById("site-nav-list");
    if (burger && list) {
      burger.addEventListener("click", () => {
        const open = list.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      list.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
        list.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      }));
    }
  }

  function renderFooter() {
    const root = document.getElementById("site-footer-root");
    if (!root) return;
    root.innerHTML = `
      <footer class="site-footer">
        <div class="site-wrap site-footer__grid">
          <div>
            <div class="site-logo site-logo--footer">КАПСУЛА</div>
            <p class="site-footer__muted">Женское и мужское. Доставка по России.</p>
          </div>
          <div>
            <div class="site-footer__h">Покупателям</div>
            <ul class="site-footer__links">
              <li><a href="catalog.html?gender=women">Женское</a></li>
              <li><a href="catalog.html?gender=men">Мужское</a></li>
              <li><a href="preorder.html">Как заказать</a></li>
              <li><a href="cart.html">Корзина</a></li>
              <li><a href="account.html">Личный кабинет</a></li>
            </ul>
          </div>
          <div>
            <div class="site-footer__h">Компания</div>
            <ul class="site-footer__links">
              <li><a href="about.html">О бренде</a></li>
              <li><a href="admin.html" id="footer-admin-link" hidden>Админ-панель</a></li>
            </ul>
          </div>
          <div>
            <div class="site-footer__h">Контакты</div>
            <p>hello@kapsula.ru<br />+7 (900) 000-00-00</p>
          </div>
        </div>
        <div class="site-footer__bar">
          <div class="site-wrap site-footer__bar-inner">© КАПСУЛА, 2026</div>
        </div>
      </footer>
    `;
  }

  function mount() {
    renderHeader();
    renderFooter();
    window.dispatchEvent(new CustomEvent("sitechrome:mounted"));

    if (window.CatalogApi && typeof window.CatalogApi.hydrateFromServer === "function") {
      window.CatalogApi.hydrateFromServer().then((updated) => {
        if (!updated) return;
        renderCategoryStrip();
        window.dispatchEvent(new CustomEvent("volna:catalog"));
      });
    }
  }

  window.updateCartBadge = function () {
    const el = document.getElementById("site-cart-badge");
    if (el) el.textContent = String(cartCount());
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
