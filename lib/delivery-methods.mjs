export const DELIVERY_METHODS = [
  { id: "pickup", label: "Самовывоз из шоурума" },
  { id: "courier", label: "Курьер по городу" },
  { id: "pvz", label: "Пункт выдачи (СДЭК / ПВЗ)" },
  { id: "postal", label: "Почта России" },
];

export function normalizeDeliveryMethod(id) {
  const value = String(id || "").trim();
  return DELIVERY_METHODS.some((m) => m.id === value) ? value : "";
}

export function deliveryMethodLabel(id) {
  const value = normalizeDeliveryMethod(id);
  if (!value) return "";
  return DELIVERY_METHODS.find((m) => m.id === value)?.label || value;
}
