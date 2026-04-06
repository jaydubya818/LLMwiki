#!/usr/bin/env node
// esbuild-based transpile for the MCP server.
// The MCP source is @ts-nocheck; we transpile without full type-checking to
// avoid the TypeScript OOM that occurs when resolving the large @modelcontextprotocol/sdk types.
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/index.js",
  // Keep all dependencies external so the runtime resolves them via node_modules.
  packages: "external",
  sourcemap: true,
  // Re-stamp the shebang after bundling (esbuild strips it for non-entry-only builds).
  banner: { js: "#!/usr/bin/env node" },
});

// Emit a minimal declaration stub so consumers that import from dist still get a type.
writeFileSync("dist/index.d.ts", "export {};\n");

console.log("MCP build complete → dist/index.js");
