export function demoSessionAllowed(configuredValue?: string): boolean {
  const normalized = configuredValue?.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0";
}
