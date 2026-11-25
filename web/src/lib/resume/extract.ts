// Turns an uploaded PDF / DOCX / TXT file into plain text, entirely in the browser.
export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const item of tc.items) {
        if (!("str" in item)) continue;
        const y = Math.round((item.transform[5] as number) / 3);
        const row = rows.get(y) ?? [];
        row.push({ x: item.transform[4] as number, s: item.str });
        rows.set(y, row);
      }
      [...rows.keys()].sort((a, b) => b - a).forEach((y) => {
        out += (rows.get(y) ?? []).sort((a, b) => a.x - b.x).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim() + "\n";
      });
    }
    return out;
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  }
  return file.text();
}
