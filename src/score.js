function scoreArguments(input, wrongAnswers, mapEnabled) {
  if (typeof input === "number") {
    return { explorationRate: input, wrongAnswers: wrongAnswers ?? 0, mapEnabled: mapEnabled ?? true };
  }
  return {
    explorationRate: input.explorationRate ?? input.exploredRatio ?? 0,
    wrongAnswers: input.wrongAnswers ?? 0,
    mapEnabled: input.mapEnabled ?? input.hasMap ?? true,
  };
}

export function getScoreBreakdown(input, wrongAnswers, mapEnabled) {
  const values = scoreArguments(input, wrongAnswers, mapEnabled);
  const rate = Math.min(1, Math.max(0, values.explorationRate));
  const base = Math.round(1000 * (1 - rate)) + 200;
  const penalty = Math.max(0, Math.trunc(values.wrongAnswers)) * 300;
  const subtotal = Math.max(0, base - penalty);
  const multiplier = values.mapEnabled ? 1 : 1.5;
  const total = Math.max(0, Math.round(subtotal * multiplier));
  return { explorationRate: rate, base, penalty, subtotal, multiplier, total };
}

export function calculateScore(input, wrongAnswers, mapEnabled) {
  return getScoreBreakdown(input, wrongAnswers, mapEnabled).total;
}
