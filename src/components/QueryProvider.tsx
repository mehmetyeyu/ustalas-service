"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Sunucu verisinin istemci önbelleği (TanStack Query) — kök layout'ta, böylece
// panel (/admin/*) ve sipariş formu (/) aynı önbelleği paylaşır; aralarında
// gidip gelmek /api/auth/me gibi istekleri tekrar atmaz. Sorgu anahtarları ve
// hook'lar src/lib/queries.ts'te.
//
// Varsayılanlar bilinçli olarak TanStack'inkinden farklı:
// - refetchOnWindowFocus kapalı: açık olsaydı sekmeye her dönüşte tüm aktif
//   sorgular yeniden çekilirdi — kaldırılan randevu rozetinin yaptığı (Vercel
//   Active CPU'yu şişiren) davranışın aynısı.
// - retry 1: varsayılan 3 deneme, başarısız bir istekte sayfayı saniyelerce
//   "yükleniyor"da tutardı.
// Ne kadar süre taze sayılacağı (staleTime) her sorguda ayrıca belirlenir.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1 },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
