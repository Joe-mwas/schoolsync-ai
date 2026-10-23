/** Read a chosen file as CSV text: .csv as is, .xlsx converted by the server (first sheet). */
export async function readSpreadsheet(file: File): Promise<string> {
  if (/\.xls$/i.test(file.name)) {
    throw new Error('That is an old-style Excel file (.xls). In Excel choose File → Save As → "Excel Workbook (.xlsx)" or "CSV UTF-8", then upload it again.');
  }
  if (!/\.xlsx$/i.test(file.name)) return file.text();
  const res = await fetch("/api/import/excel", { method: "POST", body: file });
  const data = (await res.json().catch(() => ({}))) as { csv?: string; error?: string };
  if (!res.ok || typeof data.csv !== "string") throw new Error(data.error ?? "Couldn't read that Excel file");
  return data.csv;
}

export const SPREADSHEET_ACCEPT = ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
