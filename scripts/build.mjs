import { rollup } from "rollup";
import { writeFile } from "node:fs/promises";
import prettier from "prettier";
const artifact = new URL("../src/index.user.js", import.meta.url);
export async function generate() {
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
    return `// Development bundle only. NOT an installable userscript; metadata approval pending.\n${await prettier.format(output[0].code, { filepath: artifact.pathname })}`;
  } finally {
    await bundle.close();
  }
}
if (
  process.argv[1] &&
  new URL(`file://${process.argv[1]}`).href === import.meta.url
)
  await writeFile(artifact, await generate());
