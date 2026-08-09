export function selectAnswerChoices(correct, pool, random = Math.random) {
  if (!correct?.char) throw new Error("正解の漢字が必要です");
  const unique = [];
  const seen = new Set([correct.char]);
  for (const candidate of pool) {
    if (!candidate?.char || seen.has(candidate.char)) continue;
    seen.add(candidate.char);
    unique.push(candidate);
  }
  if (unique.length < 3) throw new Error("誤答候補は3字以上必要です");
  const sameTheme = shuffleWith(unique.filter((candidate) => candidate.theme === correct.theme), random);
  const otherThemes = shuffleWith(unique.filter((candidate) => candidate.theme !== correct.theme), random);
  return shuffleWith([correct, ...sameTheme.slice(0, 3), ...otherThemes].slice(0, 4), random);
}

function shuffleWith(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}
