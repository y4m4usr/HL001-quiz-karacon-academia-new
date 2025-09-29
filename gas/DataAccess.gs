const MASTER_SHEET_NAME = 'master';
const CATEGORY_SHEET_NAME = 'カラーカテゴリ';
const DATA_START_ROW = 3;
const DEFAULT_ITEM_COUNT = 10;

const MASTER_REQUIRED_COLUMNS = Object.freeze([
  'E',
  COLS.MASTER.BRAND,
  COLS.MASTER.COLOR,
  COLS.MASTER.WEAR_PERIOD,
  COLS.MASTER.LENS_URL,
]);

const CATEGORY_COLS = Object.freeze({
  BRAND: 2,
  COLOR: 3,
  TOKENS: 6,
});

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeKeyPart(value) {
  return normalizeString(value).toLowerCase();
}

function splitColors(text) {
  const normalized = normalizeString(text);
  if (!normalized) return [];
  return normalized
    .split(/[\s,、，／\/｜\|・]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
}

function ck(e, i, j, k) {
  return [e, i, j, k].map(normalizeKeyPart).join('|');
}

function colLetterToIndex(col) {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

function valueAt(row, colLetter) {
  return row[colLetterToIndex(colLetter)];
}

function makeBrandColorKey(brand, color) {
  return `${normalizeKeyPart(brand)}|${normalizeKeyPart(color)}`;
}

function buildOptionLabel(series, brand, color) {
  const parts = [];
  if (series) parts.push(series);
  const brandColor = [brand, color].filter(Boolean).join(' ');
  if (brandColor) {
    parts.push(brandColor);
  }
  return parts.join('｜');
}

function buildSpecHint(dia, gdia, bc) {
  const parts = [];
  if (dia) parts.push(`DIA:${dia}`);
  if (gdia) parts.push(`G.DIA:${gdia}`);
  if (bc) parts.push(`BC:${bc}`);
  return parts.join(' / ');
}

function isValidUrl(url) {
  if (isBlank(url)) return false;
  return /^https?:\/\/[^\s]+$/.test(String(url).trim());
}

function isSupportedImageUrl(url) {
  if (!isValidUrl(url)) return false;
  const trimmed = String(url).trim();
  return /^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net\/gh)\//.test(trimmed);
}

function convertRawToCdn(url) {
  const match = String(url).trim().match(/^https:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/);
  if (!match) return null;
  const [, owner, repo, branch, path] = match;
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

function toImageAsset(url) {
  const normalized = normalizeString(url);
  if (!isSupportedImageUrl(normalized)) return null;
  const asset = { raw: normalized, cdn: null };
  if (normalized.startsWith('https://raw.githubusercontent.com/')) {
    asset.cdn = convertRawToCdn(normalized);
  } else if (normalized.startsWith('https://cdn.jsdelivr.net/gh/')) {
    asset.cdn = normalized;
  }
  return asset;
}

function sanitizeCount(raw) {
  const n = Number(raw);
  if (!isFinite(n)) return DEFAULT_ITEM_COUNT;
  return Math.min(DEFAULT_ITEM_COUNT, Math.max(1, Math.floor(n)));
}

function readMaster_() {
  const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
  const sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    throw new Error(`マスターシート(${MASTER_SHEET_NAME})が見つかりません。`);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) {
    return { items: [], diagnostics: { totalRows: 0, emptyRows: 0, missingRequired: 0, invalidImageUrl: 0, duplicateKeys: 0, accepted: 0 } };
  }

  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();
  const diagnostics = {
    totalRows: values.length,
    emptyRows: 0,
    missingRequired: 0,
    invalidImageUrl: 0,
    duplicateKeys: 0,
    accepted: 0,
  };

  const items = [];
  const seenKeys = new Set();

  values.forEach((row, index) => {
    const rowNumber = DATA_START_ROW + index;

    if (row.every(isBlank)) {
      diagnostics.emptyRows++;
      return;
    }

    const series = normalizeString(valueAt(row, 'E'));
    const brand = normalizeString(valueAt(row, COLS.MASTER.BRAND));
    const color = normalizeString(valueAt(row, COLS.MASTER.COLOR));
    const wear = normalizeString(valueAt(row, COLS.MASTER.WEAR_PERIOD));
    const lensUrl = normalizeString(valueAt(row, COLS.MASTER.LENS_URL));
    const thumbUrl = normalizeString(valueAt(row, COLS.MASTER.THUMB_URL));
    const dia = normalizeString(valueAt(row, COLS.MASTER.DIA));
    const gdia = normalizeString(valueAt(row, COLS.MASTER.GDIA));
    const bc = normalizeString(valueAt(row, COLS.MASTER.BC));
    const comment = normalizeString(valueAt(row, COLS.MASTER.COMMENT));

    const missingRequired = MASTER_REQUIRED_COLUMNS.some(col => isBlank(valueAt(row, col)));
    if (missingRequired) {
      diagnostics.missingRequired++;
      return;
    }

    const imageAsset = toImageAsset(lensUrl);
    if (!imageAsset) {
      diagnostics.invalidImageUrl++;
      return;
    }

    const key = ck(series, brand, color, wear);
    if (seenKeys.has(key)) {
      diagnostics.duplicateKeys++;
      return;
    }

    const thumbAsset = toImageAsset(thumbUrl);

    seenKeys.add(key);
    diagnostics.accepted++;

    items.push({
      rowNumber,
      series,
      brand,
      color,
      wear,
      key,
      brandColorKey: makeBrandColorKey(brand, color),
      imageAsset,
      thumbAsset,
      specs: {
        dia,
        gdia,
        bc,
      },
      hints: {
        spec: buildSpecHint(dia, gdia, bc),
        comment,
      },
      label: buildOptionLabel(series, brand, color),
    });
  });

  return { items, diagnostics };
}

function readCategories_() {
  const map = new Map();
  const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
  const sheet = ss.getSheetByName(CATEGORY_SHEET_NAME);
  if (!sheet) {
    throw new Error(`カテゴリシート(${CATEGORY_SHEET_NAME})が見つかりません。`);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return map;

  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, lastCol).getValues();

  values.forEach(row => {
    const brand = normalizeString(row[CATEGORY_COLS.BRAND - 1]);
    const color = normalizeString(row[CATEGORY_COLS.COLOR - 1]);
    if (!brand || !color) return;

    const tokens = splitColors(row[CATEGORY_COLS.TOKENS - 1]);
    const key = makeBrandColorKey(brand, color);

    if (!map.has(key)) {
      map.set(key, new Set());
    }

    const bucket = map.get(key);
    tokens.forEach(token => bucket.add(token));
  });

  return map;
}

function applyCategories_(items, categoryMap) {
  items.forEach(item => {
    const tokensSet = categoryMap.get(item.brandColorKey);
    const tokens = tokensSet ? Array.from(tokensSet) : splitColors(item.color);
    const normalized = tokens.length ? tokens : [normalizeKeyPart(item.color)];
    const deduped = new Set(normalized.map(normalizeKeyPart));
    if (deduped.size === 0) {
      deduped.add(normalizeKeyPart(item.brand));
      deduped.add(normalizeKeyPart(item.color));
    }
    item.colorTokens = deduped;
    item.brandKey = normalizeKeyPart(item.brand);
  });
}

function prepareItemPool_() {
  const { items, diagnostics } = readMaster_();
  const categoryMap = readCategories_();
  applyCategories_(items, categoryMap);
  return {
    items,
    diagnostics,
    categoryEntries: categoryMap.size,
  };
}

function getQuizItems(count) {
  const target = sanitizeCount(count);
  const dataset = prepareItemPool_();
  const items = dataset.items;

  if (items.length < 4) {
    throw new Error('クイズを生成するための有効なデータが不足しています。');
  }

  const pool = shuffle(items.slice());
  const questions = [];
  const usedKeys = new Set();

  for (let i = 0; i < pool.length && questions.length < target; i++) {
    const item = pool[i];
    if (usedKeys.has(item.key)) continue;

    const question = buildQuestion(item, items);
    if (!question) continue;

    questions.push(question);
    usedKeys.add(item.key);
  }

  if (questions.length < target) {
    throw new Error(`指定件数(${target})の問題を生成できませんでした (作成数: ${questions.length})。`);
  }

  return questions;
}

function adaptQuestionForLegacy(question) {
  return {
    questionId: question.qid,
    lensUrl: question.image.raw || '',
    lensFallbackUrl: question.image.cdn || '',
    thumbUrl: question.correct.thumb ? question.correct.thumb.raw || '' : '',
    thumbFallbackUrl: question.correct.thumb ? question.correct.thumb.cdn || '' : '',
    options: question.options.map(opt => opt.label),
    correctAnswer: question.correct.label,
    answerKey: question.correct.key,
    hint1: question.hints.spec,
    hint2: question.hints.comment,
  };
}

function buildItemsResponse_(count) {
  const questions = getQuizItems(count);
  return {
    count: questions.length,
    items: questions,
  };
}

const __legacyDoGet = typeof globalThis.doGet === 'function' ? globalThis.doGet : null;

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = normalizeKeyPart(params.action || params.Action || '');

  if (action === 'items') {
    const count = sanitizeCount(params.count);
    const payload = buildItemsResponse_(count);
    return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'rankings') {
    if (globalThis.AuthRank && typeof globalThis.AuthRank.handleRankings === 'function') {
      return globalThis.AuthRank.handleRankings(params);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'rankings API unavailable' })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'mystats') {
    if (globalThis.AuthRank && typeof globalThis.AuthRank.handleMystats === 'function') {
      return globalThis.AuthRank.handleMystats(params);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'mystats API unavailable' })).setMimeType(ContentService.MimeType.JSON);
  }

  if (typeof __legacyDoGet === 'function') {
    return __legacyDoGet(e);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Quizカラコンアカデミア')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getQuestions(params) {
  const count = sanitizeCount(params && params.count);
  return getQuizItems(count).map(adaptQuestionForLegacy);
}

function debugDataProcessing() {
  try {
    const dataset = prepareItemPool_();
    const summary = {
      master_totalRows: dataset.diagnostics.totalRows,
      master_emptyRows: dataset.diagnostics.emptyRows,
      master_missingRequired: dataset.diagnostics.missingRequired,
      master_invalidImageUrl: dataset.diagnostics.invalidImageUrl,
      master_duplicateKeys: dataset.diagnostics.duplicateKeys,
      master_accepted: dataset.diagnostics.accepted,
      category_entries: dataset.categoryEntries,
      usable_items: dataset.items.length,
    };

    try {
      const sample = getQuizItems(Math.min(DEFAULT_ITEM_COUNT, dataset.items.length));
      summary.sampleQuestions = sample.length;
    } catch (innerErr) {
      summary.sampleQuestionsError = innerErr.message;
    }

    return summary;
  } catch (err) {
    return { error: err.message, stack: err.stack };
  }
}



