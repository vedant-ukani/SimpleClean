import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  IMPORT_LIMITS,
  ImportFileError,
  parseImportFile,
} from "../src/modules/imports/import-parser.js";

function replaceZipEntryName(
  bytes: Buffer,
  original: string,
  replacement: string,
): Buffer {
  expect(replacement).toHaveLength(original.length);
  const result = Buffer.from(bytes);
  const originalBytes = Buffer.from(original);
  const replacementBytes = Buffer.from(replacement);
  let start = 0;
  let replacements = 0;
  while (start < result.length) {
    const index = result.indexOf(originalBytes, start);
    if (index === -1) break;
    replacementBytes.copy(result, index);
    replacements += 1;
    start = index + originalBytes.length;
  }
  expect(replacements).toBeGreaterThanOrEqual(2);
  return result;
}

describe("inventory import parser", () => {
  it("preserves typed XLSX evidence, numeric serials, formulas, aliases, and unsupported state", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory List");
    sheet.addRow(["Make", "Model", "Serial", "Status", "Year"]);
    sheet.addRow([
      "Speedqueen",
      "SC30",
      20_406_000_471_422,
      "In Inventory",
      { formula: 'IF(A2="Dexter",1,"")', result: 20 },
    ]);
    sheet.addRow(["Dexter", "D50", "ABC-9", "Purchased (Shipped)", null]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await parseImportFile("inventory.xlsx", bytes);

    expect(parsed.mediaType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      sheetName: "Inventory List",
      sourceRowNumber: 2,
      candidate: {
        machineType: "other",
        manufacturer: "Speedqueen",
        model: "SC30",
        serial: "20406000471422",
        inventoryState: "on_hand",
      },
      classification: "warning",
      findings: expect.arrayContaining([
        "machine_type_unknown",
        "manufacturer_alias_applied",
      ]),
    });
    expect(parsed.rows[0]?.rawCells[4]?.value).toEqual({
      kind: "formula",
      formula: 'IF(A2="Dexter",1,"")',
      cached: 20,
    });
    expect(parsed.rows[1]).toMatchObject({
      classification: "error",
      findings: expect.arrayContaining(["legacy_sold_shipped_unsupported"]),
    });
  });

  it("uses a standards-compliant CSV parser and flags run duplicates", async () => {
    const bytes = Buffer.from(
      'Make,Model,Serial,Status,Repair Notes\r\n"Speed Queen","SC,30",001,"In Inventory","quoted, note"\r\nDexter,D50,001,In Inventory,\r\n',
    );
    const parsed = await parseImportFile("inventory.csv", bytes);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.candidate).toMatchObject({
      model: "SC,30",
      serial: "001",
    });
    expect(
      parsed.rows.every((row) => row.findings.includes("duplicate_in_import")),
    ).toBe(true);
  });

  it("preserves surplus CSV cells with explicit blank headers", async () => {
    const parsed = await parseImportFile(
      "inventory.csv",
      Buffer.from(
        "Make,Model,Serial,Status\nDexter,D50,001,In Inventory,unmapped evidence\n",
      ),
    );

    expect(parsed.rows[0]?.rawCells).toHaveLength(5);
    expect(parsed.rows[0]?.rawCells[4]).toEqual({
      column: 5,
      header: "",
      value: { kind: "string", value: "unmapped evidence" },
    });
  });

  it("requires each normalized inventory header exactly once in CSV and XLSX", async () => {
    await expect(
      parseImportFile(
        "duplicate.csv",
        Buffer.from(
          "Make,Model,Serial,Status, make \nDexter,D50,001,In Inventory,Dexter\n",
        ),
      ),
    ).rejects.toThrow("duplicate_required_header");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory List");
    sheet.addRow(["Make", "Model", "Serial", "Status", " MAKE "]);
    sheet.addRow(["Dexter", "D50", "001", "In Inventory", "Dexter"]);
    await expect(
      parseImportFile(
        "duplicate.xlsx",
        Buffer.from(await workbook.xlsx.writeBuffer()),
      ),
    ).rejects.toThrow("duplicate_required_header");
  });

  it("bounds headers and aggregate expanded staged evidence", async () => {
    await expect(
      parseImportFile(
        "wide-header.csv",
        Buffer.from(
          `Make,Model,Serial,Status,${"h".repeat(
            IMPORT_LIMITS.headerCharacters + 1,
          )}\nDexter,D50,001,In Inventory,value\n`,
        ),
      ),
    ).rejects.toThrow("header_limit_exceeded");

    const amplifiedHeaders = ["Make", "Model", "Serial", "Status"];
    while (amplifiedHeaders.length < IMPORT_LIMITS.columns) {
      const prefix = `evidence-${amplifiedHeaders.length}-`;
      amplifiedHeaders.push(
        `${prefix}${"h".repeat(IMPORT_LIMITS.headerCharacters - prefix.length)}`,
      );
    }
    const row = "Dexter,D50,001,In Inventory";
    const amplified = `${amplifiedHeaders.join(",")}\n${Array.from(
      { length: 600 },
      () => row,
    ).join("\n")}\n`;
    await expect(
      parseImportFile("amplified.csv", Buffer.from(amplified)),
    ).rejects.toThrow("expanded_evidence_limit_exceeded");
  });

  it("rejects formula-backed serials even when a numeric result is cached", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory List");
    sheet.addRow(["Make", "Model", "Serial", "Status"]);
    sheet.addRow([
      "Dexter",
      "D50",
      { formula: "100+23", result: 123 },
      "In Inventory",
    ]);

    await expect(
      parseImportFile(
        "formula-serial.xlsx",
        Buffer.from(await workbook.xlsx.writeBuffer()),
      ),
    ).rejects.toThrow("formula_serial_rejected");
  });

  it("enforces worksheet dimensions before selecting inventory sheets and in aggregate", async () => {
    const wideWorkbook = new ExcelJS.Workbook();
    const inventory = wideWorkbook.addWorksheet("Inventory List");
    inventory.addRow(["Make", "Model", "Serial", "Status"]);
    inventory.addRow(["Dexter", "D50", "001", "In Inventory"]);
    wideWorkbook
      .addWorksheet("Unrelated")
      .addRow(Array.from({ length: IMPORT_LIMITS.columns + 1 }, () => "x"));
    await expect(
      parseImportFile(
        "wide-unrelated.xlsx",
        Buffer.from(await wideWorkbook.xlsx.writeBuffer()),
      ),
    ).rejects.toThrow("column_limit_exceeded");

    const tallWorkbook = new ExcelJS.Workbook();
    const first = tallWorkbook.addWorksheet("Inventory List");
    const second = tallWorkbook.addWorksheet("Unrelated");
    first.addRow(["Make", "Model", "Serial", "Status"]);
    second.addRow(["Ignored"]);
    for (let index = 0; index < 5_001; index += 1) {
      first.addRow(["Dexter", "D50", String(index), "In Inventory"]);
      second.addRow(["x"]);
    }
    await expect(
      parseImportFile(
        "aggregate-rows.xlsx",
        Buffer.from(await tallWorkbook.xlsx.writeBuffer()),
      ),
    ).rejects.toThrow("row_limit_exceeded");
  });

  it("rejects XLM macro sheets, ActiveX, and OLE embedding package parts", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory List");
    sheet.addRow(["Make", "Model", "Serial", "Status"]);
    sheet.addRow(["Dexter", "D50", "001", "In Inventory"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    const unsafePackages = [
      replaceZipEntryName(
        bytes,
        "xl/worksheets/sheet1.xml",
        "xl/macrosheets/s1234.xml",
      ),
      replaceZipEntryName(bytes, "xl/theme/theme1.xml", "xl/activeX/evil.exe"),
      replaceZipEntryName(bytes, "xl/theme/theme1.xml", "xl/embeddings/x.bin"),
    ];

    for (const unsafe of unsafePackages) {
      await expect(parseImportFile("unsafe.xlsx", unsafe)).rejects.toThrow(
        "xlsx_executable_content_rejected",
      );
    }
  });

  it("rejects unsupported, disguised, malformed, and NUL-containing sources", async () => {
    await expect(
      parseImportFile("inventory.xls", Buffer.from("x")),
    ).rejects.toBeInstanceOf(ImportFileError);
    await expect(
      parseImportFile("inventory.xlsx", Buffer.from("not a zip")),
    ).rejects.toThrow("content_type_mismatch");
    await expect(
      parseImportFile("inventory.csv", Buffer.from([0x41, 0, 0x42])),
    ).rejects.toThrow("csv_contains_nul");
    await expect(
      parseImportFile("inventory.csv", Buffer.from("wrong,headers\na,b")),
    ).rejects.toThrow("inventory_sheet_not_found");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventory List");
    sheet.addRow(["Make", "Model", "Serial", "Status"]);
    sheet.addRow(["Dexter", "D50", 10 ** 20, "In Inventory"]);
    await expect(
      parseImportFile(
        "unsafe.xlsx",
        Buffer.from(await workbook.xlsx.writeBuffer()),
      ),
    ).rejects.toThrow("unsafe_numeric_serial");
  });
});
