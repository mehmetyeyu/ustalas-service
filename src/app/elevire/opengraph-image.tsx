import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Landing'in siyah temasıyla aynı (bkz. styles.ts) — WhatsApp/sosyal medya
// paylaşım kartı siteyle tutarlı görünsün diye.
const BG = "#07080a";
const INK = "#0a0d12";
const FG = "#f4f4f1";
const YELLOW = "#ffcf3d";
const MUTED = "#a3a8b2";

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
          background: BG,
          padding: "0 0 0 76px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: YELLOW,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, color: INK, display: "flex" }}>e</div>
          </div>
          <div style={{ marginLeft: 16, fontSize: 26, fontWeight: 700, color: FG, letterSpacing: -0.5, display: "flex" }}>
            elevire
          </div>
        </div>

        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.06, letterSpacing: -3, color: FG, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex" }}>Defteri kapat.</div>
          <div style={{ display: "flex" }}>
            İşini <span style={{ color: YELLOW, margin: "0 20px" }}>tek ekrandan</span> yönet.
          </div>
        </div>

        <div style={{ fontSize: 26, color: MUTED, maxWidth: 760, marginTop: 24, display: "flex" }}>
          Lastikçiler için iş emri, stok, lastik oteli, cari ve kasa.
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 44 }}>
          <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ffcf3d", display: "flex" }} />
          <div style={{ marginLeft: 10, fontSize: 22, letterSpacing: 1, color: "#ffcf3d", display: "flex" }}>
            elevire.yeyu.co
          </div>
        </div>
      </div>
    ),
    size
  );
}
