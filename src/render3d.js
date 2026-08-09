import * as THREE from "../vendor/three.module.js";

export const CELL_SIZE = 2;
const WALL_HEIGHT = 2.5;
const EYE_HEIGHT = 1.5;

export class MazeRenderer {
  constructor(container) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x071127);
    this.scene.fog = new THREE.Fog(0x071127, 25, 105);
    this.camera = new THREE.PerspectiveCamera(67, 1, 0.08, 180);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.mazeGroup = new THREE.Group();
    this.scene.add(this.mazeGroup);
    // r155+ の物理光量単位では旧来の感覚より約π倍暗くなるため、強度を引き上げている
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
    for (let i = 0; i < 115; i += 1) {
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
      this.northStar = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xfff3ba, size: 2.2, sizeAttenuation: true, transparent: true, opacity: .95 }));
      const glowGeometry = new THREE.BufferGeometry();
      glowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 42, -60], 3));
      this.northGlow = new THREE.Points(glowGeometry, new THREE.PointsMaterial({ color: 0xf5d778, size: 5.2, sizeAttenuation: true, transparent: true, opacity: .2, depthWrite: false }));
      this.scene.add(this.northStar, this.northGlow);
    }
    this.northStar.visible = visible;
    this.northGlow.visible = visible;
  }

  clearMaze() {
    this.mazeGroup.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
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
    const floorGeometry = new THREE.BoxGeometry(CELL_SIZE * .96, .1, CELL_SIZE * .96);
    const strokeCells = maze.passageCells.filter((cell) => cell.type === "stroke");
    const bridgeCells = maze.passageCells.filter((cell) => cell.type === "bridge");
    this.addInstances(floorGeometry, new THREE.MeshLambertMaterial({ color: 0x887d65 }), strokeCells, .01);
    this.addInstances(floorGeometry.clone(), new THREE.MeshLambertMaterial({ color: 0xb56b3d }), bridgeCells, .025);

    const wallCells = [];
    for (let y = 0; y < maze.size; y += 1) {
      for (let x = 0; x < maze.size; x += 1) {
        if (!maze.cells.has(`${x},${y}`)) wallCells.push({ x, y });
      }
    }
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x46607a, transparent: true });
    this.wallMesh = this.addInstances(new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE), wallMaterial, wallCells, WALL_HEIGHT / 2);
    this.addBridgeRails(bridgeCells);
  }

  addInstances(geometry, material, cells, height) {
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      const world = this.cellToWorld(cell);
      matrix.makeTranslation(world.x, height, world.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.mazeGroup.add(mesh);
    return mesh;
  }

  addBridgeRails(bridgeCells) {
    const material = new THREE.MeshLambertMaterial({ color: 0x633b28 });
    for (const cell of bridgeCells) {
      const horizontal = this.maze.cells.has(`${cell.x - 1},${cell.y}`) || this.maze.cells.has(`${cell.x + 1},${cell.y}`);
      const geometry = horizontal
        ? new THREE.BoxGeometry(CELL_SIZE, .42, .14)
        : new THREE.BoxGeometry(.14, .42, CELL_SIZE);
      const world = this.cellToWorld(cell);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(geometry, material);
        if (horizontal) rail.position.set(world.x, .28, world.z + side * .73);
        else rail.position.set(world.x + side * .73, .28, world.z);
        this.mazeGroup.add(rail);
      }
    }
  }

  cellToWorld(cell) {
    const center = (this.maze.size - 1) / 2;
    return { x: (cell.x - center) * CELL_SIZE, z: (cell.y - center) * CELL_SIZE };
  }

  worldToCell(x, z) {
    const center = (this.maze.size - 1) / 2;
    return { x: Math.round(x / CELL_SIZE + center), y: Math.round(z / CELL_SIZE + center) };
  }

  setFirstPerson(x, z, yaw, pitch) {
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(x, EYE_HEIGHT, z);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
  }

  addInk(visited) {
    const visitedCells = this.maze.passageCells.filter((cell) => visited.has(`${cell.x},${cell.y}`));
    const unseenCells = this.maze.passageCells.filter((cell) => !visited.has(`${cell.x},${cell.y}`));
    const inkMaterial = new THREE.MeshBasicMaterial({ color: 0x171b1a });
    const faintMaterial = new THREE.MeshBasicMaterial({ color: 0x7d7667, transparent: true, opacity: .48 });
    this.addInstances(new THREE.BoxGeometry(1.42, .09, 1.42), inkMaterial, visitedCells, .1);
    this.addInstances(new THREE.BoxGeometry(.72, .06, .72), faintMaterial, unseenCells, .08);
  }

  startReveal(visited, onComplete) {
    this.addInk(visited);
    const startPosition = this.camera.position.clone();
    const startQuaternion = this.camera.quaternion.clone();
    const endPosition = new THREE.Vector3(0, this.maze.size * 2.35, 3);
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
    const eased = raw < .5 ? 4 * raw ** 3 : 1 - ((-2 * raw + 2) ** 3) / 2;
    this.camera.position.lerpVectors(animation.startPosition, animation.endPosition, eased);
    this.camera.quaternion.slerpQuaternions(animation.startQuaternion, animation.endQuaternion, eased);
    if (this.wallMesh) this.wallMesh.material.opacity = 1 - eased * .72;
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

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
