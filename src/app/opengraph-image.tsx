import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_TITLE } from "./site-metadata";
import he from "@/i18n/locales/he.json";

const logoData = await readFile(
  join(process.cwd(), "public/brand/logo.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;
const hebrewFont = await readFile(
  join(process.cwd(), "public/fonts/NotoSansHebrew-Regular.ttf"),
);

// Satori places these unpointed, Hebrew-only lines left-to-right. Supply visual
// glyph order here; keep translation resources in normal Hebrew reading order.
const imageTitle = Array.from(he.seo.imageTitle).reverse().join("");
const imageSubtitle = Array.from(he.seo.imageSubtitle).reverse().join("");

export const alt = SITE_TITLE;
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
        fontFamily: "Noto Sans Hebrew",
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
        <div
          style={{
            display: "flex",
            width: 470,
            padding: "20px 26px",
            borderRadius: 24,
            background: "rgba(255,255,255,.96)",
          }}
        >
          {/* ImageResponse renders this as SVG; next/image cannot run here. */}
          <img
            src={logoSrc}
            alt=""
            width={420}
            height={140}
            style={{ objectFit: "contain" }}
          />
        </div>
        <div
          style={{
            marginTop: 42,
            width: 760,
            fontSize: 48,
            lineHeight: 1.18,
            fontWeight: 400,
            textAlign: "right",
          }}
        >
          {imageTitle}
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
          {imageSubtitle}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Noto Sans Hebrew",
          data: hebrewFont,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
