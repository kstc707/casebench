/**
 * Minimal CSV read/write for our own generated files. Values never contain
 * commas, quotes, or newlines (we control the generator), so no quoting is
 * needed — and the writer throws if that assumption is ever broken.
 */
export type Row = Record<string, string | number | boolean | null>;

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = row[c];
          const s = v === null || v === undefined ? "" : String(v);
          if (/[",\n]/.test(s)) throw new Error(`Unsupported character in ${c}: ${s}`);
          return s;
        })
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export function parseCsv(text: string): Record<string, string>[] {
  const [header, ...lines] = text.trim().split("\n");
  const columns = header.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    columns.forEach((c, i) => (row[c] = values[i] ?? ""));
    return row;
  });
}
