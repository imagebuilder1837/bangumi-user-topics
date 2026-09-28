import { rollup } from "rollup";
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";
const artifact = new URL("../src/index.user.js", import.meta.url);
export async function metadataForVersion() {
  const { version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  if (
    typeof version !== "string" ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      version,
    )
  )
    throw new Error("package.json needs an explicit semver version");
  const template = await readFile(
    new URL("../src/metadata.txt", import.meta.url),
    "utf8",
  );
  if (
    (template.match(/\{\{VERSION\}\}/g) || []).length !== 1 ||
    !/^\/\/ @version\s+\{\{VERSION\}\}$/m.test(template) ||
    !template.startsWith("// ==UserScript==\n") ||
    !template.trimEnd().endsWith("// ==/UserScript==")
  )
    throw new Error("invalid userscript metadata template");
  return {
    version,
    header: template.replace("{{VERSION}}", version).trimEnd(),
  };
}
export async function generate() {
  const { header } = await metadataForVersion();
  const bundle = await rollup({
    input: new URL("../src/main.mjs", import.meta.url).pathname,
    onwarn(warning) {
      throw new Error(warning.message);
    },
  });
  try {
    const { output } = await bundle.generate({ format: "iife" });
    if (
      output.length !== 1 ||
      output[0].imports.length ||
      output[0].dynamicImports.length
    )
      throw new Error("Expected self-contained script");
    return `${header}\n\n// Generated from src/main.mjs. Do not edit; run npm run build.\n${await prettier.format(output[0].code, { filepath: artifact.pathname })}`;
  } finally {
    await bundle.close();
  }
}
if (
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).href === import.meta.url
)
  await writeFile(artifact, await generate());
