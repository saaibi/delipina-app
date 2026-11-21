export const TEXT_SCALE_KEY = "delipina:text-scale";
export function readTextScale() {
  const value = Number(localStorage.getItem(TEXT_SCALE_KEY) || 100);
  return Number.isFinite(value) ? Math.min(130, Math.max(85, value)) : 100;
}
export function saveTextScale(value: number) {
  localStorage.setItem(TEXT_SCALE_KEY, String(value));
  window.dispatchEvent(new Event("delipina:text-scale"));
}
