import "./globals.css";

export const metadata = {
  title: "Flow by Earthin",
  description: "Generate videos from prompts using Flow"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

