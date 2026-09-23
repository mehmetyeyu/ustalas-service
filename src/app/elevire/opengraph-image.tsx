import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Sitenin gerçek marka paletiyle (bkz. page.tsx CSS: --ink, --yellow,
// --paper) birebir aynı — WhatsApp/sosyal medya paylaşım kartı sitenin
// kendisiyle tutarlı görünsün diye.
const INK = "#0a0d12";
const PAPER = "#f3f2ea";
const YELLOW = "#ffcf3d";
const BODY = "#535862";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: PAPER,
          padding: "0 0 0 76px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: YELLOW, display: "flex" }}>e</div>
          </div>
          <div style={{ marginLeft: 16, fontSize: 26, fontWeight: 700, color: INK, letterSpacing: 1, display: "flex" }}>
            ELEVIRE
          </div>
        </div>

        <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.12, color: INK, maxWidth: 880, display: "flex" }}>
          Stok, müşteri ve iş takibi. Tek ekranda.
        </div>

        <div style={{ fontSize: 26, color: BODY, maxWidth: 700, marginTop: 24, display: "flex" }}>
          Lastikçiler ve oto servisler için tek paket, net fiyat.
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#f8672d", display: "flex" }} />
          <div style={{ marginLeft: 10, fontSize: 22, letterSpacing: 1, color: "#f8672d", display: "flex" }}>
            elevire.yeyu.co
          </div>
        </div>
      </div>
    ),
    size
  );
}
