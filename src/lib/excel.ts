// src/lib/excel.ts
import * as XLSX from 'xlsx';
import type { Row } from './csv';

/**
 * Convert Row data to Excel workbook
 */
export function rowsToExcel(rows: Row[], titleLen: number, descLen: number, kwCount: number): XLSX.WorkBook {
  // Create worksheet data
  const worksheetData = [
    // Header row
    ['filename', 'platform', 'title', 'description', 'keywords', 'asset_type', 'extension', 'title_length', 'description_length', 'keywords_count'],
    // Data rows
    ...rows.map(r => [
      r.filename,
      r.platform,
      r.title,
      r.description,
      r.keywords.join('; '),
      r.assetType,
      r.extension,
      titleLen,
      descLen,
      kwCount
    ])
  ];

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths for better readability
  worksheet['!cols'] = [
    { wch: 30 }, // filename
    { wch: 12 }, // platform
    { wch: 50 }, // title
    { wch: 80 }, // description
    { wch: 100 }, // keywords
    { wch: 12 }, // asset_type
    { wch: 10 }, // extension
    { wch: 12 }, // title_length
    { wch: 18 }, // description_length
    { wch: 15 }  // keywords_count
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Metadata');
  return workbook;
}

/**
 * Convert Excel workbook to buffer/blob
 */
export function excelToBlob(workbook: XLSX.WorkBook): Blob {
  const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Create Excel file for a specific vector format
 */
export function createVectorFormatExcel(
  rows: Row[],
  format: 'ai' | 'eps' | 'svg',
  titleLen: number,
  descLen: number,
  kwCount: number
): Blob {
  // Filter rows for vector assets and create rows with the specified format extension
  const vectorRows = rows
    .filter(r => r.assetType === 'vector' && !r.error)
    .map(r => {
      // Get base filename without extension
      const baseName = r.filename.replace(/\.[^.]+$/, '');
      return {
        ...r,
        filename: `${baseName}.${format}`,
        extension: format
      };
    });

  // If no vector rows, create empty Excel file
  if (vectorRows.length === 0) {
    const emptyWorkbook = XLSX.utils.book_new();
    const emptyWorksheet = XLSX.utils.aoa_to_sheet([['filename', 'platform', 'title', 'description', 'keywords', 'asset_type', 'extension', 'title_length', 'description_length', 'keywords_count']]);
    XLSX.utils.book_append_sheet(emptyWorkbook, emptyWorksheet, 'Metadata');
    return excelToBlob(emptyWorkbook);
  }

  const workbook = rowsToExcel(vectorRows, titleLen, descLen, kwCount);
  return excelToBlob(workbook);
}

