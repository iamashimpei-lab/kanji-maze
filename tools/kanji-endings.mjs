const HARAI_TYPES = new Set(["㇇", "㇋", "㇏", "㇒", "㇓", "㇙", "㇝"]);
const HANE_TYPES = new Set(["㇁", "㇂", "㇃", "㇆", "㇈", "㇉", "㇌", "㇖", "㇚", "㇛", "㇟", "㇠", "㇡", "㇢"]);
const TOME_TYPES = new Set(["㇐", "㇑", "㇔", "㇀", "㇄", "㇅", "㇊", "㇍", "㇎", "㇕", "㇗", "㇘", "㇜", "㇞"]);

function baseStrokeType(type) {
  return type.replace(/[a-z]$/i, "");
}

// 複合 type は最後の筆致で終端を分類する。未知・欠落は安全側の tome。
export function classifyStrokeEnding(type) {
  if (!type) return { ending: "tome", known: false };
  const terminalType = baseStrokeType(type.split("/").at(-1));
  if (HARAI_TYPES.has(terminalType)) return { ending: "harai", known: true };
  if (HANE_TYPES.has(terminalType)) return { ending: "hane", known: true };
  if (TOME_TYPES.has(terminalType)) return { ending: "tome", known: true };
  return { ending: "tome", known: false };
}
