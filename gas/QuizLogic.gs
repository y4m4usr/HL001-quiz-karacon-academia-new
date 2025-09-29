const NORMALIZE_FOR_KEY = typeof normalizeKeyPart === 'function'
  ? normalizeKeyPart
  : function(value) {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
    };

function buildQuestion(correctItem, allItems) {
  if (!correctItem || !correctItem.imageAsset) return null;

  const distractors = pickDistractors_(correctItem, allItems);
  if (distractors.length < 3) return null;

  const qid = Utilities.getUuid();
  const hints = correctItem.hints || { spec: '', comment: '' };
  const thumbAsset = correctItem.thumbAsset || null;

  const options = shuffle([correctItem, ...distractors]).map(createOptionPayload_);

  const question = {
    qid,
    image: {
      raw: (correctItem.imageAsset && correctItem.imageAsset.raw) || '',
      cdn: (correctItem.imageAsset && correctItem.imageAsset.cdn) || null,
    },
    specs: {
      dia: (correctItem.specs && correctItem.specs.dia) || '',
      gdia: (correctItem.specs && correctItem.specs.gdia) || '',
      bc: (correctItem.specs && correctItem.specs.bc) || '',
    },
    correct: {
      key: correctItem.key,
      label: correctItem.label,
      thumb: thumbAsset
        ? {
            raw: thumbAsset.raw || '',
            cdn: thumbAsset.cdn || null,
          }
        : null,
      series: correctItem.series,
      brand: correctItem.brand,
      color: correctItem.color,
      wear: correctItem.wear,
    },
    options,
    hints: {
      spec: hints.spec || '',
      comment: hints.comment || '',
    },
  };

  question.questionId = qid;
  question.lensUrl = question.image.raw;
  question.lensFallbackUrl = question.image.cdn || '';
  question.thumbUrl = question.correct.thumb ? question.correct.thumb.raw || '' : '';
  question.thumbFallbackUrl = question.correct.thumb ? question.correct.thumb.cdn || '' : '';
  question.optionsText = options.map(opt => opt.label);
  question.correctAnswer = question.correct.label;
  question.hint1 = question.hints.spec;
  question.hint2 = question.hints.comment;

  return question;
}

function pickDistractors_(correctItem, pool) {
  const correctTokens = toTokenSet_(correctItem.colorTokens);
  const correctBrandKey = correctItem.brandKey || NORMALIZE_FOR_KEY(correctItem.brand);
  const used = new Set([correctItem.key]);

  const colorMatches = [];
  const sameBrand = [];
  const fallback = [];

  pool.forEach(item => {
    if (!item || used.has(item.key)) return;

    const candidateTokens = toTokenSet_(item.colorTokens);
    const candidateBrandKey = item.brandKey || NORMALIZE_FOR_KEY(item.brand);

    if (hasTokenOverlap_(correctTokens, candidateTokens)) {
      colorMatches.push(item);
      return;
    }

    if (candidateBrandKey && candidateBrandKey === correctBrandKey) {
      sameBrand.push(item);
      return;
    }

    fallback.push(item);
  });

  shuffle(colorMatches);
  shuffle(sameBrand);
  shuffle(fallback);

  const results = [];
  const pushFrom = list => {
    for (let i = 0; i < list.length && results.length < 3; i++) {
      const candidate = list[i];
      if (!candidate || used.has(candidate.key)) continue;
      results.push(candidate);
      used.add(candidate.key);
    }
  };

  pushFrom(colorMatches);
  pushFrom(sameBrand);
  pushFrom(fallback);

  return results.slice(0, 3);
}

function toTokenSet_(value) {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  if (Array.isArray(value)) {
    return new Set(value.map(NORMALIZE_FOR_KEY));
  }
  return new Set([NORMALIZE_FOR_KEY(value)]);
}

function hasTokenOverlap_(tokensA, tokensB) {
  if (!tokensA || !tokensB) return false;
  const setA = tokensA instanceof Set ? tokensA : toTokenSet_(tokensA);
  const setB = tokensB instanceof Set ? tokensB : toTokenSet_(tokensB);
  for (const token of setA) {
    if (setB.has(token)) return true;
  }
  return false;
}

function createOptionPayload_(item) {
  return {
    key: item.key,
    label: item.label,
    brand: item.brand,
    color: item.color,
    series: item.series,
    wear: item.wear,
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function calculateScore(isCorrect, hintsUsed, timeTaken) {
  if (!isCorrect) return 0;

  let hintCount = 0;
  if (Array.isArray(hintsUsed)) {
    hintCount = hintsUsed.filter(Boolean).length;
  } else if (hintsUsed && typeof hintsUsed === 'object') {
    hintCount = Object.keys(hintsUsed).filter(key => hintsUsed[key]).length;
  }

  const hintPenalty = Math.min(hintCount * 3, 30);
  const timePenalty = timeTaken && isFinite(timeTaken)
    ? Math.min(Math.max(timeTaken - 20, 0) * 2, 30)
    : 0;

  return Math.max(0, 100 - hintPenalty - timePenalty);
}
