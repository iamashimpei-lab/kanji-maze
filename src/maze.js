export const STROKE_RADIUS = 1.7;
export const BRIDGE_RADIUS = 0.95;
export const PLAYER_RADIUS = 0.45;
export const SAMPLE_SPACING = 1.2;
export const SNAP_DISTANCE = 2.4;
export const HANE_TERRAIN_LENGTH = 1.5;
export const HANE_RISE = 0.75;
export const HARAI_TERRAIN_LENGTH = 3;
export const HARAI_DROP = 0.5;
export const HARAI_END_RADIUS = 0.9;

const PLAYER_SAMPLE_COUNT = 8;
const INNER_CORNER_TOLERANCE = 0.05;
const MAX_MOVE_STEP = 0.15;
const RECOVERY_STEP = 0.3;

export function rotateStrokes(strokes, angleDegrees) {
  const radians = angleDegrees * Math.PI / 180;
  const sin = Math.sin(radians);
  const cos = Math.cos(radians);
  return strokes.map((stroke) => {
    const sourcePoints = Array.isArray(stroke) ? stroke : stroke.points;
    const rotatedPoints = sourcePoints.map(([x, y]) => {
      const dx = x - 0.5;
      const dy = y - 0.5;
      return [
        0.5 + dx * cos - dy * sin,
        0.5 + dx * sin + dy * cos,
      ];
    });
    return Array.isArray(stroke) ? rotatedPoints : { ...stroke, points: rotatedPoints };
  });
}

export function worldSizeForStrokeCount(strokeCount) {
  if (strokeCount <= 4) return 64;
  if (strokeCount <= 8) return 80;
  if (strokeCount <= 12) return 96;
  return 112;
}

export function normalizedToWorld(point, worldSize) {
  return { x: (point[0] - 0.5) * worldSize, z: (point[1] - 0.5) * worldSize };
}

export function pointSegmentDistanceSquared(point, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) return distanceSquared(point, from);
  const amount = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
  return distanceSquared(point, { x: from.x + dx * amount, z: from.z + dz * amount });
}

function projectionAmountOnSegment(point, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  return lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared));
}

function closestPointOnSegment(point, from, to) {
  const amount = projectionAmountOnSegment(point, from, to);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return { x: from.x + dx * amount, z: from.z + dz * amount };
}

function intersectionPoint(first, second) {
  const r = { x: first.to.x - first.from.x, z: first.to.z - first.from.z };
  const s = { x: second.to.x - second.from.x, z: second.to.z - second.from.z };
  const cross = r.x * s.z - r.z * s.x;
  if (Math.abs(cross) < 1e-9) return null;
  const offset = { x: second.from.x - first.from.x, z: second.from.z - first.from.z };
  const t = (offset.x * s.z - offset.z * s.x) / cross;
  const u = (offset.x * r.z - offset.z * r.x) / cross;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: first.from.x + r.x * t, z: first.from.z + r.z * t };
}

function closestSegmentPair(first, second) {
  const intersection = intersectionPoint(first, second);
  if (intersection) return { from: intersection, to: intersection, distance: 0 };
  const candidates = [
    { from: first.from, to: closestPointOnSegment(first.from, second.from, second.to) },
    { from: first.to, to: closestPointOnSegment(first.to, second.from, second.to) },
    { from: closestPointOnSegment(second.from, first.from, first.to), to: second.from },
    { from: closestPointOnSegment(second.to, first.from, first.to), to: second.to },
  ];
  for (const candidate of candidates) candidate.distance = Math.sqrt(distanceSquared(candidate.from, candidate.to));
  return candidates.reduce((best, candidate) => candidate.distance < best.distance ? candidate : best);
}

class UnionFind {
  constructor(size) {
    this.parents = Array.from({ length: size }, (_, index) => index);
    this.ranks = new Uint8Array(size);
  }

  find(value) {
    let root = value;
    while (this.parents[root] !== root) root = this.parents[root];
    while (this.parents[value] !== value) {
      const parent = this.parents[value];
      this.parents[value] = root;
      value = parent;
    }
    return root;
  }

  union(first, second) {
    let a = this.find(first);
    let b = this.find(second);
    if (a === b) return false;
    if (this.ranks[a] < this.ranks[b]) [a, b] = [b, a];
    this.parents[b] = a;
    if (this.ranks[a] === this.ranks[b]) this.ranks[a] += 1;
    return true;
  }
}

function buildStrokeGeometry(strokes, worldSize) {
  const polylines = strokes.map((stroke, strokeId) => {
    const sourcePoints = Array.isArray(stroke) ? stroke : stroke.points;
    return {
      strokeId,
      ending: Array.isArray(stroke) ? "tome" : stroke.ending ?? "tome",
      kvgType: Array.isArray(stroke) ? null : stroke.type ?? null,
      points: sourcePoints.map((point) => normalizedToWorld(point, worldSize)),
    };
  });
  const segments = [];
  for (const polyline of polylines) {
    const lengths = [];
    let remaining = 0;
    for (let index = polyline.points.length - 1; index >= 1; index -= 1) {
      const length = Math.sqrt(distanceSquared(polyline.points[index - 1], polyline.points[index]));
      lengths[index - 1] = length;
      remaining += length;
    }
    let distanceFromEnd = remaining;
    for (let index = 1; index < polyline.points.length; index += 1) {
      const from = polyline.points[index - 1];
      const to = polyline.points[index];
      if (distanceSquared(from, to) < 1e-10) continue;
      const length = lengths[index - 1];
      segments.push({
        from,
        to,
        length,
        endDistanceFrom: distanceFromEnd,
        endDistanceTo: distanceFromEnd - length,
        ending: polyline.ending,
        strokeId: polyline.strokeId,
        type: "stroke",
        source: "kanji",
      });
      distanceFromEnd -= length;
    }
  }
  return { polylines, segments };
}

function nearestStrokePair(firstSegments, secondSegments, stopAt = -1) {
  let best = null;
  for (const first of firstSegments) {
    for (const second of secondSegments) {
      const pair = closestSegmentPair(first, second);
      if (!best || pair.distance < best.distance) best = { ...pair, first, second };
      if (best.distance <= stopAt) return best;
    }
  }
  return best;
}

function connectStrokes(originalSegments, strokeCount) {
  const union = new UnionFind(strokeCount);
  const byStroke = Array.from({ length: strokeCount }, () => []);
  for (const segment of originalSegments) byStroke[segment.strokeId].push(segment);
  const snapSegments = [];
  for (let first = 0; first < strokeCount; first += 1) {
    for (let second = first + 1; second < strokeCount; second += 1) {
      const pair = nearestStrokePair(byStroke[first], byStroke[second], SNAP_DISTANCE);
      if (!pair || pair.distance > STROKE_RADIUS * 2) continue;
      union.union(first, second);
      if (pair.distance > 1e-6 && pair.distance <= SNAP_DISTANCE) {
        snapSegments.push({
          from: pair.from,
          to: pair.to,
          strokeId: first,
          joinedStrokeId: second,
          type: "stroke",
          source: "snap",
        });
      }
    }
  }

  const bridges = [];
  while (new Set(Array.from({ length: strokeCount }, (_, index) => union.find(index))).size > 1) {
    let nearest = null;
    for (let first = 0; first < strokeCount; first += 1) {
      for (let second = first + 1; second < strokeCount; second += 1) {
        if (union.find(first) === union.find(second)) continue;
        const pair = nearestStrokePair(byStroke[first], byStroke[second]);
        if (!nearest || pair.distance < nearest.distance) nearest = { ...pair, firstStrokeId: first, secondStrokeId: second };
      }
    }
    if (!nearest) throw new Error("画の連結点を求められませんでした");
    const bridge = {
      from: nearest.from,
      to: nearest.to,
      firstStrokeId: nearest.firstStrokeId,
      secondStrokeId: nearest.secondStrokeId,
      type: "bridge",
    };
    bridges.push(bridge);
    union.union(nearest.firstStrokeId, nearest.secondStrokeId);
  }
  return { snapSegments, bridges };
}

function samplePolyline(polyline, spacing, firstId) {
  const lengths = [];
  let totalLength = 0;
  for (let index = 1; index < polyline.points.length; index += 1) {
    const length = Math.sqrt(distanceSquared(polyline.points[index - 1], polyline.points[index]));
    lengths.push(length);
    totalLength += length;
  }
  const targets = [];
  for (let target = 0; target < totalLength; target += spacing) targets.push(target);
  if (!targets.length || totalLength - targets.at(-1) > 1e-6) targets.push(totalLength);
  const samples = [];
  let segmentIndex = 0;
  let elapsed = 0;
  for (const target of targets) {
    while (segmentIndex < lengths.length - 1 && target > elapsed + lengths[segmentIndex]) {
      elapsed += lengths[segmentIndex];
      segmentIndex += 1;
    }
    const from = polyline.points[segmentIndex];
    const to = polyline.points[segmentIndex + 1] ?? from;
    const amount = lengths[segmentIndex] ? (target - elapsed) / lengths[segmentIndex] : 0;
    samples.push({
      id: firstId + samples.length,
      strokeId: polyline.strokeId,
      x: from.x + (to.x - from.x) * amount,
      z: from.z + (to.z - from.z) * amount,
    });
  }
  return samples;
}

function buildSamples(polylines) {
  const samples = [];
  const sampleLinks = [];
  const samplesByStroke = [];
  for (const polyline of polylines) {
    const strokeSamples = samplePolyline(polyline, SAMPLE_SPACING, samples.length);
    for (let index = 1; index < strokeSamples.length; index += 1) {
      sampleLinks.push({ from: strokeSamples[index - 1], to: strokeSamples[index], strokeId: polyline.strokeId });
    }
    samples.push(...strokeSamples);
    samplesByStroke.push(strokeSamples);
  }
  return { samples, sampleLinks, samplesByStroke };
}

export function generateMaze(kanji) {
  if (!kanji?.strokes?.length || kanji.strokes.some((stroke) => (Array.isArray(stroke) ? stroke : stroke.points)?.length < 2)) {
    throw new Error("漢字には2点以上からなる画データが必要です");
  }
  const worldSize = worldSizeForStrokeCount(kanji.strokes.length);
  const geometry = buildStrokeGeometry(kanji.strokes, worldSize);
  const connections = connectStrokes(geometry.segments, kanji.strokes.length);
  const sampleData = buildSamples(geometry.polylines);
  return {
    char: kanji.char,
    theme: kanji.theme ?? "neutral",
    worldSize,
    strokeRadius: STROKE_RADIUS,
    bridgeRadius: BRIDGE_RADIUS,
    strokePolylines: geometry.polylines,
    strokeSegments: [...geometry.segments, ...connections.snapSegments],
    bridgeSegments: connections.bridges,
    bridges: connections.bridges,
    bridgeCount: connections.bridges.length,
    snapSegments: connections.snapSegments,
    samples: sampleData.samples,
    samplesByStroke: sampleData.samplesByStroke,
    sampleLinks: sampleData.sampleLinks,
    totalSamples: sampleData.samples.length,
    start: sampleData.samples[0],
  };
}

function segmentEndDistanceAt(segment, amount) {
  if (segment.source !== "kanji") return Infinity;
  return segment.endDistanceFrom + (segment.endDistanceTo - segment.endDistanceFrom) * amount;
}

export function segmentPassageRadiusAt(segment, amount) {
  if (segment.type === "bridge") return BRIDGE_RADIUS;
  if (segment.source !== "kanji" || segment.ending !== "harai") return STROKE_RADIUS;
  const endDistance = segmentEndDistanceAt(segment, amount);
  const progress = Math.max(0, Math.min(1, 1 - endDistance / HARAI_TERRAIN_LENGTH));
  return STROKE_RADIUS + (HARAI_END_RADIUS - STROKE_RADIUS) * progress;
}

function closestPassageProfile(maze, x, z) {
  const point = { x, z };
  let best = null;
  const consider = (segment) => {
    const amount = projectionAmountOnSegment(point, segment.from, segment.to);
    const closest = {
      x: segment.from.x + (segment.to.x - segment.from.x) * amount,
      z: segment.from.z + (segment.to.z - segment.from.z) * amount,
    };
    if (maze.collisionMetrics) maze.collisionMetrics.distanceChecks += 1;
    const distanceSquaredToSegment = distanceSquared(point, closest);
    const endDistance = segmentEndDistanceAt(segment, amount);
    if (!best
      || distanceSquaredToSegment < best.distanceSquared - 1e-9
      || (Math.abs(distanceSquaredToSegment - best.distanceSquared) <= 1e-9 && endDistance < best.endDistance)) {
      best = { segment, amount, endDistance, distanceSquared: distanceSquaredToSegment, closest };
    }
  };
  for (const segment of maze.strokeSegments) consider(segment);
  for (const segment of maze.bridgeSegments) consider(segment);
  return best;
}

export function passageRadiusAt(maze, x, z) {
  const profile = closestPassageProfile(maze, x, z);
  return profile ? segmentPassageRadiusAt(profile.segment, profile.amount) : 0;
}

export function floorHeightAt(maze, x, z) {
  const profile = closestPassageProfile(maze, x, z);
  if (!profile || profile.segment.source !== "kanji") return 0;
  const radius = segmentPassageRadiusAt(profile.segment, profile.amount);
  if (profile.distanceSquared > radius ** 2) return 0;
  if (profile.segment.ending === "hane" && profile.endDistance < HANE_TERRAIN_LENGTH) {
    return HANE_RISE * (1 - profile.endDistance / HANE_TERRAIN_LENGTH);
  }
  if (profile.segment.ending === "harai" && profile.endDistance < HARAI_TERRAIN_LENGTH) {
    return -HARAI_DROP * (1 - profile.endDistance / HARAI_TERRAIN_LENGTH);
  }
  return 0;
}

export function strokePointAtDistanceFromEnd(maze, strokeId, targetDistance) {
  const polyline = maze.strokePolylines[strokeId];
  if (!polyline) return null;
  let remaining = Math.max(0, targetDistance);
  for (let index = polyline.points.length - 1; index >= 1; index -= 1) {
    const from = polyline.points[index - 1];
    const to = polyline.points[index];
    const length = Math.sqrt(distanceSquared(from, to));
    if (remaining <= length || index === 1) {
      const amountFromEnd = length ? Math.min(1, remaining / length) : 0;
      return {
        x: to.x + (from.x - to.x) * amountFromEnd,
        z: to.z + (from.z - to.z) * amountFromEnd,
      };
    }
    remaining -= length;
  }
  return { ...polyline.points[0] };
}

export function isInsidePassage(maze, x, z, clearance = 0) {
  return Boolean(passageSegmentAt(maze, x, z, clearance));
}

function passageSegmentAt(maze, x, z, clearance = 0) {
  const point = { x, z };
  for (const segment of maze.strokeSegments) {
    const broadRadius = Math.max(0, maze.strokeRadius - clearance);
    if (x < Math.min(segment.from.x, segment.to.x) - broadRadius - 1e-9
      || x > Math.max(segment.from.x, segment.to.x) + broadRadius + 1e-9
      || z < Math.min(segment.from.z, segment.to.z) - broadRadius - 1e-9
      || z > Math.max(segment.from.z, segment.to.z) + broadRadius + 1e-9) continue;
    const amount = projectionAmountOnSegment(point, segment.from, segment.to);
    const radius = Math.max(0, segmentPassageRadiusAt(segment, amount) - clearance);
    if (maze.collisionMetrics) maze.collisionMetrics.distanceChecks += 1;
    if (pointSegmentDistanceSquared(point, segment.from, segment.to) <= radius ** 2 + 1e-9) return segment;
  }
  const bridgeRadius = Math.max(0, maze.bridgeRadius - clearance);
  const bridgeLimit = bridgeRadius ** 2;
  for (const segment of maze.bridgeSegments) {
    if (x < Math.min(segment.from.x, segment.to.x) - bridgeRadius - 1e-9
      || x > Math.max(segment.from.x, segment.to.x) + bridgeRadius + 1e-9
      || z < Math.min(segment.from.z, segment.to.z) - bridgeRadius - 1e-9
      || z > Math.max(segment.from.z, segment.to.z) + bridgeRadius + 1e-9) continue;
    if (maze.collisionMetrics) maze.collisionMetrics.distanceChecks += 1;
    if (pointSegmentDistanceSquared(point, segment.from, segment.to) <= bridgeLimit + 1e-9) return segment;
  }
  return null;
}

function segmentsFormCorner(first, second) {
  const firstX = first.to.x - first.from.x;
  const firstZ = first.to.z - first.from.z;
  const secondX = second.to.x - second.from.x;
  const secondZ = second.to.z - second.from.z;
  const lengths = Math.hypot(firstX, firstZ) * Math.hypot(secondX, secondZ);
  return lengths > 1e-9 && Math.abs(firstX * secondZ - firstZ * secondX) > lengths * 0.1;
}

function hasNearbyCornerSegment(maze, centerSegment, x, z, sampleRadius) {
  const point = { x, z };
  const candidates = [...maze.strokeSegments, ...maze.bridgeSegments];
  for (const segment of candidates) {
    if (segment === centerSegment || !segmentsFormCorner(centerSegment, segment)) continue;
    const broadRadius = (segment.type === "bridge" ? maze.bridgeRadius : maze.strokeRadius) + sampleRadius;
    if (x < Math.min(segment.from.x, segment.to.x) - broadRadius
      || x > Math.max(segment.from.x, segment.to.x) + broadRadius
      || z < Math.min(segment.from.z, segment.to.z) - broadRadius
      || z > Math.max(segment.from.z, segment.to.z) + broadRadius) continue;
    const amount = projectionAmountOnSegment(point, segment.from, segment.to);
    const radius = segmentPassageRadiusAt(segment, amount) + sampleRadius;
    if (maze.collisionMetrics) maze.collisionMetrics.distanceChecks += 1;
    if (pointSegmentDistanceSquared(point, segment.from, segment.to) <= radius ** 2 + 1e-9) return true;
  }
  return false;
}

export function canStandAt(maze, x, z) {
  // 通路が一本だけの場所は従来どおり厳密な clearance 判定を使う。
  if (isInsidePassage(maze, x, z, PLAYER_RADIUS)) return true;

  // 画の継ぎ目では、床の和集合でプレイヤー円を近似する。わずかな数値・操作上の
  // 余裕は継ぎ目だけに限定し、一本の画や橋そのものの有効幅は広げない。
  const sampleRadius = PLAYER_RADIUS - INNER_CORNER_TOLERANCE;
  const coveringSegments = new Set();
  const centerSegment = passageSegmentAt(maze, x, z);
  if (!centerSegment) return false;
  if (!hasNearbyCornerSegment(maze, centerSegment, x, z, sampleRadius)) return false;
  coveringSegments.add(centerSegment);
  for (let index = 0; index < PLAYER_SAMPLE_COUNT; index += 1) {
    const angle = index * Math.PI * 2 / PLAYER_SAMPLE_COUNT;
    const segment = passageSegmentAt(
      maze,
      x + Math.cos(angle) * sampleRadius,
      z + Math.sin(angle) * sampleRadius,
    );
    if (!segment) return false;
    coveringSegments.add(segment);
  }
  const segments = [...coveringSegments];
  for (let first = 0; first < segments.length; first += 1) {
    for (let second = first + 1; second < segments.length; second += 1) {
      if (segmentsFormCorner(segments[first], segments[second])) return true;
    }
  }
  return false;
}

function recoverInsidePassage(maze, x, z) {
  const profile = closestPassageProfile(maze, x, z);
  if (!profile) return { x, z };
  const dx = profile.closest.x - x;
  const dz = profile.closest.z - z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return { x, z };
  const scale = Math.min(1, RECOVERY_STEP / distance);
  return { x: x + dx * scale, z: z + dz * scale };
}

function attemptMoveStep(maze, x, z, dx, dz) {
  if (canStandAt(maze, x + dx, z + dz)) return { x: x + dx, z: z + dz };

  const targetX = x + dx;
  const targetZ = z + dz;
  const nearbySegment = passageSegmentAt(maze, targetX, targetZ);
  let profile = null;
  if (nearbySegment) {
    const amount = projectionAmountOnSegment({ x: targetX, z: targetZ }, nearbySegment.from, nearbySegment.to);
    profile = { segment: nearbySegment, amount };
  } else {
    profile = closestPassageProfile(maze, targetX, targetZ);
  }
  if (profile) {
    const tangentX = profile.segment.to.x - profile.segment.from.x;
    const tangentZ = profile.segment.to.z - profile.segment.from.z;
    const length = Math.hypot(tangentX, tangentZ);
    if (length > 1e-9) {
      const unitX = tangentX / length;
      const unitZ = tangentZ / length;
      const amount = dx * unitX + dz * unitZ;
      const slideX = unitX * amount;
      const slideZ = unitZ * amount;
      if (Math.hypot(slideX, slideZ) > 1e-9 && canStandAt(maze, x + slideX, z + slideZ)) {
        return { x: x + slideX, z: z + slideZ };
      }
    }
  }

  let fallbackX = x;
  let fallbackZ = z;
  if (canStandAt(maze, fallbackX + dx, fallbackZ)) fallbackX += dx;
  if (canStandAt(maze, fallbackX, fallbackZ + dz)) fallbackZ += dz;
  if (fallbackX !== x || fallbackZ !== z) return { x: fallbackX, z: fallbackZ };

  if (canStandAt(maze, x + dx * 0.5, z + dz * 0.5)) {
    return { x: x + dx * 0.5, z: z + dz * 0.5 };
  }
  return { x, z };
}

export function resolvePlayerMovement(maze, x, z, dx, dz) {
  if (!canStandAt(maze, x, z)) return recoverInsidePassage(maze, x, z);
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-9) return { x, z };
  const stepCount = Math.max(1, Math.ceil(distance / MAX_MOVE_STEP));
  const stepX = dx / stepCount;
  const stepZ = dz / stepCount;
  let next = { x, z };
  for (let step = 0; step < stepCount; step += 1) {
    next = attemptMoveStep(maze, next.x, next.z, stepX, stepZ);
  }
  return next;
}

export function markVisitedSamples(maze, visited, x, z) {
  const limitSquared = (maze.strokeRadius + 0.5) ** 2;
  let changed = false;
  for (const sample of maze.samples) {
    if (visited.has(sample.id)) continue;
    if ((sample.x - x) ** 2 + (sample.z - z) ** 2 > limitSquared) continue;
    visited.add(sample.id);
    changed = true;
  }
  return changed;
}

export function explorationRate(maze, visited) {
  if (!maze.totalSamples) return 0;
  let count = 0;
  for (const id of visited) if (Number.isInteger(id) && id >= 0 && id < maze.totalSamples) count += 1;
  return count / maze.totalSamples;
}

export function isSampleGraphConnected(maze) {
  if (!maze.strokePolylines.length) return false;
  const union = new UnionFind(maze.strokePolylines.length);
  const strokeSegments = maze.strokePolylines.map((polyline) => {
    const segments = [];
    for (let index = 1; index < polyline.points.length; index += 1) {
      const from = polyline.points[index - 1];
      const to = polyline.points[index];
      if (distanceSquared(from, to) < 1e-10) continue;
      segments.push({ from, to });
    }
    return segments;
  });
  for (let first = 0; first < strokeSegments.length; first += 1) {
    for (let second = first + 1; second < strokeSegments.length; second += 1) {
      const pair = nearestStrokePair(strokeSegments[first], strokeSegments[second], STROKE_RADIUS * 2);
      if (pair && pair.distance <= STROKE_RADIUS * 2) union.union(first, second);
    }
  }
  for (const bridge of maze.bridgeSegments) {
    union.union(bridge.firstStrokeId, bridge.secondStrokeId);
  }
  const root = union.find(0);
  return strokeSegments.every((_, strokeId) => union.find(strokeId) === root);
}

export function estimateWalkableAreaRatio(maze, resolution = 72) {
  let inside = 0;
  for (let row = 0; row < resolution; row += 1) {
    const z = ((row + 0.5) / resolution - 0.5) * maze.worldSize;
    for (let column = 0; column < resolution; column += 1) {
      const x = ((column + 0.5) / resolution - 0.5) * maze.worldSize;
      if (isInsidePassage(maze, x, z)) inside += 1;
    }
  }
  return inside / (resolution ** 2);
}

function nearestSample(samples, point) {
  return samples.reduce((best, sample) => {
    const candidate = distanceSquared(sample, point);
    return !best || candidate < best.distance ? { ...sample, distance: candidate } : best;
  }, null);
}

function distanceSquared(first, second) {
  return (first.x - second.x) ** 2 + (first.z - second.z) ** 2;
}
