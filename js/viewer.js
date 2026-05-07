import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SS_COLORS = {
  H: new THREE.Color(0xff6f91),
  E: new THREE.Color(0x6ee7b7),
  C: new THREE.Color(0xa78bfa),
};

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.camera.position.set(0, 0, 80);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;

    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(50, 50, 50);
    this.scene.add(amb, dir);

    this.lineGeom = null;
    this.line = null;
    this.spheres = null;
    this.colors = null;
    this.positionsAttr = null;
    this.spheresMatrix = new THREE.Matrix4();
    this._tmpVec = new THREE.Vector3();

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loadProtein(residues) {
    if (this.line) {
      this.scene.remove(this.line);
      this.line.geometry.dispose();
      this.line.material.dispose();
    }
    if (this.spheres) {
      this.scene.remove(this.spheres);
      this.spheres.geometry.dispose();
      this.spheres.material.dispose();
    }

    const n = residues.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[3*i] = residues[i].x;
      pos[3*i+1] = residues[i].y;
      pos[3*i+2] = residues[i].z;
      const c = SS_COLORS[residues[i].ss] || SS_COLORS.C;
      col[3*i] = c.r; col[3*i+1] = c.g; col[3*i+2] = c.b;
    }

    this.lineGeom = new THREE.BufferGeometry();
    this.lineGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lineGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.line = new THREE.Line(this.lineGeom, new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 }));
    this.scene.add(this.line);
    this.positionsAttr = this.lineGeom.getAttribute('position');

    this.baseColors = col.slice();
    const workCol = col.slice();

    const sphereGeom = new THREE.SphereGeometry(0.6, 8, 6);
    const sphereMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.spheres = new THREE.InstancedMesh(sphereGeom, sphereMat, n);
    this.spheres.frustumCulled = false;
    this.spheres.instanceColor = new THREE.InstancedBufferAttribute(workCol, 3);
    const matArr = this.spheres.instanceMatrix.array;
    for (let i = 0; i < n; i++) {
      const b = i * 16;
      matArr[b + 0] = 1; matArr[b + 5] = 1; matArr[b + 10] = 1; matArr[b + 15] = 1;
      matArr[b + 12] = pos[3*i];
      matArr[b + 13] = pos[3*i+1];
      matArr[b + 14] = pos[3*i+2];
    }
    this.spheres.instanceMatrix.needsUpdate = true;
    this._colorsDirty = false;
    this.scene.add(this.spheres);

    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pos[3*i], pos[3*i+1], pos[3*i+2]);
      if (d > maxR) maxR = d;
    }
    const dist = maxR * 2.6 + 20;
    this.camera.position.set(0, 0, dist);
    this.camera.far = dist * 6;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  updatePositions(positions, pulses) {
    if (!this.positionsAttr) return;
    const arr = this.positionsAttr.array;
    arr.set(positions);
    this.positionsAttr.needsUpdate = true;
    const n = positions.length / 3;
    const matArr = this.spheres.instanceMatrix.array;
    const colArr = this.spheres.instanceColor.array;
    const base = this.baseColors;

    let anyPulse = false;
    if (pulses) {
      for (let i = 0; i < n; i++) if (pulses[i] > 0.01) { anyPulse = true; break; }
    }

    for (let i = 0; i < n; i++) {
      const p = pulses ? pulses[i] : 0;
      const s = p > 0.01 ? 1 + p * 0.8 : 1;
      const b = i * 16;
      matArr[b + 0] = s; matArr[b + 5] = s; matArr[b + 10] = s;
      matArr[b + 12] = positions[3*i];
      matArr[b + 13] = positions[3*i+1];
      matArr[b + 14] = positions[3*i+2];
    }
    this.spheres.instanceMatrix.needsUpdate = true;

    if (anyPulse || this._colorsDirty) {
      for (let i = 0; i < n; i++) {
        const p = pulses ? pulses[i] : 0;
        const k = 3 * i;
        colArr[k]   = base[k]   + (1 - base[k])   * p;
        colArr[k+1] = base[k+1] + (1 - base[k+1]) * p;
        colArr[k+2] = base[k+2] + (1 - base[k+2]) * p;
      }
      this.spheres.instanceColor.needsUpdate = true;
      this._colorsDirty = anyPulse;
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
