export const metadata = {
  title: "GEO Audit 101 — LLM Visibility Audit Tool",
  description:
    "Find out if AI models know your brand, describe you accurately, and recommend you when buyers ask.",
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
