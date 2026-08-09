import * as THREE from "../vendor/three.module.js";
import { pointSegmentDistanceSquared } from "./maze.js";

const WALL_HEIGHT = 2.6;
const EYE_HEIGHT = 1.5;
const WALL_MARGIN = 4;
const INK_WIDTH = 1.45;

export class MazeRenderer {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071127);
    this.scene.fog = new THREE.Fog(0x071127, 25, 105);
    this.camera = new THREE.PerspectiveCamera(67, 1, 0.08, 320);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.mazeGroup = new THREE.Group();
    this.scene.add(this.mazeGroup);
    // three.js r155+ の光量単位に合わせた実機調整値。下げないこと。
    this.scene.add(new THREE.HemisphereLight(0x7893c7, 0x382d20, 4.8));
    const moonLight = new THREE.DirectionalLight(0xcbdcff, 3.6);
    moonLight.position.set(-30, 45, 20);
    this.scene.add(moonLight);
    this.makeStars();
    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.revealAnimation = null;
  }

  makeStars() {
    const positions = [];
    const random = seededRandom(417);
    for (let index = 0; index < 115; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 82 + random() * 30;
      positions.push(Math.cos(angle) * radius, 18 + random() * 58, Math.sin(angle) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xcbd9ff, size: 0.34, sizeAttenuation: true }));
    this.scene.add(this.stars);
  }

  setNorthStar(visible) {
    if (!this.northStar) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 42, -60], 3));
      this.northStar = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xfff3ba, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.95 }));
      const glowGeometry = new THREE.BufferGeometry();
      glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 42, -60], 3));
      this.northGlow = new THREE.Points(glowGeometry, new THREE.PointsMaterial({ color: 0xf5d778, size: 5.2, sizeAttenuation: true, transparent: true, opacity: 0.2, depthWrite: false }));
      this.scene.add(this.northStar, this.northGlow);
    }
    this.northStar.visible = visible;
    this.northGlow.visible = visible;
  }

  clearMaze() {
    this.mazeGroup.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.mazeGroup.clear();
    this.wallMesh = null;
    this.revealAnimation = null;
  }

  buildMaze(maze) {
    this.clearMaze();
    this.maze = maze;
    // 種明かし中に広げた霧を通常値へ戻す。
    this.scene.fog.near = 25;
    this.scene.fog.far = 105;
    const extent = maze.worldSize / 2 + WALL_MARGIN;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(extent * 2, extent * 2),
      new THREE.MeshLambertMaterial({ color: 0x887d65 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.mazeGroup.add(floor);

    const wallGeometry = createWallGeometry(maze);
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x46607a, transparent: true, opacity: 1 });
    this.wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
    this.mazeGroup.add(this.wallMesh);

    if (maze.bridgeSegments.length) {
      const bridgeFloor = new THREE.Mesh(
        ribbonGeometry(maze.bridgeSegments, maze.bridgeRadius * 0.94, 0.035, true),
        new THREE.MeshLambertMaterial({ color: 0xb56b3d }),
      );
      this.mazeGroup.add(bridgeFloor);
      this.addBridgeRails();
    }
  }

  addBridgeRails() {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0x633b28 });
    const rails = new THREE.InstancedMesh(geometry, material, this.maze.bridgeSegments.length * 2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let instance = 0;
    for (const bridge of this.maze.bridgeSegments) {
      const dx = bridge.to.x - bridge.from.x;
      const dz = bridge.to.z - bridge.from.z;
      const length = Math.hypot(dx, dz);
      const nx = -dz / length;
      const nz = dx / length;
      const angle = -Math.atan2(dz, dx);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      scale.set(length, 0.42, 0.13);
      for (const side of [-1, 1]) {
        position.set(
          (bridge.from.x + bridge.to.x) / 2 + nx * side * this.maze.bridgeRadius * 0.78,
          0.24,
          (bridge.from.z + bridge.to.z) / 2 + nz * side * this.maze.bridgeRadius * 0.78,
        );
        matrix.compose(position, quaternion, scale);
        rails.setMatrixAt(instance, matrix);
        instance += 1;
      }
    }
    rails.instanceMatrix.needsUpdate = true;
    this.mazeGroup.add(rails);
  }

  setFirstPerson(x, z, yaw, pitch) {
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(x, EYE_HEIGHT, z);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  addInk(visited) {
    const visitedLinks = [];
    const unseenLinks = [];
    for (const link of this.maze.sampleLinks) {
      (visited.has(link.from.id) && visited.has(link.to.id) ? visitedLinks : unseenLinks).push(link);
    }
    const unseen = new THREE.Mesh(
      ribbonGeometry(unseenLinks, INK_WIDTH / 2, 0.055, true),
      new THREE.MeshBasicMaterial({ color: 0x7d7667, transparent: true, opacity: 0.48 }),
    );
    const ink = new THREE.Mesh(
      ribbonGeometry(visitedLinks, INK_WIDTH / 2, 0.075, true),
      new THREE.MeshBasicMaterial({ color: 0x171b1a }),
    );
    this.mazeGroup.add(unseen, ink);
  }

  startReveal(visited, onComplete) {
    this.addInk(visited);
    const startPosition = this.camera.position.clone();
    const startQuaternion = this.camera.quaternion.clone();
    const endPosition = new THREE.Vector3(0, this.maze.worldSize * 1.18, 3);
    // 上空からの見下ろしが夜霧に沈まないよう、種明かし中は霧を遠くへ広げる。
    this.scene.fog.near = endPosition.y * 1.6;
    this.scene.fog.far = endPosition.y * 3.2;
    const helper = this.camera.clone();
    helper.position.copy(endPosition);
    helper.up.set(0, 0, -1);
    helper.lookAt(0, 0, 0);
    const endQuaternion = helper.quaternion.clone();
    this.revealAnimation = { start: performance.now(), duration: 2700, startPosition, endPosition, startQuaternion, endQuaternion, onComplete, done: false };
  }

  updateReveal(now) {
    const animation = this.revealAnimation;
    if (!animation || animation.done) return;
    const raw = Math.min(1, (now - animation.start) / animation.duration);
    const eased = raw < 0.5 ? 4 * raw ** 3 : 1 - ((-2 * raw + 2) ** 3) / 2;
    this.camera.position.lerpVectors(animation.startPosition, animation.endPosition, eased);
    this.camera.quaternion.slerpQuaternions(animation.startQuaternion, animation.endQuaternion, eased);
    if (this.wallMesh) this.wallMesh.material.opacity = 1 - eased * 0.72;
    if (raw === 1) {
      animation.done = true;
      animation.onComplete();
    }
  }

  render(now) {
    this.updateReveal(now);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const parent = this.renderer.domElement.parentElement;
    const width = parent.clientWidth || innerWidth;
    const height = parent.clientHeight || innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

// WebGL や DOM を使わずに生成できるため、輪郭処理の診断にも利用できる。
export function createWallGeometry(maze) {
  const wallContours = computeWallContours(maze);
  const wallShapes = wallContours.shapes.map((shapeData) => shapeDataToThreeShape(shapeData));
  const geometry = new THREE.ExtrudeGeometry(wallShapes, { depth: WALL_HEIGHT, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.userData.contourCount = wallContours.contours.length;
  geometry.userData.holeCount = wallContours.holes.length;
  geometry.userData.islandCount = wallContours.islands.length;
  geometry.userData.resolution = wallContours.resolution;
  return geometry;
}

export function computeWallContours(maze) {
  const extent = maze.worldSize / 2 + WALL_MARGIN;
  const resolution = contourResolution(maze.worldSize);
  const rawContours = passageContours(maze, resolution, extent);
  const contourNodes = buildContourTree(rawContours);
  const outer = contourRecordFromWorldContour([
    { x: -extent, z: extent },
    { x: extent, z: extent },
    { x: extent, z: -extent },
    { x: -extent, z: -extent },
  ], "outer", true);
  const holes = contourNodes.filter((node) => node.depth % 2 === 0);
  const islands = contourNodes.filter((node) => node.depth % 2 === 1);
  const shapes = [
    { outer, holes: contourNodes.filter((node) => node.depth === 0) },
    ...contourNodes
      .filter((node) => node.depth % 2 === 1)
      .map((node) => ({ outer: node, holes: node.children.filter((child) => child.depth % 2 === 0) })),
  ];
  return {
    extent,
    resolution,
    outer,
    holes,
    islands,
    contours: contourNodes,
    shapes,
  };
}

function contourResolution(worldSize) {
  if (worldSize <= 64) return 220;
  if (worldSize <= 80) return 240;
  if (worldSize <= 96) return 264;
  return 288;
}

function passageContours(maze, resolution, extent) {
  const index = new PassageIndex(maze);
  const values = Array.from({ length: resolution }, () => new Uint8Array(resolution));
  const step = extent * 2 / (resolution - 1);
  for (let row = 0; row < resolution; row += 1) {
    const z = -extent + row * step;
    for (let column = 0; column < resolution; column += 1) {
      const x = -extent + column * step;
      values[row][column] = index.contains(x, z) ? 1 : 0;
    }
  }

  const edges = [];
  for (let row = 0; row < resolution - 1; row += 1) {
    for (let column = 0; column < resolution - 1; column += 1) {
      const code = values[row][column]
        | values[row][column + 1] << 1
        | values[row + 1][column + 1] << 2
        | values[row + 1][column] << 3;
      if (code === 0 || code === 15) continue;
      const centerInside = index.contains(-extent + (column + 0.5) * step, -extent + (row + 0.5) * step);
      edges.push(...marchingEdges(code, column, row, centerInside));
    }
  }
  return stitchContours(edges)
    .filter((contour) => contour.length >= 3)
    .map((contour) => contour.map((point) => ({
      x: -extent + point.x / 2 * step,
      z: -extent + point.z / 2 * step,
    })))
    .map(simplifyContour)
    .map((contour) => chaikin(chaikin(contour)));
}

class PassageIndex {
  constructor(maze) {
    this.bucketSize = 4;
    this.buckets = new Map();
    for (const segment of maze.strokeSegments) this.add(segment, maze.strokeRadius);
    for (const segment of maze.bridgeSegments) this.add(segment, maze.bridgeRadius);
  }

  key(x, z) {
    return `${x},${z}`;
  }

  add(segment, radius) {
    const entry = { segment, radius };
    const left = Math.floor((Math.min(segment.from.x, segment.to.x) - radius) / this.bucketSize);
    const right = Math.floor((Math.max(segment.from.x, segment.to.x) + radius) / this.bucketSize);
    const top = Math.floor((Math.min(segment.from.z, segment.to.z) - radius) / this.bucketSize);
    const bottom = Math.floor((Math.max(segment.from.z, segment.to.z) + radius) / this.bucketSize);
    for (let x = left; x <= right; x += 1) {
      for (let z = top; z <= bottom; z += 1) {
        const key = this.key(x, z);
        if (!this.buckets.has(key)) this.buckets.set(key, []);
        this.buckets.get(key).push(entry);
      }
    }
  }

  contains(x, z) {
    const entries = this.buckets.get(this.key(Math.floor(x / this.bucketSize), Math.floor(z / this.bucketSize))) ?? [];
    for (const entry of entries) {
      if (pointSegmentDistanceSquared({ x, z }, entry.segment.from, entry.segment.to) <= entry.radius ** 2) return true;
    }
    return false;
  }
}

function marchingEdges(code, column, row, centerInside) {
  const top = { x: column * 2 + 1, z: row * 2 };
  const right = { x: column * 2 + 2, z: row * 2 + 1 };
  const bottom = { x: column * 2 + 1, z: row * 2 + 2 };
  const left = { x: column * 2, z: row * 2 + 1 };
  const pair = (from, to) => ({ from, to });
  const simple = {
    1: [pair(left, top)], 2: [pair(top, right)], 3: [pair(left, right)],
    4: [pair(right, bottom)], 6: [pair(top, bottom)], 7: [pair(left, bottom)],
    8: [pair(bottom, left)], 9: [pair(bottom, top)], 11: [pair(bottom, right)],
    12: [pair(right, left)], 13: [pair(right, top)], 14: [pair(top, left)],
  };
  if (simple[code]) return simple[code];
  if (code === 5) return centerInside
    ? [pair(right, top), pair(left, bottom)]
    : [pair(left, top), pair(right, bottom)];
  if (code === 10) return centerInside
    ? [pair(top, left), pair(bottom, right)]
    : [pair(top, right), pair(bottom, left)];
  return [];
}

function stitchContours(edges) {
  const key = (point) => `${point.x},${point.z}`;
  const outgoing = new Map();
  for (const edge of edges) {
    const start = key(edge.from);
    if (!outgoing.has(start)) outgoing.set(start, []);
    outgoing.get(start).push(edge);
  }
  const unused = new Set(edges);
  const contours = [];
  while (unused.size) {
    const first = unused.values().next().value;
    const contour = [first.from];
    let edge = first;
    unused.delete(edge);
    while (key(edge.to) !== key(contour[0])) {
      contour.push(edge.to);
      const next = (outgoing.get(key(edge.to)) ?? []).find((candidate) => unused.has(candidate));
      if (!next) break;
      edge = next;
      unused.delete(edge);
    }
    if (key(edge.to) === key(contour[0])) contours.push(contour);
  }
  return contours;
}

function simplifyContour(contour) {
  const collinear = contour.filter((point, index) => {
    const previous = contour[(index - 1 + contour.length) % contour.length];
    const next = contour[(index + 1) % contour.length];
    return Math.abs((point.x - previous.x) * (next.z - point.z) - (point.z - previous.z) * (next.x - point.x)) > 1e-8;
  });
  if (collinear.length < 4) return collinear;
  const kept = [];
  for (const point of collinear) {
    const previous = kept.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) >= 0.32) kept.push(point);
  }
  return kept.length >= 3 ? kept : collinear;
}

function chaikin(contour) {
  const smoothed = [];
  for (let index = 0; index < contour.length; index += 1) {
    const from = contour[index];
    const to = contour[(index + 1) % contour.length];
    smoothed.push(
      { x: from.x * 0.75 + to.x * 0.25, z: from.z * 0.75 + to.z * 0.25 },
      { x: from.x * 0.25 + to.x * 0.75, z: from.z * 0.25 + to.z * 0.75 },
    );
  }
  return smoothed;
}

function signedArea(contour) {
  let area = 0;
  for (let index = 0; index < contour.length; index += 1) {
    const point = contour[index];
    const next = contour[(index + 1) % contour.length];
    area += point.x * next.z - next.x * point.z;
  }
  return area / 2;
}

function buildContourTree(rawContours) {
  const nodes = rawContours.map((contour, index) => {
    const rawArea = signedArea(contour);
    return {
      index,
      rawPoints: contour,
      rawArea,
      bounds: contourBounds(contour),
      interiorPoint: contourInteriorPoint(contour, rawArea),
      parentIndex: -1,
      children: [],
      depth: 0,
      role: "hole",
      points: [],
      area: 0,
    };
  });

  const ordered = [...nodes].sort((first, second) => Math.abs(first.rawArea) - Math.abs(second.rawArea));
  for (const node of ordered) {
    let parent = null;
    for (const candidate of nodes) {
      if (Math.abs(candidate.rawArea) <= Math.abs(node.rawArea)) continue;
      if (!boundsContains(candidate.bounds, node.interiorPoint)) continue;
      if (!pointInContour(node.interiorPoint, candidate.rawPoints)) continue;
      if (!parent || Math.abs(candidate.rawArea) < Math.abs(parent.rawArea)) parent = candidate;
    }
    if (parent) {
      node.parentIndex = parent.index;
      parent.children.push(node);
    }
  }

  for (const node of nodes) node.children.sort((first, second) => Math.abs(first.rawArea) - Math.abs(second.rawArea));
  for (const node of nodes) {
    if (node.parentIndex !== -1) continue;
    assignContourDepth(node, 0);
  }

  return nodes;
}

function assignContourDepth(node, depth) {
  node.depth = depth;
  node.role = depth % 2 === 0 ? "hole" : "island";
  node.points = orientContourPoints(node.rawPoints, node.role === "island");
  node.area = signedAreaPoints(node.points);
  for (const child of node.children) assignContourDepth(child, depth + 1);
}

function contourInteriorPoint(contour, rawArea) {
  if (contour.length < 2) return contour[0] ?? { x: 0, z: 0 };
  const first = contour[0];
  const second = contour[1];
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const length = Math.hypot(dx, dz) || 1;
  const mid = { x: (first.x + second.x) / 2, z: (first.z + second.z) / 2 };
  const offset = Math.min(0.05, length * 0.12);
  const inward = rawArea >= 0
    ? { x: -dz / length, z: dx / length }
    : { x: dz / length, z: -dx / length };
  return {
    x: mid.x + inward.x * offset,
    z: mid.z + inward.z * offset,
  };
}

function boundsContains(bounds, point) {
  return point.x >= bounds.minX - 1e-8
    && point.x <= bounds.maxX + 1e-8
    && point.z >= bounds.minZ - 1e-8
    && point.z <= bounds.maxZ + 1e-8;
}

function contourBounds(contour) {
  const bounds = {
    minX: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxZ: -Infinity,
  };
  for (const point of contour) {
    if (point.x < bounds.minX) bounds.minX = point.x;
    if (point.z < bounds.minZ) bounds.minZ = point.z;
    if (point.x > bounds.maxX) bounds.maxX = point.x;
    if (point.z > bounds.maxZ) bounds.maxZ = point.z;
  }
  return bounds;
}

function pointInContour(point, contour) {
  let inside = false;
  for (let index = 0, previous = contour.length - 1; index < contour.length; previous = index, index += 1) {
    const first = contour[index];
    const second = contour[previous];
    const intersects = ((first.z > point.z) !== (second.z > point.z))
      && point.x < ((second.x - first.x) * (point.z - first.z)) / ((second.z - first.z) || 1e-12) + first.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientContourPoints(contour, clockwise) {
  const points = contour.map((point) => ({ x: point.x, y: -point.z }));
  if ((signedAreaPoints(points) < 0) !== clockwise) points.reverse();
  return points;
}

function signedAreaPoints(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function contourRecordFromWorldContour(contour, role, clockwise) {
  const points = orientContourPoints(contour, clockwise);
  return {
    role,
    rawPoints: contour,
    points,
    area: signedAreaPoints(points),
  };
}

function shapeDataToThreeShape(shapeData) {
  const shape = contourRecordToThreeShape(shapeData.outer);
  for (const hole of shapeData.holes) shape.holes.push(contourRecordToThreePath(hole));
  return shape;
}

function contourRecordToThreeShape(record) {
  const shape = new THREE.Shape();
  const points = record.points;
  shape.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index].x, points[index].y);
  shape.closePath();
  return shape;
}

function contourRecordToThreePath(record) {
  const path = new THREE.Path();
  const points = record.points;
  path.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) path.lineTo(points[index].x, points[index].y);
  path.closePath();
  return path;
}

function ribbonGeometry(segments, halfWidth, height, roundCaps) {
  const positions = [];
  const addTriangle = (a, b, c) => positions.push(a.x, height, a.z, b.x, height, b.z, c.x, height, c.z);
  const capCenters = new Map();
  for (const segment of segments) {
    const dx = segment.to.x - segment.from.x;
    const dz = segment.to.z - segment.from.z;
    const length = Math.hypot(dx, dz);
    if (!length) continue;
    const nx = -dz / length * halfWidth;
    const nz = dx / length * halfWidth;
    const a = { x: segment.from.x + nx, z: segment.from.z + nz };
    const b = { x: segment.to.x + nx, z: segment.to.z + nz };
    const c = { x: segment.to.x - nx, z: segment.to.z - nz };
    const d = { x: segment.from.x - nx, z: segment.from.z - nz };
    addTriangle(a, b, d);
    addTriangle(b, c, d);
    if (roundCaps) {
      capCenters.set(`${segment.from.x.toFixed(3)},${segment.from.z.toFixed(3)}`, segment.from);
      capCenters.set(`${segment.to.x.toFixed(3)},${segment.to.z.toFixed(3)}`, segment.to);
    }
  }
  for (const center of capCenters.values()) {
    for (let part = 0; part < 10; part += 1) {
      const first = part / 10 * Math.PI * 2;
      const second = (part + 1) / 10 * Math.PI * 2;
      addTriangle(
        center,
        { x: center.x + Math.cos(second) * halfWidth, z: center.z + Math.sin(second) * halfWidth },
        { x: center.x + Math.cos(first) * halfWidth, z: center.z + Math.sin(first) * halfWidth },
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
