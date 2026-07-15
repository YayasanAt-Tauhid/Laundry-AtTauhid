import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  return null;
}
