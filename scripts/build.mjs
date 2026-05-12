import { build } from "esbuild";
import { chmod, cp, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cycle.js",
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __cr } from 'node:module';",
      "const require = __cr(import.meta.url);",
    ].join("\n"),
  },
});

await chmod("dist/cycle.js", 0o755);

// Stage src/defaults alongside the bundle so init can find them
// regardless of execution context (local-dev or installed npm pkg).
await cp("src/defaults", "dist/defaults", { recursive: true });
