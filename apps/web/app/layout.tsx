export const metadata = {
  title: "Casebench",
  description: "AI-powered professional work simulations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
