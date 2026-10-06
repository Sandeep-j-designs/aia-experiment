import "@/styles/globals.css";
import type { AppProps } from "next/app";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import GuideProvider from "@/components/guide/guide-provider";
import NeoProvider from "@/components/neo/provider";
import NeoShell from "@/components/neo/shell";
import NeoPanel from "@/components/neo";
import NeoPresence from "@/components/neo/presence";

const open_sans = localFont({
  src: "../public/fonts/open-sans-latin.woff2",
  weight: "300 800",
  display: "swap",
});

/**
 * PROTOTYPE STUB — mirrors pages/_app.tsx in aiaccountant-app.
 *
 * Production additionally mounts SessionProvider, QueryClientProvider,
 * EnvProvider, GuideProvider and the app-effects (AuthEffects, SetupGuard,
 * AppConfigPoller, AblyNotifications, UserCompaniesSync, BillingAccessGuard)
 * plus the global BulkUpload modal. None of those are needed to render a
 * screen, so they are omitted here.
 *
 * On handoff this file is DISCARDED — the real _app.tsx already provides the
 * font wrapper and the Toaster.
 */
export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className={`${open_sans.className}`}>
      <style jsx global>{`
        :root {
          --font-family-primary:
            ${open_sans.style.fontFamily}, system-ui, sans-serif;
        }
      `}</style>
      {/* GuideProvider is mounted in production's _app.tsx too — a journey
          outlives the route it starts on, so it cannot live inside one. */}
      <GuideProvider>
        {/* Neo sits above the routes for the same reason: a run started on
            the queue has to survive opening the document it made. */}
        <NeoProvider>
          <NeoShell>
            <Component {...pageProps} />
          </NeoShell>
          <NeoPanel />
          <NeoPresence />
        </NeoProvider>
      </GuideProvider>
      <Toaster position="bottom-right" closeButton />
    </div>
  );
}
