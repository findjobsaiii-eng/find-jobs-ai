export function requireAuthEnvironmentValue(
  name: string,
  value: string | undefined,
) {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `Missing required authentication environment variable: ${name}`,
    );
  }

  return value;
}

export function requireAuthSiteUrl(value: string | undefined) {
  const configuredValue = requireAuthEnvironmentValue("SITE_URL", value);

  try {
    const url = new URL(configuredValue);
    const isSecure = url.protocol === "https:";
    const isLocal =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (
      (!isSecure && !isLocal) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(
      "Invalid authentication environment variable: SITE_URL must be an HTTPS origin or a local HTTP origin",
    );
  }
}
