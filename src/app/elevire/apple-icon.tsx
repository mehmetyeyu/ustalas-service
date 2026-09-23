import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// bkz. icon.tsx notu — aynı siyah daire + sarı "e" işareti, iOS ana ekran
// simgesi için daha büyük boyutta.
export default async function AppleIcon() {
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
        }}
      >
        <div style={{ fontSize: 108, fontWeight: 700, color: "#ffcf3d", display: "flex" }}>e</div>
      </div>
    ),
    size
  );
}
