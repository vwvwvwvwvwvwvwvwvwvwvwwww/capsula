(function () {
  const DELIVERY_METHODS = [
    { id: "pickup", label: "Самовывоз из шоурума" },
    { id: "courier", label: "Курьер по городу" },
    { id: "pvz", label: "Пункт выдачи (СДЭК / ПВЗ)" },
    { id: "postal", label: "Почта России" },
  ];

  function label(id) {
    const value = String(id || "").trim();
    const row = DELIVERY_METHODS.find((m) => m.id === value);
    return row ? row.label : value;
  }

  window.DeliveryMethods = { list: DELIVERY_METHODS, label };
})();
