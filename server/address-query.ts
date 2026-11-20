/** Colombian street notation, accepting common abbreviations and spelling variants. */
export function numberedAddress(value: string) {
  const normalized = value
    .trim()
    .replace(/\b(?:carrea|cra\.?|cr\.?|kra\.?)\s+/gi, "Carrera ")
    .replace(/\b(?:cll\.?|cl\.?)\s+/gi, "Calle ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  const m = normalized.match(
    /^((?:Carrera|Calle|Avenida|Diagonal|Transversal|Circular)\s+\d+[a-z]?(?:\s+(?:bis|sur|norte|este|oeste))?)\s*(?:#|n[º°.]?|numero)\s*(\d+[a-z]?\s*-\s*\d+[a-z]?)(?=\s|,|$)/i,
  );
  return m
    ? { street: m[1], house: m[2].replace(/\s/g, ""), normalized }
    : null;
}
export function numberKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
