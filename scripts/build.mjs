import { build } from "esbuild";
import { chmod } from "node:fs/promises";

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cycle.js",
  banner: { js: "#!/usr/bin/env node" },
});

await chmod("dist/cycle.js", 0o755);
