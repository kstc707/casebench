import "./globals.css";

export const metadata = {
  title: "Casebench",
  description: "Practice the job before you have the job: AI coworkers, messy data, real feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
