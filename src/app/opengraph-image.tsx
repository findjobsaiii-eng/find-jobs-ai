import { ImageResponse } from "next/og";

export const alt = "JOBMITER — AI Job Search, Simplified";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        padding: "78px 92px",
        color: "#F8FAFC",
        background:
          "linear-gradient(135deg, #07182E 0%, #0B1F3B 62%, #12325B 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 520,
          height: 520,
          borderRadius: 520,
          right: -110,
          top: -170,
          background: "rgba(59,130,246,.18)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 360,
          height: 360,
          borderRadius: 360,
          right: 130,
          bottom: -230,
          background: "rgba(20,184,166,.2)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <svg width="118" height="118" viewBox="0 0 64 64" fill="none">
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
          <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: 5 }}>
            JOBMITER
          </div>
        </div>
        <div
          style={{
            marginTop: 42,
            width: 760,
            fontSize: 48,
            lineHeight: 1.18,
            fontWeight: 600,
          }}
        >
          AI Job Search, Simplified.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 32,
            color: "#CBD5E1",
            fontSize: 24,
          }}
        >
          <span
            style={{
              width: 46,
              height: 4,
              borderRadius: 4,
              background: "#14B8A6",
            }}
          />
          Less searching. More focus.
        </div>
      </div>
    </div>,
    size,
  );
}
