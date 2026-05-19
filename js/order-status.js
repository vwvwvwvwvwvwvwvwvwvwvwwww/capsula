(function () {
  const ORDER_STATUS_LABELS = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    ready: "Готов к выдаче",
    completed: "Выполнен",
    cancelled: "Отменён",
  };

  const BADGE_CLASS = {
    new: "order-status--new",
    confirmed: "order-status--confirmed",
    processing: "order-status--processing",
    ready: "order-status--ready",
    completed: "order-status--completed",
    cancelled: "order-status--cancelled",
  };

  function label(status) {
    return ORDER_STATUS_LABELS[status] || ORDER_STATUS_LABELS.new;
  }

  function badgeClass(status) {
    return `order-status ${BADGE_CLASS[status] || BADGE_CLASS.new}`;
  }

  window.OrderStatus = { label, badgeClass, ORDER_STATUS_LABELS };
})();
