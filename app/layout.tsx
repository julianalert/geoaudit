import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://notanothermarketer.com";
const DESC = "Test your brand across GPT-4o, Claude, and Gemini in 45 seconds. See how AI ranks you against competitors, catch the things it gets wrong, and see exactly what to change next. Free.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "GEO Audit - Is your brand showing up in AI answers?",
  description: DESC,
  openGraph: {
    title: "GEO Audit - Is your brand showing up in AI answers?",
    description: DESC,
    type: "website",
    images: [{ url: "/images/thumbnail.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GEO Audit - Is your brand showing up in AI answers?",
    description: DESC,
    images: ["/images/thumbnail.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Mono:wght@400;700&family=Space+Grotesk:wght@700;800&display=swap"
          rel="stylesheet"
        />
        {/* 100% privacy-first analytics */}
        <script async src="https://scripts.simpleanalyticscdn.com/latest.js" />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "#f8fafc",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  );
}
