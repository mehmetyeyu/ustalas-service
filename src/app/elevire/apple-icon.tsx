import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const GROUND = "#17181a";
const INK = "#eeece4";
const ACCENT = "#e79438";

export default async function AppleIcon() {
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
        <div style={{ fontFamily: "Oswald-Bold", fontSize: 104, lineHeight: 1, color: INK, display: "flex" }}>E</div>
        <div style={{ marginTop: 16, width: 60, height: 8, background: ACCENT, borderRadius: 2, display: "flex" }} />
      </div>
    ),
    { ...size, fonts: [{ name: "Oswald-Bold", data: oswaldBold, weight: 700, style: "normal" }] }
  );
}
