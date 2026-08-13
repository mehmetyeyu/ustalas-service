import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Asfalt/amber/plaka mavisi paleti — src/app/elevire/page.tsx'teki koyu tema
// tokenlarıyla birebir aynı, WhatsApp/sosyal medya paylaşım kartı sitenin
// kendisiyle tutarlı görünsün diye.
const INK = "#eeece4";
const INK_SOFT = "#b3b0a4";
const GROUND = "#17181a";
const ACCENT = "#e79438";
const ACCENT_2 = "#7fa0d6";

export default async function Image() {
  const [oswaldMedium, oswaldBold] = await Promise.all([
    readFile(join(process.cwd(), "src/app/elevire/fonts/Oswald-Medium.ttf")),
    readFile(join(process.cwd(), "src/app/elevire/fonts/Oswald-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: GROUND,
          position: "relative",
        }}
      >
        {/* dekoratif halka motifi — sitedeki hero halkalarıyla aynı fikir */}
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -120,
            width: 620,
            height: 620,
            borderRadius: "50%",
            border: `1px solid ${"#34363a"}`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -60,
            top: -20,
            width: 380,
            height: 380,
            borderRadius: "50%",
            border: `1.5px solid ${ACCENT_2}`,
            opacity: 0.5,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 60,
            top: 100,
            width: 180,
            height: 180,
            borderRadius: "50%",
            border: `2px solid ${ACCENT}`,
            opacity: 0.8,
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 0 0 76px",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 28,
            }}
          >
            <div style={{ width: 10, height: 34, background: ACCENT_2, borderRadius: 2, display: "flex" }} />
            <div
              style={{
                marginLeft: 14,
                fontFamily: "Oswald-Bold",
                fontSize: 44,
                color: INK,
                textTransform: "uppercase",
                letterSpacing: 2,
                display: "flex",
              }}
            >
              Elevire
            </div>
          </div>

          <div
            style={{
              fontFamily: "Oswald-Bold",
              fontSize: 68,
              lineHeight: 1.08,
              color: INK,
              maxWidth: 820,
              display: "flex",
              marginBottom: 26,
            }}
          >
            Lastik Servisinizi Yönetmenin En Kolay Yolu
          </div>

          <div
            style={{
              fontFamily: "Oswald-Medium",
              fontSize: 28,
              color: INK_SOFT,
              maxWidth: 680,
              display: "flex",
            }}
          >
            Sipariş, stok, depo ve raporlama — hepsi tek ekranda.
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: 48,
            }}
          >
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: ACCENT, display: "flex" }} />
            <div
              style={{
                marginLeft: 10,
                fontFamily: "Oswald-Medium",
                fontSize: 22,
                letterSpacing: 1,
                color: ACCENT,
                display: "flex",
              }}
            >
              elevire.yeyu.co
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Oswald-Medium", data: oswaldMedium, weight: 500, style: "normal" },
        { name: "Oswald-Bold", data: oswaldBold, weight: 700, style: "normal" },
      ],
    }
  );
}
