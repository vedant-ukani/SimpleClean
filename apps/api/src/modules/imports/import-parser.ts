import type {
  ImportCandidate,
  ImportClassification,
  ImportFindingCode,
  ImportMediaType,
  ImportRawCell,
  ImportRawValue,
} from "@simply-clean/contracts";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { Open } from "unzipper";

export const IMPORT_LIMITS = {
  worksheets: 20,
  rows: 10_000,
  columns: 64,
  cells: 640_000,
  headerCharacters: 256,
  cellCharacters: 4_000,
  expandedEvidenceCharacters: 8 * 1024 * 1024,
} as const;

export class ImportFileError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ImportFileError";
  }
}

export interface ParsedImportRow {
  sheetName: string;
  sourceRowNumber: number;
  rawCells: ImportRawCell[];
  candidate: ImportCandidate;
  classification: ImportClassification;
  findings: ImportFindingCode[];
}

export interface ParsedImportFile {
  mediaType: ImportMediaType;
  rows: ParsedImportRow[];
}

const XLSX_MEDIA =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const REQUIRED_HEADERS = ["make", "model", "serial", "status"] as const;
const UNSAFE_XLSX_PATH =
  /(?:^|\/)(?:activeX|embeddings|macrosheets|dialogsheets)(?:\/|$)|vbaProject\.bin$|vbaData\.xml$|\.(?:exe|dll|com|scr|bat|cmd|js|jse|vbs|vbe|ps1|jar|class|msi|msp|hta|cpl|sys|pif|reg|wsf)$/i;
const UNSAFE_XLSX_CONTENT_TYPE =
  /(?:macroEnabled|macrosheet|xlMacrosheet|activeX|oleObject|vbaProject|ms-office\.vba)/i;
const UNSAFE_XLSX_RELATIONSHIP =
  /relationships\/(?:xlMacrosheet|activeX(?:ControlBinary)?|oleObject|vbaProject|control)(?:["'<\s]|$)/i;

export async function parseImportFile(
  filename: string,
  bytes: Buffer,
): Promise<ParsedImportFile> {
  const extension = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (extension !== ".xlsx" && extension !== ".csv") {
    throw new ImportFileError("unsupported_file_type");
  }
  if (extension === ".xlsx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new ImportFileError("content_type_mismatch");
    }
    return { mediaType: XLSX_MEDIA, rows: await parseXlsx(bytes) };
  }
  if (bytes.includes(0)) throw new ImportFileError("csv_contains_nul");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportFileError("csv_not_utf8");
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new ImportFileError("content_type_mismatch");
  }
  return { mediaType: "text/csv", rows: parseCsvRows(text) };
}

async function parseXlsx(bytes: Buffer): Promise<ParsedImportRow[]> {
  try {
    const archive = await Open.buffer(bytes);
    const totalBytes = archive.files.reduce(
      (total, entry) => total + entry.uncompressedSize,
      0,
    );
    if (
      archive.files.length > 2_000 ||
      totalBytes > 100 * 1024 * 1024 ||
      archive.files.some((entry) => entry.uncompressedSize > 50 * 1024 * 1024)
    ) {
      throw new ImportFileError("archive_limit_exceeded");
    }
    const paths = archive.files.map((entry) =>
      entry.path.replaceAll("\\", "/"),
    );
    if (
      paths.some(
        (path) =>
          path.startsWith("/") ||
          path.includes("\0") ||
          path.split("/").includes(".."),
      )
    ) {
      throw new ImportFileError("invalid_xlsx");
    }
    if (
      paths.filter((path) => path === "[Content_Types].xml").length !== 1 ||
      paths.filter((path) => path === "xl/workbook.xml").length !== 1
    ) {
      throw new ImportFileError("invalid_xlsx");
    }
    if (paths.some((path) => UNSAFE_XLSX_PATH.test(path))) {
      throw new ImportFileError("xlsx_executable_content_rejected");
    }
    const contentTypesEntry = archive.files.find(
      (entry) => entry.path === "[Content_Types].xml",
    );
    if (
      !contentTypesEntry ||
      contentTypesEntry.uncompressedSize > 1024 * 1024
    ) {
      throw new ImportFileError("invalid_xlsx");
    }
    const contentTypes = xmlScanText(await contentTypesEntry.buffer());
    if (UNSAFE_XLSX_CONTENT_TYPE.test(contentTypes)) {
      throw new ImportFileError("xlsx_executable_content_rejected");
    }
    const relationships = archive.files.filter((entry) =>
      entry.path.toLowerCase().endsWith(".rels"),
    );
    const relationshipBytes = relationships.reduce(
      (total, entry) => total + entry.uncompressedSize,
      0,
    );
    if (relationshipBytes > 2 * 1024 * 1024) {
      throw new ImportFileError("invalid_xlsx");
    }
    for (const relationship of relationships) {
      if (
        UNSAFE_XLSX_RELATIONSHIP.test(xmlScanText(await relationship.buffer()))
      ) {
        throw new ImportFileError("xlsx_executable_content_rejected");
      }
    }
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw new ImportFileError("invalid_xlsx");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportFileError("invalid_xlsx");
  }
  if (workbook.worksheets.length > IMPORT_LIMITS.worksheets) {
    throw new ImportFileError("worksheet_limit_exceeded");
  }
  const rows: ParsedImportRow[] = [];
  let aggregateRows = 0;
  let aggregateCells = 0;
  let expandedEvidenceCharacters = 0;
  for (const worksheet of workbook.worksheets) {
    if (worksheet.columnCount > IMPORT_LIMITS.columns) {
      throw new ImportFileError("column_limit_exceeded");
    }
    const worksheetRows = Math.max(0, worksheet.rowCount - 1);
    if (worksheetRows > IMPORT_LIMITS.rows) {
      throw new ImportFileError("row_limit_exceeded");
    }
    aggregateRows += worksheetRows;
    aggregateCells += worksheetRows * worksheet.columnCount;
    if (aggregateRows > IMPORT_LIMITS.rows) {
      throw new ImportFileError("row_limit_exceeded");
    }
    if (aggregateCells > IMPORT_LIMITS.cells) {
      throw new ImportFileError("cell_count_limit_exceeded");
    }
    const headers = worksheet.getRow(1).values;
    const headerStrings = Array.from(
      { length: worksheet.columnCount },
      (_, index) => valueText((headers as ExcelJS.CellValue[])[index + 1]),
    );
    enforceHeaderLimits(headerStrings);
    expandedEvidenceCharacters += headerStrings.reduce(
      (total, header) => total + header.length,
      0,
    );
    enforceExpandedEvidenceLimit(expandedEvidenceCharacters);
    if (!hasRequiredInventoryHeaders(headerStrings)) continue;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = Array.from({ length: worksheet.columnCount }, (_, index) =>
        excelRawValue(row.getCell(index + 1)),
      );
      if (values.every((value) => value.kind === "empty")) return;
      const rawCells = values.map((value, index) => ({
        column: index + 1,
        header: headerStrings[index] ?? "",
        value,
      }));
      enforceCellLimits(rawCells);
      const parsedRow = buildRow(worksheet.name, rowNumber, rawCells);
      expandedEvidenceCharacters += JSON.stringify(parsedRow).length;
      enforceExpandedEvidenceLimit(expandedEvidenceCharacters);
      rows.push(parsedRow);
    });
  }
  if (!rows.length) throw new ImportFileError("inventory_sheet_not_found");
  if (rows.length > IMPORT_LIMITS.rows) {
    throw new ImportFileError("row_limit_exceeded");
  }
  return addRunDuplicateFindings(rows);
}

function parseCsvRows(text: string): ParsedImportRow[] {
  let records: string[][];
  try {
    records = parseCsv(text, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false,
      max_record_size: IMPORT_LIMITS.columns * IMPORT_LIMITS.cellCharacters,
    }) as string[][];
  } catch {
    throw new ImportFileError("invalid_csv");
  }
  const [headerRecord, ...body] = records;
  if (!headerRecord) {
    throw new ImportFileError("inventory_sheet_not_found");
  }
  if (headerRecord.length > IMPORT_LIMITS.columns) {
    throw new ImportFileError("column_limit_exceeded");
  }
  enforceHeaderLimits(headerRecord);
  if (!hasRequiredInventoryHeaders(headerRecord)) {
    throw new ImportFileError("inventory_sheet_not_found");
  }
  if (body.length > IMPORT_LIMITS.rows) {
    throw new ImportFileError("row_limit_exceeded");
  }
  const rows: ParsedImportRow[] = [];
  let aggregateCells = 0;
  let expandedEvidenceCharacters = headerRecord.reduce(
    (total, header) => total + header.length,
    0,
  );
  body.forEach((record, index) => {
    const width = Math.max(headerRecord.length, record.length);
    if (width > IMPORT_LIMITS.columns) {
      throw new ImportFileError("column_limit_exceeded");
    }
    aggregateCells += width;
    if (aggregateCells > IMPORT_LIMITS.cells) {
      throw new ImportFileError("cell_count_limit_exceeded");
    }
    if (record.every((value) => value.length === 0)) return;
    const rawCells = Array.from({ length: width }, (_, column) => ({
      column: column + 1,
      header: headerRecord[column] ?? "",
      value:
        record[column] === undefined || record[column] === ""
          ? ({ kind: "empty" } as const)
          : ({ kind: "string", value: record[column] } as const),
    }));
    enforceCellLimits(rawCells);
    const parsedRow = buildRow("CSV", index + 2, rawCells);
    expandedEvidenceCharacters += JSON.stringify(parsedRow).length;
    enforceExpandedEvidenceLimit(expandedEvidenceCharacters);
    rows.push(parsedRow);
  });
  return addRunDuplicateFindings(rows);
}

function hasRequiredInventoryHeaders(headers: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const header of headers) {
    const key = headerKey(header);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (!REQUIRED_HEADERS.every((name) => (counts.get(name) ?? 0) > 0)) {
    return false;
  }
  if (!REQUIRED_HEADERS.every((name) => counts.get(name) === 1)) {
    throw new ImportFileError("duplicate_required_header");
  }
  return true;
}

function buildRow(
  sheetName: string,
  sourceRowNumber: number,
  rawCells: ImportRawCell[],
): ParsedImportRow {
  const values = new Map(
    rawCells.map((cell) => [headerKey(cell.header), mappedValue(cell.value)]),
  );
  const findings: ImportFindingCode[] = ["machine_type_unknown"];
  const rawManufacturer = nullable(values.get("make"));
  const alias = rawManufacturer?.toLowerCase() === "speedqueen";
  const manufacturer = rawManufacturer;
  if (alias) findings.push("manufacturer_alias_applied");
  const model = nullable(values.get("model"));
  const serial = serialValue(
    rawCells.find((cell) => headerKey(cell.header) === "serial")?.value,
  );
  if (!manufacturer) findings.push("manufacturer_missing");
  if (!model) findings.push("model_missing");
  if (!serial) findings.push("serial_missing");
  const status = nullable(values.get("status"));
  let inventoryState: ImportCandidate["inventoryState"] = "expected";
  if (status?.toLowerCase() === "in inventory") {
    inventoryState = "on_hand";
  } else if (status?.toLowerCase() === "purchased (shipped)") {
    findings.push("legacy_sold_shipped_unsupported");
  } else {
    findings.push("status_unrecognized");
  }
  const classification =
    findings.includes("legacy_sold_shipped_unsupported") ||
    findings.includes("status_unrecognized")
      ? "error"
      : findings.length
        ? "warning"
        : "ready";
  return {
    sheetName,
    sourceRowNumber,
    rawCells,
    candidate: {
      machineType: "other",
      manufacturer,
      model,
      serial,
      inventoryState,
    },
    classification,
    findings,
  };
}

function addRunDuplicateFindings(rows: ParsedImportRow[]): ParsedImportRow[] {
  const serialCount = new Map<string, number>();
  for (const row of rows) {
    const serial = normalizeMatch(row.candidate.serial);
    if (serial) serialCount.set(serial, (serialCount.get(serial) ?? 0) + 1);
  }
  return rows.map((row) => {
    const serial = normalizeMatch(row.candidate.serial);
    if (!serial || (serialCount.get(serial) ?? 0) < 2) return row;
    return withFinding(row, "duplicate_in_import");
  });
}

export function withFinding(
  row: ParsedImportRow,
  finding: ImportFindingCode,
): ParsedImportRow {
  if (row.findings.includes(finding)) return row;
  return {
    ...row,
    findings: [...row.findings, finding],
    classification: row.classification === "error" ? "error" : "warning",
  };
}

function excelRawValue(cell: ExcelJS.Cell): ImportRawValue {
  const value = cell.value;
  if (value === null || value === undefined) return { kind: "empty" };
  if (typeof value === "string") return { kind: "string", value };
  if (typeof value === "number")
    return { kind: "number", value: String(value) };
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (value instanceof Date)
    return { kind: "date", value: value.toISOString() };
  if (
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    const result = cell.result;
    return {
      kind: "formula",
      formula:
        cell.formula ??
        String("sharedFormula" in value ? value.sharedFormula : value.formula),
      cached:
        result instanceof Date
          ? result.toISOString()
          : typeof result === "string" ||
              typeof result === "number" ||
              typeof result === "boolean"
            ? result
            : null,
    };
  }
  return { kind: "string", value: valueText(value) };
}

function valueText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("result" in value && value.result !== undefined)
      return String(value.result);
    if ("formula" in value) return String(value.formula);
    return JSON.stringify(value);
  }
  return String(value);
}

function mappedValue(value: ImportRawValue): string | undefined {
  switch (value.kind) {
    case "empty":
      return undefined;
    case "string":
    case "number":
    case "date":
      return value.value;
    case "boolean":
      return String(value.value);
    case "formula":
      return value.cached === null ? undefined : String(value.cached);
  }
}

function serialValue(value: ImportRawValue | undefined): string | null {
  if (!value) return null;
  if (value.kind === "formula") {
    throw new ImportFileError("formula_serial_rejected");
  }
  if (value.kind === "number") {
    if (
      !/^-?\d+(?:\.0+)?$/.test(value.value) ||
      !Number.isSafeInteger(Number(value.value))
    ) {
      throw new ImportFileError("unsafe_numeric_serial");
    }
    const integer = value.value.replace(/\.0+$/, "");
    return integer;
  }
  return nullable(mappedValue(value));
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeMatch(value: string | null): string | null {
  return value ? value.trim().replace(/\s+/g, " ").toLowerCase() : null;
}

function headerKey(header: string): string {
  return header.trim().replace(/\s+/g, " ").toLowerCase();
}

function enforceCellLimits(cells: readonly ImportRawCell[]): void {
  for (const cell of cells) {
    if (JSON.stringify(cell.value).length > IMPORT_LIMITS.cellCharacters) {
      throw new ImportFileError("cell_limit_exceeded");
    }
  }
}

function enforceHeaderLimits(headers: readonly string[]): void {
  if (
    headers.some((header) => header.length > IMPORT_LIMITS.headerCharacters)
  ) {
    throw new ImportFileError("header_limit_exceeded");
  }
}

function enforceExpandedEvidenceLimit(characters: number): void {
  if (characters > IMPORT_LIMITS.expandedEvidenceCharacters) {
    throw new ImportFileError("expanded_evidence_limit_exceeded");
  }
}

function xmlScanText(bytes: Buffer): string {
  return bytes
    .toString("latin1")
    .replaceAll("\0", "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    );
}
