export const dependencyAuditExceptions = new Map();

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
