(function (global) {
  'use strict';

  const RESULTS_SHEET_NAME = 'RESULTS';
  const HEADER_ROW = 1;
  const MIN_ATTEMPTS_FOR_RANKING = 3;
  const MAX_RANKING_ITEMS = 100;

  const RESULT_COL = Object.freeze({
    ANSWERED_AT: 1,
    UID: 2,
    SESSION_ID: 3,
    E: 4,
    I: 5,
    J: 6,
    K: 7,
    CK: 8,
    QID: 9,
    CORRECT: 10,
    TIME_MS: 11,
    SCORE: 12,
    APP_VER: 13,
    UA: 14,
  });

  function safeNormalize(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    return String(value).trim();
  }

  function canonicalizePart_(value) {
    const trimmed = safeNormalize(value).replace(/\s+/g, ' ');
    return trimmed.toLowerCase();
  }

  function canonicalCk(e, i, j, k) {
    if (typeof ck === 'function') {
      return ck(e, i, j, k);
    }
    return [canonicalizePart_(e), canonicalizePart_(i), canonicalizePart_(j), canonicalizePart_(k)].join('|');
  }

  function normalizeCkValue(value) {
    const trimmed = safeNormalize(value);
    if (!trimmed) {
      throw new Error('ck parameter is required');
    }
    const parts = trimmed.split('|');
    if (parts.length !== 4) {
      throw new Error('ck must be provided as E|I|J|K');
    }
    return canonicalCk(parts[0], parts[1], parts[2], parts[3]);
  }

  function parseBooleanCell(value) {
    if (value === true || value === false) return value;
    const normalized = safeNormalize(value).toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  function parseNumberCell(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function parseDateCell(value) {
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getResultsSheet_() {
    const ss = SpreadsheetApp.openById(SHEET_IDS.HISTORY);
    const sheet = ss.getSheetByName(RESULTS_SHEET_NAME);
    if (!sheet) {
      throw new Error(`RESULTS sheet not found (${RESULTS_SHEET_NAME})`);
    }
    return sheet;
  }

  function loadResultsRows_() {
    const sheet = getResultsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow <= HEADER_ROW) {
      return [];
    }
    const columnCount = sheet.getLastColumn();
    const values = sheet.getRange(HEADER_ROW + 1, 1, lastRow - HEADER_ROW, columnCount).getValues();
    return values.map(row => {
      const answeredAt = parseDateCell(row[RESULT_COL.ANSWERED_AT - 1]);
      const e = safeNormalize(row[RESULT_COL.E - 1]);
      const i = safeNormalize(row[RESULT_COL.I - 1]);
      const j = safeNormalize(row[RESULT_COL.J - 1]);
      const k = safeNormalize(row[RESULT_COL.K - 1]);
      const storedCk = safeNormalize(row[RESULT_COL.CK - 1]);
      const computedCk = canonicalCk(e, i, j, k);

      return {
        answeredAt,
        uid: safeNormalize(row[RESULT_COL.UID - 1]),
        sessionId: safeNormalize(row[RESULT_COL.SESSION_ID - 1]),
        e,
        i,
        j,
        k,
        ck: storedCk || computedCk,
        canonicalCk: computedCk,
        qid: safeNormalize(row[RESULT_COL.QID - 1]),
        correct: parseBooleanCell(row[RESULT_COL.CORRECT - 1]),
        timeMs: parseNumberCell(row[RESULT_COL.TIME_MS - 1]),
        score: parseNumberCell(row[RESULT_COL.SCORE - 1]),
        appVer: safeNormalize(row[RESULT_COL.APP_VER - 1]),
        ua: safeNormalize(row[RESULT_COL.UA - 1]),
      };
    }).filter(entry => entry.answeredAt !== null && entry.canonicalCk);
  }

  function determinePeriodStart_(period) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
      case 'daily':
        return start;
      case 'weekly': {
        const day = start.getDay();
        const isoDay = (day + 6) % 7; // Monday = 0
        const weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - isoDay);
        return weekStart;
      }
      case 'all':
        return new Date(0);
      default:
        throw new Error('period must be one of daily, weekly, all');
    }
  }

  function buildRanking_(params) {
    const canonicalKey = normalizeCkValue(params.ck);
    const period = (safeNormalize(params.period) || 'weekly').toLowerCase();
    const periodStart = determinePeriodStart_(period);

    const rows = loadResultsRows_().filter(row => {
      return row.answeredAt >= periodStart && row.canonicalCk === canonicalKey;
    });

    const aggregated = {};
    rows.forEach(row => {
      if (!row.uid) {
        return;
      }
      const bucket = aggregated[row.uid] || (aggregated[row.uid] = {
        uid: row.uid,
        attempts: 0,
        correctCount: 0,
        sumTimeMs: 0,
        totalScore: 0,
        lastAnsweredAt: row.answeredAt,
      });
      bucket.attempts += 1;
      bucket.sumTimeMs += row.timeMs;
      bucket.totalScore += row.score;
      if (row.correct) {
        bucket.correctCount += 1;
      }
      if (row.answeredAt > bucket.lastAnsweredAt) {
        bucket.lastAnsweredAt = row.answeredAt;
      }
    });

    const items = Object.values(aggregated)
      .filter(item => item.attempts >= MIN_ATTEMPTS_FOR_RANKING)
      .map(item => ({
        uid: item.uid,
        attempts: item.attempts,
        correct_count: item.correctCount,
        avg_time_ms: item.sumTimeMs / Math.max(1, item.attempts),
        total_score: item.totalScore,
        last_answered_at: item.lastAnsweredAt,
        accuracy: item.correctCount / Math.max(1, item.attempts),
      }))
      .sort((a, b) => {
        const correctDiff = b.correct_count - a.correct_count;
        if (correctDiff !== 0) return correctDiff;
        const timeDiff = a.avg_time_ms - b.avg_time_ms;
        if (timeDiff !== 0) return timeDiff;
        const attemptDiff = b.attempts - a.attempts;
        if (attemptDiff !== 0) return attemptDiff;
        const lastDiff = new Date(b.last_answered_at).getTime() - new Date(a.last_answered_at).getTime();
        if (lastDiff !== 0) return lastDiff;
        return a.uid.localeCompare(b.uid);
      })
      .slice(0, MAX_RANKING_ITEMS);

    return {
      ok: true,
      ck: canonicalKey,
      period,
      generated_at: new Date(),
      items,
    };
  }

  function buildMystats_(params) {
    const uid = safeNormalize(params.uid);
    if (!uid) {
      throw new Error('uid parameter is required');
    }

    const rows = loadResultsRows_().filter(row => row.uid === uid);
    const totals = {
      attempts: 0,
      correct: 0,
      sumTime: 0,
      totalScore: 0,
      lastAnsweredAt: null,
    };

    const byCk = {};
    rows.forEach(row => {
      const key = row.canonicalCk;
      if (!byCk[key]) {
        byCk[key] = {
          ck: key,
          attempts: 0,
          correct: 0,
          sumTime: 0,
          totalScore: 0,
          bestStreak: 0,
          timeline: [],
          lastAnsweredAt: null,
        };
      }
      const bucket = byCk[key];
      bucket.attempts += 1;
      totals.attempts += 1;
      bucket.sumTime += row.timeMs;
      totals.sumTime += row.timeMs;
      bucket.totalScore += row.score;
      totals.totalScore += row.score;
      bucket.timeline.push({ answeredAt: row.answeredAt, correct: row.correct });
      if (row.correct) {
        bucket.correct += 1;
        totals.correct += 1;
      }
      if (!bucket.lastAnsweredAt || row.answeredAt > bucket.lastAnsweredAt) {
        bucket.lastAnsweredAt = row.answeredAt;
      }
      if (!totals.lastAnsweredAt || row.answeredAt > totals.lastAnsweredAt) {
        totals.lastAnsweredAt = row.answeredAt;
      }
    });

    const ckSummaries = Object.values(byCk).map(bucket => {
      bucket.timeline.sort((a, b) => a.answeredAt - b.answeredAt);
      let streak = 0;
      let best = 0;
      bucket.timeline.forEach(entry => {
        if (entry.correct) {
          streak += 1;
          if (streak > best) {
            best = streak;
          }
        } else {
          streak = 0;
        }
      });
      const avgTime = bucket.sumTime / Math.max(1, bucket.attempts);
      return {
        ck: bucket.ck,
        attempts: bucket.attempts,
        correct_count: bucket.correct,
        accuracy: bucket.correct / Math.max(1, bucket.attempts),
        avg_time_ms: avgTime,
        total_score: bucket.totalScore,
        best_streak: best,
        last_answered_at: bucket.lastAnsweredAt,
      };
    }).sort((a, b) => {
      const lastDiff = new Date(b.last_answered_at || 0).getTime() - new Date(a.last_answered_at || 0).getTime();
      if (lastDiff !== 0) return lastDiff;
      return b.attempts - a.attempts;
    });

    return {
      ok: true,
      uid,
      generated_at: new Date(),
      totals: {
        attempts: totals.attempts,
        correct_count: totals.correct,
        accuracy: totals.correct / Math.max(1, totals.attempts),
        avg_time_ms: totals.sumTime / Math.max(1, totals.attempts),
        total_score: totals.totalScore,
        last_answered_at: totals.lastAnsweredAt,
      },
      by_ck: ckSummaries,
    };
  }

  function toJsonResponse(payload) {
    return ContentService.createTextOutput(JSON.stringify(payload, (_, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    })).setMimeType(ContentService.MimeType.JSON);
  }

  function handleRankings(params) {
    try {
      return toJsonResponse(buildRanking_(params));
    } catch (error) {
      return toJsonResponse({ ok: false, error: error.message });
    }
  }

  function handleMystats(params) {
    try {
      return toJsonResponse(buildMystats_(params));
    } catch (error) {
      return toJsonResponse({ ok: false, error: error.message });
    }
  }

  global.AuthRank = Object.assign({}, global.AuthRank || {}, {
    handleRankings,
    handleMystats,
    _buildRanking: buildRanking_,
    _buildMystats: buildMystats_,
  });

})(this);

