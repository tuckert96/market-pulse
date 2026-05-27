import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSeekingAlphaWorkbook, normalizeSeekingAlphaWorkbookRows } from "../src/seekingAlphaWorkbook.js";

test("Seeking Alpha workbook rows normalize premium rating fields", () => {
  const records = normalizeSeekingAlphaWorkbookRows([
    ["Portfolio Export"],
    ["Symbol", "Company Name", "Quant Rating", "SA Author Rating", "Wall Street Rating", "Valuation Grade", "Growth Grade", "Profitability Grade", "Momentum Grade", "EPS Revisions Grade", "Dividend Yield", "Gross Margin", "FCF Margin", "Price To Sales", "Free Cash Flow", "Total Debt", "Earnings Date", "Price Target", "Rating Changes"],
    ["MU", "Micron Technology", "4.43", "Buy", "Strong Buy", "B", "A-", "B+", "A", "A-", "0.42%", "48%", "17%", "6.2", "$3,200,000,000", "$12,000,000,000", "2026-06-26", "$155", "Quant upgraded"],
    ["NVDA", "NVIDIA", "4.92", "Buy", "Buy", "C", "A+", "A+", "A", "A+", "0.03%", "72%", "34%", "18.4", "$27,000,000,000", "$11,000,000,000", "46239", "$1200", "No change"]
  ]);

  const mu = records.find((record) => record.ticker === "MU");
  const nvda = records.find((record) => record.ticker === "NVDA");

  assert.equal(records.length, 2);
  assert.equal(mu.company, "Micron Technology");
  assert.equal(mu.quant, 4.43);
  assert.equal(mu.authorRating, "Buy");
  assert.equal(mu.wallStreetRating, "Strong Buy");
  assert.equal(mu.value, 4);
  assert.equal(mu.growth, 4.6);
  assert.equal(mu.profitability, 4.3);
  assert.equal(mu.momentum, 96);
  assert.equal(mu.revisions, 92);
  assert.equal(mu.dividendYield, 0.0042);
  assert.equal(mu.grossMargin, 0.48);
  assert.equal(mu.freeCashFlowMargin, 0.17);
  assert.equal(mu.priceToSales, 6.2);
  assert.equal(mu.freeCashFlow, 3200000000);
  assert.equal(mu.totalDebt, 12000000000);
  assert.equal(mu.nextEarnings, "2026-06-26");
  assert.equal(mu.priceTarget, 155);
  assert.equal(mu.ratingChanges, "Quant upgraded");
  assert.equal(nvda.nextEarnings, "2026-08-05");
});

test("Seeking Alpha xlsx workbook import reads the first worksheet", async () => {
  const workbook = createStoredXlsx([
    ["Symbol", "Company", "Quant Rating", "Valuation Grade", "Growth Grade", "Momentum Grade", "EPS Revisions Grade", "Price Target"],
    ["CRDO", "Credo Technology Group", "4.12", "D+", "A", "A", "B", "82.50"]
  ]);
  const records = await normalizeSeekingAlphaWorkbook(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength));

  assert.equal(records.length, 1);
  assert.equal(records[0].ticker, "CRDO");
  assert.equal(records[0].company, "Credo Technology Group");
  assert.equal(records[0].quant, 4.12);
  assert.equal(records[0].value, 2.3);
  assert.equal(records[0].growth, 4.8);
  assert.equal(records[0].momentum, 96);
  assert.equal(records[0].revisions, 80);
  assert.equal(records[0].priceTarget, 82.5);
});

function createStoredXlsx(rows) {
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => cellXml(columnIndex, rowIndex, value)).join("")}</row>`).join("")}
  </sheetData>
</worksheet>`;
  return createStoredZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Portfolio" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    "xl/worksheets/sheet1.xml": worksheet
  });
}

function cellXml(columnIndex, rowIndex, value) {
  const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
  if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  Object.entries(entries).forEach(([name, content]) => {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const localFiles = Buffer.concat(localParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localFiles.length, 16);
  return Buffer.concat([localFiles, centralDirectory, eocd]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function columnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});
