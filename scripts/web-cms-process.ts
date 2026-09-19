import { fileURLToPath } from "node:url";

export function startWebCms() {
  const noProxy = [
    process.env.NO_PROXY,
    process.env.no_proxy,
    "localhost",
    "127.0.0.1",
    "::1",
  ]
    .filter(Boolean)
    .join(",");
  // Execute the JS entry directly: a package-bin launcher may leave grandchildren behind.
  return Bun.spawn(
    [
      process.execPath,
      fileURLToPath(
        new URL(
          "../apps/web-cms/node_modules/vite/bin/vite.js",
          import.meta.url,
        ),
      ),
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: fileURLToPath(new URL("../apps/web-cms/", import.meta.url)),
      env: { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
}
