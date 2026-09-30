import { useEffect, useState } from "react";

// Arama kutuları gibi her tuş vuruşunda sunucuya sorgu atılmasını önlemek
// için — DOM'dan bağımsız saf state mantığı, React Native tarafında da
// aynen kullanılabilir. `delayMs` süresince değer değişmezse son hâli
// döner.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
