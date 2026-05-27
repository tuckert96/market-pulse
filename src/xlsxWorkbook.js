const decoder = new TextDecoder("utf-8");

export async function readXlsxRows(arrayBuffer) {
  const entries = await readZipEntries(arrayBuffer);
  const sharedStrings = parseSharedStrings(textEntry(entries, "xl/sharedStrings.xml"));
  const sheetPath = firstWorksheetPath(entries);
  if (!sheetPath) throw new Error("Workbook does not contain a worksheet.");
  return parseWorksheet(textEntry(entries, sheetPath), sharedStrings);
}

export async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();
  let offset = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid XLSX central directory.");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressedData : await inflate(method, compressedData);
    entries.set(name.replace(/\\/g, "/"), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function firstWorksheetPath(entries) {
  const workbookText = textEntry(entries, "xl/workbook.xml");
  const relsText = textEntry(entries, "xl/_rels/workbook.xml.rels");
  const firstSheet = workbookText.match(/<sheet\b[^>]*r:id="([^"]+)"[^>]*>/);
  if (firstSheet && relsText) {
    const rel = new RegExp(`<Relationship\\b[^>]*Id="${escapeRegex(firstSheet[1])}"[^>]*Target="([^"]+)"`, "i").exec(relsText);
    if (rel) return normalizeWorkbookPath(rel[1]);
  }

  return Array.from(entries.keys()).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
}

function normalizeWorkbookPath(target) {
  const clean = target.replace(/^\/+/, "");
  if (clean.startsWith("xl/")) return clean;
  return `xl/${clean}`.replace(/\/+/g, "/");
}

function parseSharedStrings(xml = "") {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map(([item]) =>
    Array.from(item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("")
  );
}

function parseWorksheet(xml = "", sharedStrings = []) {
  return Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
    .map(([, rowXml]) => parseRow(rowXml, sharedStrings))
    .filter((row) => row.some((value) => value !== ""));
}

function parseRow(rowXml, sharedStrings) {
  const row = [];
  for (const match of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = match[1];
    const body = match[2];
    const ref = attribute(attrs, "r");
    const type = attribute(attrs, "t");
    const column = ref ? columnIndex(ref) : row.length;
    row[column] = cellValue(type, body, sharedStrings);
  }
  return row.map((value) => value ?? "");
}

function cellValue(type, body, sharedStrings) {
  if (type === "inlineStr") {
    return Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
      .map((match) => decodeXml(match[1]))
      .join("");
  }

  const valueMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  if (!valueMatch) return "";
  const raw = decodeXml(valueMatch[1]);
  if (type === "s") return sharedStrings[Number(raw)] || "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function textEntry(entries, name) {
  const entry = entries.get(name);
  return entry ? decoder.decode(entry) : "";
}

function findEndOfCentralDirectory(view) {
  const min = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("File is not a readable XLSX workbook.");
}

async function inflate(method, data) {
  if (method !== 8) throw new Error(`Unsupported XLSX compression method ${method}.`);
  if (typeof DecompressionStream !== "undefined") {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const zlib = await import("node:zlib");
  return new Uint8Array(zlib.inflateRawSync(data));
}

function columnIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0] || "A";
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function attribute(attrs, name) {
  return new RegExp(`${name}="([^"]*)"`, "i").exec(attrs)?.[1] || "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
