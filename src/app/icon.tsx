import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#004481", border: "26px solid #5BBEFF", color: "white", fontSize: 132, fontWeight: 900, fontFamily: "Arial" }}>
        FORUM
      </div>
    ),
    size,
  );
}
