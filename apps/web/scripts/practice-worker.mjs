// Practice mode's test runner: a module web worker, so the page stays
// responsive while tests run. Not bundled by Next.js (its workers are classic
// scripts, and Pyodide needs a module worker): prepare-pyodide.mjs copies this
// file, and lib/practice/runner.py, next to Pyodide in public/pyodide/.
//
// In:  { id, files, testIds }
// Out: { type: "ready" } once, then { id, result } or { id, error } per run.
import { loadPyodide } from "./pyodide.mjs";

const here = new URL("./", import.meta.url);

async function boot() {
  const py = await loadPyodide({ indexURL: here.href });
  // The pinned test tools: pure-Python wheels are zip files, unpacked into site-packages.
  const wheels = new URL("../pyodide-wheels/", here);
  const names = await (await fetch(new URL("manifest.json", wheels))).json();
  py.FS.mkdirTree("/wheels");
  for (const name of names) {
    py.FS.writeFile(`/wheels/${name}`, new Uint8Array(await (await fetch(new URL(name, wheels))).arrayBuffer()));
  }
  py.runPython(`
import os, sysconfig, zipfile
_dest = sysconfig.get_paths()["purelib"]
for _w in os.listdir("/wheels"):
    zipfile.ZipFile("/wheels/" + _w).extractall(_dest)
`);
  py.runPython(await (await fetch(new URL("runner.py", here))).text());
  return py;
}

const ready = boot();
ready.then(
  () => self.postMessage({ type: "ready" }),
  (err) => self.postMessage({ type: "boot-error", error: String(err) })
);

self.onmessage = async (e) => {
  const { id, files, testIds } = e.data;
  try {
    const py = await ready;
    py.globals.set("_casebench_files", JSON.stringify(files));
    py.globals.set("_casebench_ids", JSON.stringify(testIds));
    const json = await py.runPythonAsync("_casebench_run(_casebench_files, _casebench_ids)");
    self.postMessage({ id, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
