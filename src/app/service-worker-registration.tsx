interface ServiceWorkerRegistrationProps {
  readonly scope: string;
  readonly scriptUrl: string;
}

export function ServiceWorkerRegistration({ scope, scriptUrl }: ServiceWorkerRegistrationProps) {
  if (process.env.NODE_ENV !== "production") return null;

  const source = `if ("serviceWorker" in navigator) navigator.serviceWorker.register(${JSON.stringify(scriptUrl)}, ${JSON.stringify({ scope, updateViaCache: "none" })});`;

  // biome-ignore lint/security/noDangerouslySetInnerHtml: Values come from the validated local publication contract and JSON serialization.
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
