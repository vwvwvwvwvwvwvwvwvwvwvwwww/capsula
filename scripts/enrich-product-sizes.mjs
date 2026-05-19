/**
 * Добавляет sizes и sizeChart всем товарам в каталоге.
 * npm run enrich-sizes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichProduct } from "../lib/product-sizes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
    `${indent}  description: "${escapeJsString(p.description || "")}",`,
    `${indent}  sizeChart: "${escapeJsString(p.sizeChart)}",`,
    `${indent}  sizes: [${p.sizes.map((s) => `"${escapeJsString(s)}"`).join(", ")}],`,
    `${indent}},`,
  ];
  return lines.join("\n");
}

function buildProductsJs(women, men) {
  const wBlock = women.map((p) => formatProduct(p, "  ")).join("\n");
  const mBlock = men.map((p) => formatProduct(p, "  ")).join("\n");
  const tail = fs.readFileSync(path.join(ROOT, "js", "products.js"), "utf8");
  const apiStart = tail.indexOf("window.CatalogApi");
  const catalogApi = apiStart >= 0 ? tail.slice(apiStart) : "";

  return `/**
 * Каталог Капсула — товары и фото с lime-shop.com (личный просмотр).
 * Размеры: scripts/enrich-product-sizes.mjs
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

${catalogApi}`;
}

const jsonPath = path.join(ROOT, "data", "products.json");
const raw = fs.readFileSync(jsonPath, "utf8");
const products = JSON.parse(raw).map(enrichProduct);
const women = products.filter((p) => p.gender === "women");
const men = products.filter((p) => p.gender !== "women");

fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2), "utf8");
fs.writeFileSync(path.join(ROOT, "lib", "catalog-default.json"), JSON.stringify(products, null, 2), "utf8");
fs.writeFileSync(path.join(ROOT, "js", "products.js"), buildProductsJs(women, men), "utf8");

console.log(`[КАПСУЛА] Размеры добавлены: ${products.length} товаров.`);
