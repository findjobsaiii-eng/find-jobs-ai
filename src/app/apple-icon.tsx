import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 40,
        background: "#0B1F3B",
      }}
    >
      <svg width="70%" height="70%" viewBox="0 0 64 64" fill="none">
        <path
          d="M38 8v30c0 10-6 17-16 17-5 0-9-2-12-5"
          stroke="#3B82F6"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="m29 15 9-9 9 9"
          stroke="#3B82F6"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="18" cy="39" r="7" fill="#14B8A6" />
        <path
          d="M9 52c4 3 8 4 13 4"
          stroke="#14B8A6"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    size,
  );
}
