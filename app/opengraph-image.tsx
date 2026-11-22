import { ImageResponse } from "next/og";

// The share card. Without it, the beta link pasted into WhatsApp, iMessage or
// Slack previewed as a bare URL — no title, no image, no description.
// Generated at build time rather than committed as a binary, so the wording and
// the brand colours stay in one place with the rest of the app.

export const alt = "AJ Words — apprenez votre vocabulaire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#fbf7ef",
          color: "#182d36",
          fontFamily: "sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "36px"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "84px",
              height: "84px",
              borderRadius: "22px",
              background: "#2d6f68",
              color: "#fffcf4",
              fontSize: "44px",
              fontWeight: 700
            }}
          >
            AJ
          </div>
          <div style={{ fontSize: "44px", fontWeight: 700 }}>AJ Words</div>
        </div>
        <div
          style={{
            fontSize: "62px",
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: "28px"
          }}
        >
          Apprenez vos mots avec rythme et concentration
        </div>
        <div style={{ fontSize: "32px", color: "#657780", lineHeight: 1.35 }}>
          Vos listes, vos cartes mémo, vos quiz. Tout reste sur votre appareil.
        </div>
      </div>
    ),
    size
  );
}
