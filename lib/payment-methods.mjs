export const PAYMENT_METHODS = [
  { id: "cash", label: "Наличные при получении" },
  { id: "transfer", label: "Перевод на карту / СБП" },
  { id: "showroom", label: "Оплата в шоуруме" },
];

export function normalizePaymentMethod(id) {
  const value = String(id || "").trim();
  return PAYMENT_METHODS.some((m) => m.id === value) ? value : "";
}

export function paymentMethodLabel(id) {
  const value = normalizePaymentMethod(id);
  if (!value) return "";
  return PAYMENT_METHODS.find((m) => m.id === value)?.label || value;
}
