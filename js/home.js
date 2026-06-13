(function () {
  function run() {
    const CA = window.CatalogApi;
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

    function fillGrid(gridEl, list) {
      if (!gridEl) return;
      gridEl.innerHTML = "";
      list.forEach((p) => {
        const wrap = document.createElement("div");
        wrap.className = "tile-product";
        wrap.innerHTML = `
        <a href="product.html?id=${encodeURIComponent(p.id)}"><img class="tile-product__img" src="${attrUrl(p.image)}" alt="${esc(p.title)}" loading="lazy" width="400" height="533" /></a>
        <div class="tile-product__body">
          <a class="tile-product__head" href="product.html?id=${encodeURIComponent(p.id)}">
            <div class="tile-product__cat">${esc(p.category)}</div>
            <h3 class="tile-product__title">${esc(p.title)}</h3>
          </a>
          <p class="tile-product__price">${fmt.format(p.price)}</p>
          <button type="button" class="btn btn--sm btn--primary js-add-cart" data-id="${esc(p.id)}">В корзину</button>
        </div>
      `;
        gridEl.appendChild(wrap);
      });
      gridEl.querySelectorAll(".js-add-cart").forEach((btn) => {
        btn.addEventListener("click", () => {
          window.CartCore.add(btn.dataset.id);
          if (window.updateCartBadge) window.updateCartBadge();
        });
      });
    }

    if (!CA || !document.getElementById("home-featured-women")) return;

    const women = CA.byGender("women").slice(0, 4);
    const men = CA.byGender("men").slice(0, 4);
    fillGrid(document.getElementById("home-featured-women"), women);
    fillGrid(document.getElementById("home-featured-men"), men);
    if (window.VolnaMotion && window.VolnaMotion.scan) window.VolnaMotion.scan(document.body);
  }

  document.addEventListener("DOMContentLoaded", run, { once: true });
  window.addEventListener("volna:catalog", run);
})();
