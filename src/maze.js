export const DEFAULT_GRID_SIZE = 31;
export const GRID_PADDING = 3;
export const SNAP_DISTANCE = 2;

export function gridSizeForStrokeCount(strokeCount) {
  if (strokeCount <= 4) return 31;
  if (strokeCount <= 8) return 39;
  if (strokeCount <= 12) return 47;
  return 55;
}

export function cellKey(x, y) {
  return `${x},${y}`;
}

export function pointToCell(point, size = DEFAULT_GRID_SIZE, padding = GRID_PADDING) {
  const usable = size - 1 - padding * 2;
  return {
    x: Math.round(padding + point[0] * usable),
    y: Math.round(padding + point[1] * usable),
  };
}

// 端点を両方含む整数グリッド上の Bresenham 線分。
export function bresenham(x0, y0, x1, y1) {
  const points = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (x !== x1 || y !== y1) {
    const previousX = x;
    const previousY = y;
    const twiceError = error * 2;
    if (twiceError >= dy) {
      error += dy;
      x += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y += sy;
    }
    // 通路の連結判定は4近傍なので、対角移動には直交セルを1つ補う。
    if (x !== previousX && y !== previousY) points.push({ x, y: previousY });
    points.push({ x, y });
  }
  return points;
}

function addStrokeCell(cells, point, strokeId) {
  const key = cellKey(point.x, point.y);
  const existing = cells.get(key);
  if (existing) {
    if (!existing.strokeIds.includes(strokeId)) existing.strokeIds.push(strokeId);
    return;
  }
  cells.set(key, {
    x: point.x,
    y: point.y,
    type: "stroke",
    strokeIds: [strokeId],
  });
}

export function rasterizeStrokes(strokes, size = DEFAULT_GRID_SIZE) {
  const cells = new Map();
  strokes.forEach((stroke, strokeId) => {
    for (let index = 1; index < stroke.length; index += 1) {
      const from = pointToCell(stroke[index - 1], size);
      const to = pointToCell(stroke[index], size);
      for (const point of bresenham(from.x, from.y, to.x, to.y)) {
        addStrokeCell(cells, point, strokeId);
      }
    }
    if (stroke.length === 1) addStrokeCell(cells, pointToCell(stroke[0], size), strokeId);
  });
  return cells;
}

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function connectedComponents(cells) {
  const remaining = new Set(cells.keys());
  const components = [];
  while (remaining.size > 0) {
    const first = remaining.values().next().value;
    const queue = [cells.get(first)];
    const component = [];
    remaining.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor];
      component.push(cell);
      for (const [dx, dy] of NEIGHBORS) {
        const key = cellKey(cell.x + dx, cell.y + dy);
        if (!remaining.has(key)) continue;
        remaining.delete(key);
        queue.push(cells.get(key));
      }
    }
    components.push(component);
  }
  return components;
}

function nearestComponentPair(components) {
  let best = null;
  for (let firstIndex = 0; firstIndex < components.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < components.length; secondIndex += 1) {
      for (const from of components[firstIndex]) {
        for (const to of components[secondIndex]) {
          const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
          if (!best || distance < best.distance) best = { from, to, distance };
        }
      }
    }
  }
  return best;
}

function makeLPath(from, to) {
  const corner = { x: to.x, y: from.y };
  const first = bresenham(from.x, from.y, corner.x, corner.y);
  const second = bresenham(corner.x, corner.y, to.x, to.y);
  return [...first, ...second.slice(1)];
}

// KanjiVG 上で目には接して見える画の端点を、吊り橋にせず画の一部としてつなぐ。
export function snapNearbyEndpoints(cells, strokes, size, maxDistance = SNAP_DISTANCE) {
  let addedCount = 0;
  strokes.forEach((stroke, strokeId) => {
    const endpoints = [stroke[0], stroke.at(-1)].map((point) => pointToCell(point, size));
    for (const endpoint of endpoints) {
      let nearest = null;
      for (const cell of cells.values()) {
        if (cell.strokeIds.includes(strokeId)) continue;
        const distance = Math.abs(endpoint.x - cell.x) + Math.abs(endpoint.y - cell.y);
        if (distance > maxDistance) continue;
        if (!nearest || distance < nearest.distance) nearest = { cell, distance };
      }
      if (!nearest || nearest.distance === 0) continue;
      for (const point of makeLPath(endpoint, nearest.cell)) {
        const key = cellKey(point.x, point.y);
        const existing = cells.get(key);
        if (existing) {
          if (!existing.strokeIds.includes(strokeId)) existing.strokeIds.push(strokeId);
          continue;
        }
        cells.set(key, { x: point.x, y: point.y, type: "stroke", strokeIds: [strokeId] });
        addedCount += 1;
      }
    }
  });
  return addedCount;
}

export function connectWithBridges(cells) {
  const bridges = [];
  let components = connectedComponents(cells);
  while (components.length > 1) {
    const nearest = nearestComponentPair(components);
    const path = makeLPath(nearest.from, nearest.to);
    const added = [];
    for (const point of path) {
      const key = cellKey(point.x, point.y);
      if (cells.has(key)) continue;
      const bridgeCell = { x: point.x, y: point.y, type: "bridge", strokeIds: [] };
      cells.set(key, bridgeCell);
      added.push(bridgeCell);
    }
    bridges.push({ from: nearest.from, to: nearest.to, cells: added });
    components = connectedComponents(cells);
  }
  return bridges;
}

export function generateMaze(kanji, options = {}) {
  if (!kanji?.strokes?.length || !kanji.strokes[0].length) {
    throw new Error("漢字には1画以上の画データが必要です");
  }
  const size = options.size ?? gridSizeForStrokeCount(kanji.strokes.length);
  const cells = rasterizeStrokes(kanji.strokes, size);
  const snapCellCount = snapNearbyEndpoints(cells, kanji.strokes, size, options.snapDistance);
  const rawCellCount = cells.size;
  const bridges = connectWithBridges(cells);
  const start = pointToCell(kanji.strokes[0][0], size);
  const passageCells = [...cells.values()];
  return {
    char: kanji.char,
    size,
    cells,
    passageCells,
    totalCells: passageCells.length,
    rawCellCount,
    snapCellCount,
    bridges,
    bridgeCount: bridges.length,
    start,
  };
}

export function isMazeConnected(maze) {
  return connectedComponents(maze.cells).length === 1;
}

export function explorationRate(maze, visited) {
  if (!maze.totalCells) return 0;
  let count = 0;
  for (const key of visited) if (maze.cells.has(key)) count += 1;
  return count / maze.totalCells;
}
