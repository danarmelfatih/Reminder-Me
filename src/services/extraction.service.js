import fs from 'node:fs';
import { parseOffice } from 'officeparser';
import PPT from 'ppt-to-text';
import WordExtractor from 'word-extractor';
import * as XLSX from 'xlsx';
import { config } from '../config.js';

const SUPPORTED = new Set(['txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

function normalizeText(value) {
  const text = String(value ?? '')
    .replaceAll('\u0000', '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (text.length <= config.documentExtractionMaxChars) return text;
  return text.slice(0, config.documentExtractionMaxChars);
}

async function extractOpenXml(buffer, extension) {
  const ast = await parseOffice(buffer, {
    fileType: extension,
    ocr: false,
    abortSignal: AbortSignal.timeout(config.documentExtractionTimeoutMs),
    pdfParserConfig: {
      separateProcess: false,
      extractTextColor: false,
    },
  });
  const result = await ast.to('text');
  return result.value;
}

async function extractWord(buffer, extension) {
  if (extension === 'docx') return extractOpenXml(buffer, extension);
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return document.getBody();
}

function extractSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    return `# ${name}\n${csv}`;
  }).join('\n\n');
}

export function supportedDocumentExtension(extension) {
  return SUPPORTED.has(String(extension ?? '').toLowerCase());
}

export async function extractDocumentText(absolutePath, extension) {
  const ext = String(extension ?? '').toLowerCase();
  if (!SUPPORTED.has(ext)) {
    return {
      status: 'unsupported',
      text: '',
      error: `Ekstraksi teks untuk .${ext || 'unknown'} belum didukung`,
    };
  }

  const buffer = await fs.promises.readFile(absolutePath);
  let text;
  if (ext === 'txt') {
    text = buffer.toString('utf8');
  } else if (ext === 'pdf' || ext === 'pptx') {
    text = await extractOpenXml(buffer, ext);
  } else if (ext === 'doc' || ext === 'docx') {
    text = await extractWord(buffer, ext);
  } else if (ext === 'xls' || ext === 'xlsx') {
    text = extractSpreadsheet(buffer);
  } else if (ext === 'ppt') {
    text = PPT.extractText(buffer);
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      status: 'unsupported',
      text: '',
      error: 'Dokumen tidak mengandung teks yang dapat diekstrak',
    };
  }
  return { status: 'done', text: normalized, error: null };
}
