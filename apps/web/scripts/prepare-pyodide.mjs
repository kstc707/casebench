// Practice mode runs a project's real tests in the learner's browser with
// Pyodide (Python compiled to WebAssembly). This script makes that work with
// no CDN, at the exact versions the tasks were verified with:
//
// 1. copies Pyodide's core files from node_modules into public/pyodide, with
//    our test runner (scripts/practice-worker.mjs + lib/practice/runner.py);
// 2. downloads the pinned test tools (pytest, freezegun and their
//    dependencies) from PyPI into public/pyodide-wheels, refusing any file
//    whose SHA-256 doesn't match the pin.
//
// Both folders are gitignored. Runs as part of `dev`, `build` and `vercel-build`; skips work that
// is already done.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Pure-Python wheels only (Pyodide can't load compiled ones from PyPI).
// [name, version, wheel file name, sha256]. To change a version, update all
// three from the wheel's page on PyPI.
const WHEELS = [
  ["pytest", "9.1.1", "pytest-9.1.1-py3-none-any.whl", "37a86b45efb9a47a61a36449063e8e18d0cab3161329fc099eb21783169c4f0c"],
  ["iniconfig", "2.3.1", "iniconfig-2.3.1-py3-none-any.whl", "9121e2c1fdb355232495be3194c8dfe87ccc2d5dee45947b78e68f499790d7a7"],
  ["packaging", "26.3", "packaging-26.3-py3-none-any.whl", "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c"],
  ["pluggy", "1.6.0", "pluggy-1.6.0-py3-none-any.whl", "e920276dd6813095e9377c0bc5566d94c932c33b27a3e3945d8389c374dd4746"],
  ["pygments", "2.21.0", "pygments-2.21.0-py3-none-any.whl", "2363c69b61c4a97c838da3b130dcd6468f4848992b21a82f2a63ec34377137d9"],
  ["freezegun", "1.5.5", "freezegun-1.5.5-py3-none-any.whl", "cd557f4a75cf074e84bc374249b9dd491eaeacd61376b9eb3c423282211619d2"],
  ["python-dateutil", "2.9.0.post0", "python_dateutil-2.9.0.post0-py2.py3-none-any.whl", "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427"],
  ["six", "1.17.0", "six-1.17.0-py2.py3-none-any.whl", "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274"],
];

const PYODIDE_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

const exists = (p) => stat(p).then(() => true, () => false);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function copyPyodide() {
  const dist = path.dirname(require.resolve("pyodide/package.json"));
  const out = path.resolve("public/pyodide");
  await mkdir(out, { recursive: true });
  for (const f of PYODIDE_FILES) await copyFile(path.join(dist, f), path.join(out, f));
  // Our test runner: the module worker and the Python it runs.
  await copyFile(path.resolve("scripts/practice-worker.mjs"), path.join(out, "practice-worker.mjs"));
  await copyFile(path.resolve("lib/practice/runner.py"), path.join(out, "runner.py"));
  console.log(`pyodide: copied ${PYODIDE_FILES.length} core files and the practice test runner`);
}

async function downloadWheels() {
  const out = path.resolve("public/pyodide-wheels");
  await mkdir(out, { recursive: true });
  const manifest = [];
  for (const [name, version, filename, pinned] of WHEELS) {
    const file = path.join(out, filename);
    if (!(await exists(file)) || sha256(await readFile(file)) !== pinned) {
      const meta = await fetch(`https://pypi.org/pypi/${name}/${version}/json`).then((r) => {
        if (!r.ok) throw new Error(`PyPI ${name} ${version}: HTTP ${r.status}`);
        return r.json();
      });
      const wheel = meta.urls.find((u) => u.filename === filename);
      if (!wheel) throw new Error(`${filename} isn't on PyPI for ${name} ${version}`);
      const buf = Buffer.from(await (await fetch(wheel.url)).arrayBuffer());
      if (sha256(buf) !== pinned) throw new Error(`${filename}: sha256 doesn't match the pin; refusing it`);
      await writeFile(file, buf);
      console.log(`pyodide: downloaded ${filename}`);
    }
    manifest.push(filename);
  }
  await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

await copyPyodide();
await downloadWheels();
