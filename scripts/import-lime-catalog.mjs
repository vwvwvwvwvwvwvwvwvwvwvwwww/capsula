/**
 * Импорт товаров и фото с публичного API LIME (lime-shop.com).
 * Для личного просмотра каталога на сайте «Капсула».
 *
 * Запуск: node scripts/import-lime-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichProduct } from "../lib/product-sizes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const LIME_API = "https://lime-shop.com/api";
const PER_SECTION = 2;
const DELAY_MS = 180;

/** LIME section code → категория в навигации сайта */
const SECTIONS = [
  // Женщины
  { code: "women_dresses", gender: "women", category: "Платья" },
  { code: "women_jeans", gender: "women", category: "Джинсы" },
  { code: "women_trousers_classic", gender: "women", category: "Брюки" },
  { code: "women_skirts", gender: "women", category: "Юбки" },
  { code: "women_t_shirt", gender: "women", category: "Футболки и топы" },
  { code: "women_tops_knitted", gender: "women", category: "Футболки и топы" },
  { code: "women_shirts_all", gender: "women", category: "Блузки и рубашки" },
  { code: "women_blazers", gender: "women", category: "Пиджаки и жилеты" },
  { code: "women_sweaters_cardigans_polo", gender: "women", category: "Трикотаж" },
  { code: "women_jacket", gender: "women", category: "Верхняя одежда" },
  { code: "women_shorts_sporty", gender: "women", category: "Шорты" },
  { code: "women_tights_leggings", gender: "women", category: "Леггинсы" },
  { code: "women_suit", gender: "women", category: "Костюмы" },
  { code: "women_shoes_flats", gender: "women", category: "Обувь" },
  { code: "women_shoes_heels", gender: "women", category: "Обувь" },
  { code: "women_bags_medium", gender: "women", category: "Сумки" },
  { code: "women_accessories_and_jewellery", gender: "women", category: "Аксессуары" },
  // Мужчины
  { code: "men_t_shirts_all", gender: "men", category: "Футболки и поло" },
  { code: "men_polo_all", gender: "men", category: "Футболки и поло" },
  { code: "men_shirts_all", gender: "men", category: "Рубашки" },
  { code: "men_jeans_all", gender: "men", category: "Джинсы" },
  { code: "men_trousers_all", gender: "men", category: "Брюки" },
  { code: "men_knitwear_all", gender: "men", category: "Трикотаж" },
  { code: "men_outerwear_all", gender: "men", category: "Верхняя одежда" },
  { code: "men_shorts_all", gender: "men", category: "Шорты" },
  { code: "men_blazers_all", gender: "men", category: "Пиджаки" },
  { code: "men_shoes_all", gender: "men", category: "Обувь" },
  { code: "men_bags_all", gender: "men", category: "Рюкзаки и аксессуары" },
  { code: "men_accessories_all", gender: "men", category: "Рюкзаки и аксессуары" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function flattenGridItems(items) {
  const out = [];
  for (const item of items || []) {
    if (item?.type === "product" && item.entity) {
      out.push(item);
      continue;
    }
    for (const cell of item?.cells || []) {
      if (cell?.type === "product" && cell.entity) out.push(cell);
    }
  }
  return out;
}

function pickImage(entity) {
  const model = entity?.models?.[0];
  if (!model) return "";
  return model.photo?.url || model.medias?.[0]?.url || "";
}

function pickPrice(entity) {
  const sku = entity?.models?.[0]?.skus?.[0];
  const p = sku?.price ?? sku?.old_price;
  return Number.isFinite(p) ? Math.round(p) : 0;
}

function pickDescription(entity) {
  const t = entity?.description_text || entity?.description || "";
  return String(t).replace(/\s+/g, " ").trim().slice(0, 280);
}

function mapProduct(cell, { gender, category, sectionCode }, index) {
  const entity = cell.entity;
  const code = String(entity?.code || entity?.id || `${sectionCode}-${index}`);
  const title = String(entity?.name || "Товар").trim();
  const image = pickImage(entity);
  if (!image) return null;

  return enrichProduct({
    id: `lime-${gender}-${code}`,
    gender,
    title,
    category,
    price: pickPrice(entity),
    image,
    description: pickDescription(entity) || title,
  });
}

async function fetchSectionProducts(sectionCode, pageSize) {
  const url = `${LIME_API}/section/${encodeURIComponent(sectionCode)}/presentation/grid?page=1&page_size=${pageSize}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "Accept-Language": "ru-RU" },
  });
  const text = await res.text();
  if (!res.ok || text.startsWith("<")) {
    throw new Error(`HTTP ${res.status} для ${sectionCode}`);
  }
  const data = JSON.parse(text);
  return flattenGridItems(data.items);
}

function escapeJsString(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
}

function formatProduct(p, indent) {
  const lines = [
    `${indent}{`,
    `${indent}  id: "${escapeJsString(p.id)}",`,
    `${indent}  gender: "${p.gender}",`,
    `${indent}  title: "${escapeJsString(p.title)}",`,
    `${indent}  category: "${escapeJsString(p.category)}",`,
    `${indent}  price: ${p.price},`,
    `${indent}  image: u("${escapeJsString(p.image)}"),`,
    `${indent}  description: "${escapeJsString(p.description)}",`,
    `${indent}  sizeChart: "${escapeJsString(p.sizeChart)}",`,
    `${indent}  sizes: [${p.sizes.map((s) => `"${escapeJsString(s)}"`).join(", ")}],`,
    `${indent}},`,
  ];
  return lines.join("\n");
}

function buildProductsJs(women, men) {
  const wBlock = women.map((p, i) => formatProduct(p, "  ")).join("\n");
  const mBlock = men.map((p, i) => formatProduct(p, "  ")).join("\n");

  return `/**
 * Каталог Капсула — товары и фото с lime-shop.com (личный просмотр).
 * Сгенерировано: scripts/import-lime-catalog.mjs
 */
function u(url) {
  return url;
}

const WOMEN = [
${wBlock}
];

const MEN = [
${mBlock}
];

window.CATALOG_PRODUCTS = WOMEN.concat(MEN);

window.CatalogApi = {
  all() {
    return window.CATALOG_PRODUCTS || [];
  },
  byGender(g) {
    return this.all().filter((p) => p.gender === g);
  },
  find(id) {
    return this.all().find((p) => p.id === id) || null;
  },
  /** women | men */
  normalizeGender(g) {
    return g === "men" ? "men" : "women";
  },
  /** из URL, sessionStorage или women */
  currentGender() {
    try {
      const path = (location.pathname || "").split("/").pop() || "";
      if (path === "catalog.html" || path === "product.html") {
        const q = new URLSearchParams(location.search).get("gender");
        if (q === "men" || q === "women") {
          sessionStorage.setItem("volna_gender", q);
          return q;
        }
      }
      const s = (() => {
        let v = sessionStorage.getItem("volna_gender");
        if (v === "men" || v === "women") return v;
        const old = sessionStorage.getItem("polosa_gender") || sessionStorage.getItem("zhenya_gender");
        if (old === "men" || old === "women") {
          sessionStorage.setItem("volna_gender", old);
          sessionStorage.removeItem("polosa_gender");
          sessionStorage.removeItem("zhenya_gender");
          return old;
        }
        return null;
      })();
      if (s === "men" || s === "women") return s;
    } catch (_) {}
    return "women";
  },
  setGender(g) {
    const v = this.normalizeGender(g);
    try {
      sessionStorage.setItem("volna_gender", v);
    } catch (_) {}
    return v;
  },
  async hydrateFromServer() {
    try {
      if (location.protocol !== "http:" && location.protocol !== "https:") return false;
      const url =
        typeof window.volnaApiUrl === "function" ? window.volnaApiUrl("/api/products") : "/api/products";
      const res = await fetch(url);
      const text = await res.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          return false;
        }
      }
      if (!res.ok || !Array.isArray(data.products)) return false;
      window.CATALOG_PRODUCTS = data.products;
      try {
        window.dispatchEvent(new CustomEvent("volna:catalog"));
      } catch (_) {}
      return true;
    } catch {
      return false;
    }
  },
};
`;
}

async function main() {
  const all = [];
  const seenIds = new Set();
  let ok = 0;
  let fail = 0;

  for (const sec of SECTIONS) {
    process.stdout.write(`  ${sec.code} … `);
    try {
      const cells = await fetchSectionProducts(sec.code, PER_SECTION + 2);
      let added = 0;
      for (let i = 0; i < cells.length && added < PER_SECTION; i++) {
        const p = mapProduct(cells[i], sec, i);
        if (!p || seenIds.has(p.id)) continue;
        seenIds.add(p.id);
        all.push(p);
        added++;
      }
      console.log(added > 0 ? `+${added}` : "пусто");
      if (added > 0) ok++;
      else fail++;
    } catch (e) {
      console.log(`ошибка: ${e.message}`);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  const women = all.filter((p) => p.gender === "women");
  const men = all.filter((p) => p.gender === "men");

  const productsPath = path.join(ROOT, "js", "products.js");
  const dataPath = path.join(ROOT, "data", "products.json");
  const defaultPath = path.join(ROOT, "lib", "catalog-default.json");

  fs.writeFileSync(productsPath, buildProductsJs(women, men), "utf8");
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  const json = JSON.stringify(all, null, 2);
  fs.writeFileSync(dataPath, json, "utf8");
  fs.writeFileSync(defaultPath, json, "utf8");

  console.log(`\nГотово: ${all.length} товаров (женщины ${women.length}, мужчины ${men.length}).`);
  console.log(`Секций с товарами: ${ok}, без товаров/ошибок: ${fail}`);
  console.log(`Файлы: js/products.js, data/products.json, lib/catalog-default.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
