// Site Reports as an installable app. Only the /site-reports route opts in:
// it adds the manifest + iOS meta tags to <head> on mount, registers the
// service worker (production builds only), and exposes the install prompt and
// online state to the page. The rest of the app stays a plain website.
import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "conplus_site_reports_install_dismissed";
const MANIFEST_HREF = "/manifest.webmanifest";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const readDismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

/** Put a <link>/<meta> in <head> once; returns a remover for unmount. */
function ensureHead(tag: "link" | "meta", attrs: Record<string, string>) {
  const selector = tag === "link" ? `link[rel="${attrs.rel}"]` : `meta[name="${attrs.name}"]`;
  if (document.head.querySelector(selector)) return () => {};
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
  return () => el.remove();
}

export function useSitePwa() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => (typeof window === "undefined" ? false : isStandalone()));
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ios] = useState(() => (typeof navigator === "undefined" ? false : isIOS()));

  useEffect(() => {
    const removers = [
      ensureHead("link", { rel: "manifest", href: MANIFEST_HREF }),
      ensureHead("link", { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }),
      ensureHead("meta", { name: "theme-color", content: "#D9541F" }),
      ensureHead("meta", { name: "apple-mobile-web-app-capable", content: "yes" }),
      ensureHead("meta", { name: "apple-mobile-web-app-status-bar-style", content: "default" }),
      ensureHead("meta", { name: "apple-mobile-web-app-title", content: "Site Reports" }),
    ];

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* no offline shell; the page still works online */
      });
    }

    return () => {
      removers.forEach((r) => r());
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }, [installEvent]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* not remembered in private mode */
    }
  }, []);

  return {
    online,
    installed,
    /** Chrome / Edge / Android: a one-tap install is available. */
    canInstall: !!installEvent && !installed,
    /** iOS Safari has no prompt; show the Share → Add to Home Screen hint. */
    showIosHint: ios && !installed,
    dismissed,
    install,
    dismiss,
  };
}
