"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/sasakiuri/sw.js", {
      scope: "/sasakiuri/",
      updateViaCache: "none",
    });
  }, []);

  return null;
}
