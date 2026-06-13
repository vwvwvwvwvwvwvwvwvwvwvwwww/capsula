import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CATALOG = path.join(__dirname, "catalog-default.json");

export function getProductsPath(root) {
  if (process.env.PRODUCTS_PATH) return path.resolve(process.env.PRODUCTS_PATH);
  return path.join(root, "data", "products.json");
}

export function readProducts(root) {
  const file = getProductsPath(root);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(DEFAULT_CATALOG, file);
  }
  const raw = fs.readFileSync(file, "utf8");
  let data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("products.json должен быть JSON-массивом");
  if (!data.length) {
    fs.copyFileSync(DEFAULT_CATALOG, file);
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return data;
}

export function writeProducts(root, products) {
  const file = getProductsPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(products, null, 2), "utf8");
}

export function validateProducts(products) {
  if (!Array.isArray(products) || products.length === 0) {
    return { ok: false, error: "Нужен непустой массив товаров" };
  }
  const ids = new Set();
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p || typeof p !== "object") return { ok: false, error: `Элемент ${i + 1}: не объект` };
    if (typeof p.id !== "string" || !p.id.trim()) return { ok: false, error: `Элемент ${i + 1}: нужен id (строка)` };
    const id = p.id.trim();
    if (ids.has(id)) return { ok: false, error: `Повтор id: ${id}` };
    ids.add(id);
    if (p.gender !== "men" && p.gender !== "women") {
      return { ok: false, error: `Товар ${id}: gender только «men» или «women»` };
    }
    if (typeof p.title !== "string" || !p.title.trim()) return { ok: false, error: `Товар ${id}: нужно название` };
    if (typeof p.category !== "string" || !p.category.trim()) return { ok: false, error: `Товар ${id}: нужна категория` };
    const price = Number(p.price);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: `Товар ${id}: цена — число ≥ 0` };
    if (typeof p.image !== "string" || !p.image.trim()) return { ok: false, error: `Товар ${id}: нужен URL картинки` };
    if (p.description != null && typeof p.description !== "string") {
      return { ok: false, error: `Товар ${id}: описание должно быть строкой` };
    }
    if (p.sizeChart != null && typeof p.sizeChart !== "string") {
      return { ok: false, error: `Товар ${id}: sizeChart должна быть строкой` };
    }
    if (p.sizes != null) {
      if (!Array.isArray(p.sizes) || !p.sizes.length) {
        return { ok: false, error: `Товар ${id}: sizes — непустой массив строк` };
      }
      for (let j = 0; j < p.sizes.length; j++) {
        if (typeof p.sizes[j] !== "string" || !p.sizes[j].trim()) {
          return { ok: false, error: `Товар ${id}: размер ${j + 1} — строка` };
        }
      }
    }
  }
  return { ok: true };
}
