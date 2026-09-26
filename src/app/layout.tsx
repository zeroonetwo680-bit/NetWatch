import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { QueryProvider } from "@/lib/query-client";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const cairo = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/cairo/files/cairo-arabic-wght-normal.woff2",
      weight: "200 1000",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource-variable/cairo/files/cairo-latin-wght-normal.woff2",
      weight: "200 1000",
      style: "normal",
    },
  ],
  variable: "--font-cairo",
  display: "swap",
  fallback: ["Tahoma", "Segoe UI", "Arial", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "NetWatch — مراقبة الشبكة",
    template: "%s | NetWatch",
  },
  description:
    "منصة NetWatch لإدارة ومراقبة الشبكة: الأجهزة المتصلة، السرعات اللحظية، حدود السرعة، وتقارير الاستهلاك اليومي والشهري.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className="h-full antialiased"
    >
      <body
        className={`${cairo.variable} ${jetbrainsMono.variable} min-h-full flex flex-col font-sans`}
        suppressHydrationWarning
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          تخطي إلى المحتوى الرئيسي
        </a>
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster position="top-center" richColors closeButton dir="rtl" />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
