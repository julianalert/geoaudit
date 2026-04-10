export const metadata = {
  title: 'FREE GEO AUDIT TOOL',
  description: 'Do LLM Models know your brand? Find out with our free audit tool.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
