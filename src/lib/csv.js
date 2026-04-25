// Simple CSV exporter for Excel-compatible UTF-8 BOM CSV files

function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows, headers) {
  const head = headers.map((h) => escapeCell(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCell(typeof h.value === 'function' ? h.value(r) : r[h.key])).join(',')).join('\n');
  return head + '\n' + body;
}

export function downloadCsv(filename, csv) {
  const bom = '﻿';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportRowsAsCsv(filename, rows, headers) {
  downloadCsv(filename, toCsv(rows, headers));
}
