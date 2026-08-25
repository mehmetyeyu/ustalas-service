import { NextResponse } from "next/server";

// Randevu widget'ı artık (Shadow DOM tabanlı embed.js ile) firmanın kendi
// sitesinden — yani FARKLI bir origin'den — bu API'lere fetch() ile istek
// atıyor. Önceden her şey bizim iframe'imizin içinde, bizim origin'imizden
// çalıştığından CORS'a hiç gerek yoktu. Bu üç public route (meta/slots/POST)
// zaten kimlik doğrulamasız ve herkese açık — joker (*) origin güvenli,
// çünkü çerez/oturum bilgisi taşımıyorlar (credentials yok) ve hassas veri
// döndürmüyorlar.
export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}

// Tarayıcılar POST + Content-Type: application/json gibi "basit olmayan"
// isteklerden önce bir OPTIONS ön-uçuş (preflight) isteği atar — her route
// bunu ayrıca export etmeli (bkz. o dosyalardaki `export const OPTIONS`).
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
