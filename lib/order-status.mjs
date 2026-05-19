/** Статусы предзаказа / заказа */
export const ORDER_STATUSES = ["new", "confirmed", "processing", "ready", "completed", "cancelled"];

export const ORDER_STATUS_LABELS = {
  new: "Новый",
  confirmed: "Подтверждён",
  processing: "В обработке",
  ready: "Готов к выдаче",
  completed: "Выполнен",
  cancelled: "Отменён",
};

export function normalizeOrderStatus(status) {
  const s = String(status || "new").trim().toLowerCase();
  return ORDER_STATUSES.includes(s) ? s : "new";
}

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[normalizeOrderStatus(status)] || ORDER_STATUS_LABELS.new;
}
