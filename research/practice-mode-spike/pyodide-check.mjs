import { loadPyodide } from "pyodide";
import fs from "node:fs";
import path from "node:path";

const t0 = Date.now();
const py = await loadPyodide();
console.log("pyodide loaded", Date.now() - t0, "ms");
// Pure-Python wheels are zip files: unpack them into site-packages.
// (In the browser, micropip would fetch these from PyPI instead.)
py.FS.mkdirTree("/wheels");
for (const w of fs.readdirSync("wheels")) py.FS.writeFile(`/wheels/${w}`, fs.readFileSync(`wheels/${w}`));
py.runPython(`
import zipfile, os, site, sysconfig
dest = sysconfig.get_paths()["purelib"]
for w in os.listdir("/wheels"):
    zipfile.ZipFile("/wheels/" + w).extractall(dest)
`);
console.log("pytest + freezegun installed", Date.now() - t0, "ms");

// Copy the project (as it was before the fix) into Pyodide's in-memory filesystem.
function copyDir(src, dst) {
  py.FS.mkdirTree(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = `${dst}/${e.name}`;
    if (e.isDirectory()) copyDir(s, d); else py.FS.writeFile(d, fs.readFileSync(s));
  }
}
copyDir("task/before", "/work");

const run = async (label) => {
  const s = Date.now();
  const out = await py.runPythonAsync(`
import sys, io, pytest, importlib, contextlib
sys.path[:0] = ["/work/src", "/work"]
for m in [m for m in sys.modules if m.startswith(("humanize", "tests"))]: del sys.modules[m]
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    code = pytest.main(["-q", "-p", "no:cacheprovider", "-o", "addopts=", "/work/tests/test_time.py"])
lines = buf.getvalue().strip().splitlines()
f"exit={int(code)} | " + lines[-1]
`);
  console.log(label, "->", out, `(${Date.now() - s} ms)`);
};

await run("before fix");
py.FS.writeFile("/work/src/humanize/time.py", fs.readFileSync("task/fix/time.py"));
await run("after real fix");
