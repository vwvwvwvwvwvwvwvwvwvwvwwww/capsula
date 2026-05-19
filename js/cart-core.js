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

  function defaultSizeForProduct(p) {
    if (!p) return "";
    if (Array.isArray(p.sizes) && p.sizes.length) return String(p.sizes[0]);
    if (window.SizeCharts && typeof window.SizeCharts.productSizes === "function") {
      const list = window.SizeCharts.productSizes(p);
      return list[0] ? String(list[0]) : "";
    }
    return "";
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
    const sz = normalizeSize(size) || defaultSizeForProduct(p);
    const cart = load();
    const existing = cart.find((l) => sameLine(l, { id, size: sz }));
    if (existing) existing.qty += 1;
    else {
      cart.push({
        id,
        size: sz,
        qty: 1,
        snapshot: { title: p.title, price: p.price, image: p.image, size: sz },
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

  window.CartCore = { load, save, add, setQty, remove, clear, totalQty, sum, findProduct, normalizeSize };
})();
