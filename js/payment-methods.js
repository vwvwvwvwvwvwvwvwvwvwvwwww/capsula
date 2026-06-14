(function () {
  const PAYMENT_METHODS = [
    { id: "cash", label: "Наличные при получении" },
    { id: "transfer", label: "Перевод на карту / СБП" },
    { id: "showroom", label: "Оплата в шоуруме" },
  ];

  function label(id) {
    const value = String(id || "").trim();
    const row = PAYMENT_METHODS.find((m) => m.id === value);
    return row ? row.label : value;
  }

  window.PaymentMethods = { list: PAYMENT_METHODS, label };
})();
