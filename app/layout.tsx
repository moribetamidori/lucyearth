import type { Metadata } from "next";
import { VT323, Courier_Prime } from "next/font/google";
import "./globals.css";

const pixelFont = VT323({
  weight: "400",
  variable: "--font-pixel",
  subsets: ["latin"],
});

const courierFont = Courier_Prime({
  weight: ["400", "700"],
  variable: "--font-courier",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lucy Earth",
  description: "lucyearth.system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${pixelFont.variable} ${courierFont.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
