import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from "@/lib/toast-context";
import { PauseReminderProvider } from "@/components/pause/pause-reminder-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jerawat Hunter",
  description: "Pendamping untuk melewati dorongan picking dengan lebih tenang.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          <PauseReminderProvider>{children}</PauseReminderProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
