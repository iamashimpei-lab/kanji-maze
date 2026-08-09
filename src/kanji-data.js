import { KANJI_DATA } from "./kanji-data.generated.js";

export { KANJI_DATA };

export const GRADE_MONTHS = {
  1: [9, 10, 11, 12, 1, 2, 3],
  2: [4, 5, 6, 7, 9, 10, 11, 12, 1, 2, 3],
  3: [4, 5, 6, 7, 9, 10, 11, 12, 1, 2, 3],
  4: [4, 5, 6, 7, 9, 10, 11],
  5: [4, 5, 6, 7, 9, 10, 11, 12, 1, 3],
  6: [4, 5, 6, 9, 10, 11, 12, 1, 3],
};

export function getKanjiPool(grade, month) {
  const selectedGrade = Number(grade);
  const selectedMonth = Number(month);
  const months = GRADE_MONTHS[selectedGrade];
  const monthIndex = months?.indexOf(selectedMonth) ?? -1;
  if (monthIndex < 0) return [];
  const allowedMonths = new Set(months.slice(0, monthIndex + 1));
  return KANJI_DATA.filter((kanji) => (
    kanji.grade < selectedGrade
    || (kanji.grade === selectedGrade && allowedMonths.has(kanji.month))
  ));
}

export function getKanji(char) {
  return KANJI_DATA.find((kanji) => kanji.char === char);
}
