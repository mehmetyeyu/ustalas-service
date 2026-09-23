import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Tarayıcı sekmesi/yer imi ikonu — sadece /elevire altında (bu dosyanın
// route segmentine özgü olması sayesinde Ustalas'ın kendi sayfalarını
// etkilemiyor, ayrı bir env var/koşul gerekmiyor). Sitenin gerçek nav
// logosuyla (bkz. page.tsx Logomark) aynı siyah daire + sarı "e" işareti.
export default async function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: "50%",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: "#ffcf3d", display: "flex" }}>e</div>
      </div>
    ),
    size
  );
}
