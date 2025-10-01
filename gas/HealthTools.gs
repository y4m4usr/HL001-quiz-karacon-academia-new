// ===================================================================
// Health diagnostics for quiz data pipeline
// ===================================================================

function getHealthReport() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_IDS.MASTER);
    const masterSheet = ss.getSheetByName('master');
    const categorySheet = ss.getSheetByName(CATEGORY_SHEET_NAME);

    if (!masterSheet) {
      return { error: 'master シートが見つかりません。' };
    }

    const masterHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.MASTER_HEADER_ROWS) || 2;
    const masterLastColLetter = (SHEET_LAYOUT && SHEET_LAYOUT.MASTER_LAST_COL_A1) || 'AL';
    const masterLastColIndex = colLetterToIndex_(masterLastColLetter);
    const masterDataStartRow = masterHeaderRows + 1;
    const masterSheetLastRow = masterSheet.getLastRow();
    const masterSheetLastCol = masterSheet.getLastColumn();
    const masterConfigColCount = masterLastColIndex + 1;
    const masterRangeRowCount = Math.max(0, masterSheetLastRow - masterHeaderRows);
    const masterRangeColCount = Math.min(masterSheetLastCol, masterConfigColCount);
    const masterData = masterRangeRowCount > 0 && masterRangeColCount > 0
      ? masterSheet.getRange(masterDataStartRow, 1, masterRangeRowCount, masterRangeColCount).getValues()
      : [];

    const categoryHeaderRows = (SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_HEADER_ROWS) || 1;
    const categoryLastColLetter = (SHEET_LAYOUT && SHEET_LAYOUT.CATEGORY_LAST_COL_A1) || 'F';
    const categoryLastColIndex = colLetterToIndex_(categoryLastColLetter);
    const categoryDataStartRow = categoryHeaderRows + 1;
    const categorySheetLastRow = categorySheet ? categorySheet.getLastRow() : 0;
    const categorySheetLastCol = categorySheet ? categorySheet.getLastColumn() : 0;
    const categoryConfigColCount = categoryLastColIndex + 1;
    const categoryRangeRowCount = categorySheet ? Math.max(0, categorySheetLastRow - categoryHeaderRows) : 0;
    const categoryRangeColCount = categorySheet ? Math.min(categorySheetLastCol, categoryConfigColCount) : 0;
    const categoryData = categorySheet && categoryRangeRowCount > 0 && categoryRangeColCount > 0
      ? categorySheet.getRange(categoryDataStartRow, 1, categoryRangeRowCount, categoryRangeColCount).getValues()
      : [];

    const catMap = categorySheet ? buildCategoryMap_(categoryData) : new Map();
    const evaluation = evaluateMasterRows_(masterData, masterDataStartRow, catMap);
    const summary = evaluation && evaluation.summary ? evaluation.summary : {};
    const manualFix = evaluation && evaluation.manualFix ? evaluation.manualFix : [];
    const candidates = evaluation && evaluation.candidates ? evaluation.candidates : [];
    const strictBlankCheck = isStrictBlankCheckEnabled_();

    const manualFixByReason = {};
    manualFix.forEach(function(entry) {
      const reason = entry.reason || 'unknown';
      manualFixByReason[reason] = (manualFixByReason[reason] || 0) + 1;
    });

    const categoryHealth = buildCategoryHealth_(categoryData, categoryDataStartRow);
    const requiredMissing = summary.requiredMissingByColumn || {};

    const health = {
      generatedAt: new Date().toISOString(),
      master: {
        sheetName: masterSheet.getName(),
        headerRows: masterHeaderRows,
        dataStartRow: masterDataStartRow,
        sheetLastRow: masterSheetLastRow,
        sheetLastCol: safeColLetter_(masterSheetLastCol),
        configLastCol: masterLastColLetter,
        range: {
          rows: masterRangeRowCount,
          cols: masterRangeColCount,
          a1Notation: toA1Range_(masterDataStartRow, masterRangeRowCount, masterRangeColCount)
        },
        summary: {
          totalRowsFetched: summary.totalMasterRows || 0,
          nonEmptyRows: summary.nonEmptyRows || 0,
          excludedEmptyRows: summary.excludedEmptyRows || 0,
          excludedBlankCells: summary.excludedBlankCells || 0,
          excludedMissingRequired: summary.excludedMissingRequired || 0,
          excludedInvalidLensUrl: summary.excludedInvalidLensUrl || 0,
          excludedMissingCategory: summary.excludedMissingCategory || 0,
          requiredMissingByColumn: requiredMissing,
          validCandidateCount: candidates.length,
          uniqueCandidateKeys: summary.validCandidateKeys ? summary.validCandidateKeys.size : 0
        },
        checks: {
          startsAtRow3: masterDataStartRow === 3,
          sheetHasAllConfiguredColumns: masterSheetLastCol >= masterConfigColCount,
          usingConfiguredColumnSpan: masterRangeColCount === masterConfigColCount
        }
      },
      category: categorySheet ? {
        sheetName: categorySheet.getName(),
        headerRows: categoryHeaderRows,
        dataStartRow: categoryDataStartRow,
        sheetLastRow: categorySheetLastRow,
        sheetLastCol: safeColLetter_(categorySheetLastCol),
        configLastCol: categoryLastColLetter,
        range: {
          rows: categoryRangeRowCount,
          cols: categoryRangeColCount,
          a1Notation: toA1Range_(categoryDataStartRow, categoryRangeRowCount, categoryRangeColCount)
        },
        stats: categoryHealth,
        mapEntries: catMap.size
      } : null,
      manualFix: {
        total: manualFix.length,
        byReason: manualFixByReason,
        samples: manualFix.slice(0, 5)
      },
      status: {
        candidateCount: candidates.length,
        uniqueCandidateKeys: summary.validCandidateKeys ? summary.validCandidateKeys.size : 0,
        strictBlankCheck: strictBlankCheck
      }
    };

    health.notes = buildHealthNotes_(health);

    return health;
  } catch (e) {
    console.error('getHealthReport failed: ' + e.stack);
    return { error: 'ヘルスチェックでエラーが発生しました: ' + e.message, stack: e.stack };
  }
}

function buildCategoryHealth_(categoryData, startRow) {
  const stats = {
    totalRows: categoryData.length,
    rowsWithBrand: 0,
    rowsWithColor: 0,
    rowsWithCategories: 0,
    missingBrand: 0,
    missingColor: 0,
    missingCategories: 0,
    samplesMissingBrand: [],
    samplesMissingColor: [],
    samplesMissingCategories: []
  };

  categoryData.forEach(function(row, index) {
    const rowNumber = startRow + index;
    const brand = s_(row[COL_C.SERIES - 1]);
    const color = s_(row[COL_C.COLOR - 1]);
    const cats = s_(row[COL_C.CATEGORIES - 1]);

    if (brand) {
      stats.rowsWithBrand++;
    } else if (stats.samplesMissingBrand.length < 5) {
      stats.samplesMissingBrand.push(rowNumber);
    }

    if (color) {
      stats.rowsWithColor++;
    } else if (stats.samplesMissingColor.length < 5) {
      stats.samplesMissingColor.push(rowNumber);
    }

    if (cats) {
      stats.rowsWithCategories++;
    } else if (stats.samplesMissingCategories.length < 5) {
      stats.samplesMissingCategories.push(rowNumber);
    }

    if (!brand) stats.missingBrand++;
    if (brand && !color) stats.missingColor++;
    if (brand && color && !cats) stats.missingCategories++;
  });

  return stats;
}

function buildHealthNotes_(health) {
  const notes = [];
  if (!health || !health.master) return notes;

  const master = health.master;
  const summary = master.summary || {};
  const required = summary.requiredMissingByColumn || {};
  const status = health.status || {};

  if (summary.nonEmptyRows === 0) {
    notes.push('master: 範囲に有効行がありません。HEADER_ROWS と範囲を確認してください。');
  }
  if (summary.nonEmptyRows > 0 && status.candidateCount === 0) {
    notes.push('master: 行は読み込まれていますが候補がゼロです。必須列の欠損やカテゴリ設定を確認してください。');
  }

  Object.keys(required).forEach(function(col) {
    const count = required[col];
    if (count > 0) {
      notes.push('必須列 ' + col + ' の未入力: ' + count + ' 行');
    }
  });

  if (summary.excludedBlankCells > 0) {
    notes.push('空白セルで除外された行: ' + summary.excludedBlankCells + ' 行');
  }

  if (summary.excludedInvalidLensUrl > 0) {
    notes.push('X列にURL形式でない値が存在: ' + summary.excludedInvalidLensUrl + ' 行');
  }

  if (summary.excludedMissingCategory > 0) {
    notes.push('カテゴリ未整備で除外された行: ' + summary.excludedMissingCategory + ' 行');
  }

  if (status.uniqueCandidateKeys < 4) {
    notes.push('ユニークCK件数が ' + status.uniqueCandidateKeys + ' 件 (最低4件必要)');
  }

  if (status.strictBlankCheck === false) {
    notes.push('STRICT_BLANK_CHECK が無効のため、必須列のみでチェック中です。');
  }

  if (health.category) {
    const catStats = health.category.stats || {};
    if (catStats.missingBrand > 0 || catStats.missingColor > 0 || catStats.missingCategories > 0) {
      notes.push('カテゴリシートの欠損: brand=' + catStats.missingBrand + ', color=' + catStats.missingColor + ', tags=' + catStats.missingCategories);
    }
  } else {
    notes.push('カテゴリシートが見つからないためカテゴリ紐付けができません。');
  }

  if (!master.checks.startsAtRow3) {
    notes.push('MASTER_HEADER_ROWS が仕様と異なります (開始行: ' + master.dataStartRow + ')');
  }
  if (!master.checks.sheetHasAllConfiguredColumns) {
    notes.push('master シートの実列数が設定値に不足しています (sheetLastCol=' + (master.sheetLastCol || 'N/A') + ', config=' + master.configLastCol + ')');
  }

  return notes;
}

function toA1Range_(startRow, rowCount, colCount) {
  if (rowCount <= 0 || colCount <= 0) return null;
  const endRow = startRow + rowCount - 1;
  const endCol = safeColLetter_(colCount);
  return 'A' + startRow + ':' + endCol + endRow;
}

function safeColLetter_(colNumber) {
  if (!colNumber || colNumber < 1) return null;
  return colIndexToLetter_(colNumber - 1);
}
