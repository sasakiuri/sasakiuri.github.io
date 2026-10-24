export const dependencyAuditExceptions = new Map([
  [
    "GHSA-mrhx-c7xc-m3w5",
    {
      // No patched Zod 3 release exists. Lighthouse uses our local Chromium and static export.
      // Newer Chromium BiDi releases fail the publisher-trust policy; keep that policy enforced.
      expires: "2026-11-03",
      moduleName: "zod",
      pathSuffixes: [">lighthouse>puppeteer-core>chromium-bidi>zod"],
      version: "3.25.76",
    },
  ],
]);

export function dependencyExceptionDeadline(expires) {
  const deadline = Date.parse(`${expires}T23:59:59.999Z`);
  if (
    typeof expires !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(expires) ||
    !Number.isFinite(deadline) ||
    new Date(deadline).toISOString().slice(0, 10) !== expires
  ) {
    throw new TypeError("Dependency exception has an invalid deadline.");
  }
  return deadline;
}
