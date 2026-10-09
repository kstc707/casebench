// Practice mode runs a project's real tests in the learner's browser with
// Pyodide (Python compiled to WebAssembly). This script makes that work with
// no CDN, at the exact versions the tasks were verified with:
//
// 1. copies Pyodide's core files from node_modules into public/pyodide;
// 2. downloads the pinned test tools (pytest, freezegun and their
//    dependencies) from PyPI into public/pyodide-wheels, refusing any file
//    whose SHA-256 doesn't match the pin.
//
// Both folders are gitignored. Runs before `dev` and `build`; skips work that
// is already done.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Pure-Python wheels only (Pyodide can't load compiled ones from PyPI).
// To change a version: update it here with the new wheel's sha256 from PyPI.
const WHEELS = [
  ["pytest", "9.1.1", "37a86b45efb9a47a61a36449063e8e18d0cab3161329fc099eb21783169c4f0c"],
  ["iniconfig", "2.3.1", "9121e2c1fdb355232495be3194c8dfe87ccc2d5dee45947b78e68f499790d7a7"],
  ["packaging", "26.3", "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c"],
  ["pluggy", "1.6.0", "e920276dd6813095e9377c0bc5566d94c932c33b27a3e3945d8389c374dd4746"],
  ["pygments", "2.21.0", "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9"],
  ["freezegun", "1.5.5", "cd557f4a75cf074e84bc374249b9dd491eaeacd61376b9eb3c423282211619d2"],
  ["python-dateutil", "2.9.0.post0", "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427"],
  ["six", "1.17.0", "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274"],
];

const PYODIDE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

const exists = (p) => stat(p).then(() => true, () => false);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function copyPyodide() {
  const dist = path.dirname(require.resolve("pyodide/package.json"));
  const out = path.resolve("public/pyodide");
  await mkdir(out, { recursive: true });
  for (const f of PYODIDE_FILES) await copyFile(path.join(dist, f), path.join(out, f));
  console.log(`pyodide: copied ${PYODIDE_FILES.length} core files`);
}

async function downloadWheels() {
  const out = path.resolve("public/pyodide-wheels");
  await mkdir(out, { recursive: true });
  const manifest = [];
  for (const [name, version, pinned] of WHEELS) {
    const meta = await fetch(`https://pypi.org/pypi/${name}/${version}/json`).then((r) => {
      if (!r.ok) throw new Error(`PyPI ${name} ${version}: HTTP ${r.status}`);
      return r.json();
    });
    const wheel = meta.urls.find((u) => u.packagetype === "bdist_wheel" && u.filename.endsWith("-none-any.whl"));
    if (!wheel) throw new Error(`${name} ${version} has no pure-Python wheel`);
    const file = path.join(out, wheel.filename);
    if (!(await exists(file)) || sha256(await readFile(file)) !== pinned) {
      const buf = Buffer.from(await (await fetch(wheel.url)).arrayBuffer());
      if (sha256(buf) !== pinned) throw new Error(`${wheel.filename}: sha256 doesn't match the pin; refusing it`);
      await writeFile(file, buf);
      console.log(`pyodide: downloaded ${wheel.filename}`);
    }
    manifest.push(wheel.filename);
  }
  await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

await copyPyodide();
await downloadWheels();
