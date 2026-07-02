const NAME_KEYS = {
  portes_keywords: { storage: "portes_name", default: "Portes" },
  peinture_keywords: { storage: "peinture_name", default: "Portes Peinture" },
} as const;

export type CalculatorKey = keyof typeof NAME_KEYS;

export function getCalculatorName(key: CalculatorKey): string {
  const cfg = NAME_KEYS[key];
  if (typeof window === "undefined") return cfg.default;
  try {
    return localStorage.getItem(cfg.storage) || cfg.default;
  } catch {
    return cfg.default;
  }
}

export function setCalculatorName(key: CalculatorKey, name: string) {
  const cfg = NAME_KEYS[key];
  try {
    const trimmed = name.trim();
    if (!trimmed || trimmed === cfg.default) {
      localStorage.removeItem(cfg.storage);
    } else {
      localStorage.setItem(cfg.storage, trimmed);
    }
  } catch {
    // ignore
  }
}

export function getDefaultCalculatorName(key: CalculatorKey): string {
  return NAME_KEYS[key].default;
}