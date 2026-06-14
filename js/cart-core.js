(function () {
  const KEY = "volna_cart";

  function load() {
    try {
      let raw = localStorage.getItem(KEY);
      if (!raw) {
        raw = localStorage.getItem("polosa_cart") || localStorage.getItem("zhenya_cart");
        if (raw) {
          localStorage.setItem(KEY, raw);
          localStorage.removeItem("polosa_cart");
          localStorage.removeItem("zhenya_cart");
        }
      }
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function save(lines) {
    localStorage.setItem(KEY, JSON.stringify(lines));
  }

  function normalizeSize(size) {
    return size != null && String(size).trim() ? String(size).trim() : "";
  }

  function productSizes(p) {
    if (!p) return [];
    if (Array.isArray(p.sizes) && p.sizes.length) return p.sizes.map(String);
    if (window.SizeCharts && typeof window.SizeCharts.productSizes === "function") {
      return window.SizeCharts.productSizes(p).map(String);
    }
    return [];
  }

  function sameLine(a, b) {
    return a.id === b.id && normalizeSize(a.size) === normalizeSize(b.size);
  }

  function findProduct(id) {
    if (window.CatalogApi && typeof window.CatalogApi.find === "function") {
      return window.CatalogApi.find(id);
    }
    const list = window.CATALOG_PRODUCTS || [];
    return list.find((p) => p.id === id);
  }

  function add(id, size) {
    const p = findProduct(id);
    if (!p) return load();
    const sizes = productSizes(p);
    const sz = normalizeSize(size);
    if (sizes.length && !sz) return load();
    const cart = load();
    const lineSize = sz || (sizes.length ? "" : normalizeSize(size));
    const existing = cart.find((l) => sameLine(l, { id, size: lineSize }));
    if (existing) existing.qty += 1;
    else {
      cart.push({
        id,
        size: lineSize,
        qty: 1,
        snapshot: { title: p.title, price: p.price, image: p.image, size: lineSize },
      });
    }
    save(cart);
    return cart;
  }

  function setQty(id, qty, size) {
    const sz = normalizeSize(size);
    let cart = load();
    const n = Math.max(0, parseInt(qty, 10) || 0);
    if (n === 0) cart = cart.filter((l) => !sameLine(l, { id, size: sz }));
    else {
      const line = cart.find((l) => sameLine(l, { id, size: sz }));
      if (line) line.qty = n;
    }
    save(cart);
    return cart;
  }

  function remove(id, size) {
    const sz = normalizeSize(size);
    const cart = load().filter((l) => !sameLine(l, { id, size: sz }));
    save(cart);
    return cart;
  }

  function clear() {
    save([]);
  }

  function totalQty() {
    return load().reduce((a, l) => a + l.qty, 0);
  }

  function sum() {
    return load().reduce((sum, line) => {
      const p = findProduct(line.id);
      const price = p ? p.price : line.snapshot.price;
      return sum + price * line.qty;
    }, 0);
  }

  window.CartCore = { load, save, add, setQty, remove, clear, totalQty, sum, findProduct, normalizeSize, productSizes };
})();
