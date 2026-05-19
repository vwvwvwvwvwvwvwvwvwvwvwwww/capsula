/**
 * Размерные сетки для карточки товара (дублирует lib/product-sizes.mjs для браузера).
 */
(function () {
  const SIZE_CHARTS = {
    women_clothing: {
      title: "Женская одежда",
      columns: ["Размер", "Грудь, см", "Талия, см", "Бёдра, см"],
      rows: [
        ["XS", "80–84", "60–64", "86–90"],
        ["S", "84–88", "64–68", "90–94"],
        ["M", "88–92", "68–72", "94–98"],
        ["L", "92–96", "72–76", "98–102"],
        ["XL", "96–100", "76–80", "102–106"],
      ],
    },
    women_bottoms: {
      title: "Женские брюки и джинсы (EU)",
      columns: ["EU", "Талия, см", "Бёдра, см", "Длина, см"],
      rows: [
        ["34", "62–66", "88–92", "76"],
        ["36", "66–70", "92–96", "76"],
        ["38", "70–74", "96–100", "76"],
        ["40", "74–78", "100–104", "76"],
        ["42", "78–82", "104–108", "76"],
      ],
    },
    women_skirts: {
      title: "Женские юбки (EU)",
      columns: ["EU", "Талия, см", "Бёдра, см"],
      rows: [
        ["34", "62–66", "88–92"],
        ["36", "66–70", "92–96"],
        ["38", "70–74", "96–100"],
        ["40", "74–78", "100–104"],
        ["42", "78–82", "104–108"],
      ],
    },
    women_shoes: {
      title: "Женская обувь (EU)",
      columns: ["EU", "Длина стопы, см"],
      rows: [
        ["36", "23,0"],
        ["37", "23,7"],
        ["38", "24,3"],
        ["39", "25,0"],
        ["40", "25,7"],
        ["41", "26,3"],
      ],
    },
    men_clothing: {
      title: "Мужская одежда",
      columns: ["Размер", "Грудь, см", "Талия, см"],
      rows: [
        ["S", "88–92", "76–80"],
        ["M", "96–100", "84–88"],
        ["L", "104–108", "92–96"],
        ["XL", "112–116", "100–104"],
        ["XXL", "120–124", "108–112"],
      ],
    },
    men_bottoms: {
      title: "Мужские брюки и джинсы (EU)",
      columns: ["EU", "Талия, см", "Бёдра, см"],
      rows: [
        ["46", "78–82", "96–100"],
        ["48", "82–86", "100–104"],
        ["50", "86–90", "104–108"],
        ["52", "90–94", "108–112"],
        ["54", "94–98", "112–116"],
      ],
    },
    men_shoes: {
      title: "Мужская обувь (EU)",
      columns: ["EU", "Длина стопы, см"],
      rows: [
        ["40", "25,3"],
        ["41", "26,0"],
        ["42", "26,7"],
        ["43", "27,3"],
        ["44", "28,0"],
        ["45", "28,7"],
        ["46", "29,3"],
      ],
    },
    one_size: {
      title: "Универсальный размер",
      columns: ["Размер"],
      rows: [["One size"]],
    },
  };

  const WOMEN_BOTTOMS = new Set(["Джинсы", "Брюки", "Юбки", "Шорты", "Леггинсы", "Деним"]);
  const WOMEN_SHOES = new Set(["Обувь"]);
  const WOMEN_ACCESSORIES = new Set(["Сумки", "Аксессуары"]);
  const MEN_BOTTOMS = new Set(["Джинсы", "Брюки", "Шорты"]);
  const MEN_SHOES = new Set(["Обувь"]);
  const MEN_ACCESSORIES = new Set(["Рюкзаки и аксессуары"]);

  function resolveChartId(product) {
    if (product.sizeChart && SIZE_CHARTS[product.sizeChart]) return product.sizeChart;
    const g = product.gender === "men" ? "men" : "women";
    const cat = String(product.category || "").trim();
    if (g === "women") {
      if (WOMEN_SHOES.has(cat)) return "women_shoes";
      if (cat === "Юбки") return "women_skirts";
      if (WOMEN_BOTTOMS.has(cat)) return "women_bottoms";
      if (WOMEN_ACCESSORIES.has(cat)) return "one_size";
      return "women_clothing";
    }
    if (MEN_SHOES.has(cat)) return "men_shoes";
    if (MEN_BOTTOMS.has(cat)) return "men_bottoms";
    if (MEN_ACCESSORIES.has(cat)) return "one_size";
    return "men_clothing";
  }

  function defaultSizes(product) {
    const id = resolveChartId(product);
    const chart = SIZE_CHARTS[id];
    if (!chart) return ["M"];
    if (id === "one_size") return ["One size"];
    return chart.rows.map((row) => row[0]);
  }

  function productSizes(product) {
    if (Array.isArray(product.sizes) && product.sizes.length) return product.sizes.map(String);
    return defaultSizes(product);
  }

  function getChart(chartId) {
    return SIZE_CHARTS[chartId] || null;
  }

  function renderChartTableHtml(chart, selectedSize) {
    if (!chart) return "";
    const head = chart.columns.map((c) => `<th>${c}</th>`).join("");
    const body = chart.rows
      .map((row) => {
        const isSel = selectedSize && row[0] === selectedSize;
        const cls = isSel ? ' class="is-selected"' : "";
        return `<tr${cls}>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
      })
      .join("");
    return `<table class="size-chart__table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  window.SizeCharts = {
    resolveChartId,
    productSizes,
    getChart,
    renderChartTableHtml,
  };
})();
