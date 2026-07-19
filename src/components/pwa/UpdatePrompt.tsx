import { useEffect } from "react";

const SW_UPDATE_CHECK_INTERVAL = 60 * 1000;

// Registers /sw.js and keeps the app auto-updating (replaces
// virtual:pwa-register/react). The SW activates new versions immediately
// (skipWaiting + clients.claim); when a NEW worker takes control of an
// already-controlled page, we reload so users always run the latest build.
export function UpdatePrompt() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // If there was no controller, the first controllerchange is just the
    // initial install claiming the page — don't reload for that.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshed = false;
    let intervalId: number | undefined;

    const onControllerChange = () => {
      if (!hadController || refreshed) return;
      refreshed = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        intervalId = window.setInterval(() => {
          registration.update().catch(() => {
            // offline — try again next interval
          });
        }, SW_UPDATE_CHECK_INTERVAL);
      })
      .catch((err) => {
        console.error("Service worker registration failed:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
