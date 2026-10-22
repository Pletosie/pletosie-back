export function listenOptions(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT doit être un entier entre 1 et 65535.');
  // Render must listen on all interfaces, even if a local HOST was copied into its environment.
  const host =
    env.RENDER === 'true'
      ? '0.0.0.0'
      : env.HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
  return { port, host };
}
