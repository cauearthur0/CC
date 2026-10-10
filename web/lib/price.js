/**
 * Menor valor citado no preço ("R$ 33,99 a R$ 66" → 33.99). Gratuito → 0. Sem número → null (desconhecido).
 */
export function minPrice(event) {
  if (event.is_free) return 0;
  if (!event.price) return null;
  const values = [...event.price.matchAll(/R\$\s*(\d{1,4}(?:\.\d{3})*(?:,\d{1,2})?)/gi)].map((m) =>
    Number(m[1].replace(/\./g, "").replace(",", ".")),
  );
  return values.length ? Math.min(...values) : null;
}

/** O evento cabe no orçamento? Preço desconhecido passa (melhor mostrar do que esconder). */
export function fitsBudget(event, max) {
  if (max === Infinity) return true;
  const price = minPrice(event);
  return price === null ? max > 0 : price <= max;
}
