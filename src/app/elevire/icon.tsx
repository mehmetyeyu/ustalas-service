import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const GROUND = "#17181a";
const INK = "#eeece4";
const ACCENT = "#e79438";

// Tarayıcı sekmesi/yer imi ikonu — sadece /elevire altında (bu dosyanın
// route segmentine özgü olması sayesinde Ustalas'ın kendi sayfalarını
// etkilemiyor, ayrı bir env var/koşul gerekmiyor).
export default async function Icon() {
  const oswaldBold = await readFile(join(process.cwd(), "src/app/elevire/fonts/Oswald-Bold.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: GROUND,
        }}
      >
        <div style={{ fontFamily: "Oswald-Bold", fontSize: 18, lineHeight: 1, color: INK, display: "flex" }}>E</div>
        <div style={{ marginTop: 3, width: 11, height: 2, background: ACCENT, borderRadius: 1, display: "flex" }} />
      </div>
    ),
    { ...size, fonts: [{ name: "Oswald-Bold", data: oswaldBold, weight: 700, style: "normal" }] }
  );
}
