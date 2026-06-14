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

/** Текст уведомления клиенту при смене статуса (кроме «Новый»). */
export const ORDER_STATUS_NOTIFY = {
  confirmed: "Ваш предзаказ подтверждён. Менеджер свяжется с вами при необходимости.",
  processing: "Заказ принят в обработку — готовим к отправке или выдаче.",
  ready: "Заказ готов к выдаче! Можете забрать или ожидайте звонка по доставке.",
  completed: "Заказ выполнен. Спасибо, что выбрали Капсулу!",
  cancelled: "К сожалению, заказ отменён. Если остались вопросы — свяжитесь с нами.",
};

export function orderStatusNotifyText(status) {
  const st = normalizeOrderStatus(status);
  return ORDER_STATUS_NOTIFY[st] || null;
}

export function shouldNotifyStatusChange(status) {
  const st = normalizeOrderStatus(status);
  return st !== "new" && Boolean(ORDER_STATUS_NOTIFY[st]);
}
