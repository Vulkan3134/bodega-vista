/* scene.js - renderer, camara, controles orbitales, iluminacion y vistas predefinidas (igual que el layout original). */
(function (global) {
  'use strict';

  function create(el, THREE, dims) {
    const W = dims.W, D = dims.D;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const R = new THREE.WebGLRenderer({ antialias: true });
    R.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(R.domElement);
    const S = new THREE.Scene();
    S.background = new THREE.Color(dark ? 0x12181f : 0xeef1f4);
    const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 900);
    const OC = new THREE.MapControls(cam, R.domElement);
    OC.enableDamping = true;
    OC.dampingFactor = 0.12;
    OC.screenSpacePanning = true;
    OC.enablePan = true;
    OC.enableRotate = true;
    OC.enableZoom = true;
    OC.minDistance = 0.3;
    OC.maxDistance = 700;
    OC.zoomSpeed = 1.4;
    OC.panSpeed = 1.35;
    OC.rotateSpeed = 0.7;
    OC.minPolarAngle = 0.05;
    OC.maxPolarAngle = Math.PI / 2 - 0.04;
    OC.listenToKeyEvents(R.domElement);
    R.domElement.tabIndex = 0;
    R.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    S.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(-30, 60, 40); S.add(dl);

    const G = {};
    ['walls', 'roof', 'cols', 'pal', 'doors', 'lab', 'eq', 'lines', 'ext', 'mp', 'mpal', 'mpx', 'flow'].forEach((k) => { G[k] = new THREE.Group(); S.add(G[k]); });
    G.roof.visible = false;

    const T = new THREE.Vector3(W / 2, 3, D / 2);
    function pose(v) {
      const a = Math.max(0.2, el.clientWidth / Math.max(1, el.clientHeight)), k = a < 1 ? 1.7 : 1;
      if (v === 'iso') return { pos: new THREE.Vector3(-34 * k, 48 * k, 78 * k), tgt: T.clone() };
      if (v === 'top') return { pos: new THREE.Vector3(W / 2, (a < 1 ? 150 : 100), D / 2 + 0.01), tgt: T.clone() };
      if (v === 'front') return { pos: new THREE.Vector3(W / 2, 14, D + 62 * k), tgt: T.clone() };
      if (v === 'all') return { pos: new THREE.Vector3(25 - 45 * k, 120 * k, 75 * k), tgt: new THREE.Vector3(25, 0, -12) };
      if (v === 'alltop') return { pos: new THREE.Vector3(25, (a < 1 ? 330 : 200), -11.99), tgt: new THREE.Vector3(25, 0, -12) };
      return { pos: new THREE.Vector3(30 - 20 * k, 85 * k, -45 + 55 * k), tgt: new THREE.Vector3(30, 0, -45) };
    }
    function view(v, animate) {
      const p = pose(v);
      if (animate) flyTo(p.pos, p.tgt, 1200, 45);
      else { cam.fov = 45; cam.updateProjectionMatrix(); cam.position.copy(p.pos); OC.target.copy(p.tgt); OC.update(); }
    }
    function fit() {
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      R.setSize(w, h, false);
      R.domElement.style.width = '100%';
      R.domElement.style.height = '100%';
      cam.aspect = w / h;
      cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }

    // Recorre una polilínea de pasillos. Cada punto es { pos, look }.
    let anim = null;
    function begin(ms, fov) {
      return { t0: performance.now(), ms: ms, fovFrom: cam.fov, fovTo: fov == null ? cam.fov : fov };
    }
    function flyTo(pos, target, ms, fov) {
      anim = Object.assign(begin(ms || 1200, fov), {
        kind: 'direct',
        camFrom: cam.position.clone(), camTo: pos.clone(),
        tgtFrom: OC.target.clone(), tgtTo: target.clone()
      });
    }
    function flyPath(points, fov) {
      const seg = [];
      let total = 0;
      for (let i = 1; i < points.length; i++) {
        const d = Math.max(points[i].pos.distanceTo(points[i - 1].pos), 2.2);
        seg.push(d); total += d;
      }
      anim = Object.assign(begin(Math.max(1100, Math.min(4200, total * 62)), fov), { kind: 'path', points: points, seg: seg, total: total });
    }
    function ease(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
    function step(now) {
      if (!anim) return false;
      const k = Math.min(1, (now - anim.t0) / anim.ms), e = ease(k);
      if (anim.kind === 'path') {
        let dist = e * anim.total, i = 0;
        while (i < anim.seg.length - 1 && dist > anim.seg[i]) { dist -= anim.seg[i]; i++; }
        const t = anim.seg[i] ? dist / anim.seg[i] : 1;
        cam.position.lerpVectors(anim.points[i].pos, anim.points[i + 1].pos, t);
        OC.target.lerpVectors(anim.points[i].look, anim.points[i + 1].look, t);
      } else {
        cam.position.lerpVectors(anim.camFrom, anim.camTo, e);
        OC.target.lerpVectors(anim.tgtFrom, anim.tgtTo, e);
      }
      cam.fov = anim.fovFrom + (anim.fovTo - anim.fovFrom) * e;
      cam.updateProjectionMatrix();
      cam.lookAt(OC.target);
      if (k >= 1) { anim = null; OC.update(); }
      return anim !== null;
    }

    function release() {
      if (!anim) return;
      anim = null;
    }
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();
    R.domElement.addEventListener('pointerdown', release, true);
    R.domElement.addEventListener('wheel', (e) => {
      release();
      const rect = R.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      if (ray.ray.intersectPlane(ground, hit)) OC.target.lerp(hit, e.deltaY > 0 ? 0.04 : 0.2);
    }, { capture: true, passive: true });
    addEventListener('resize', fit);
    fit(); view('all');
    let onFrame = null;
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!step(now || performance.now())) OC.update();
      if (onFrame) onFrame();
      R.render(S, cam);
    })();

    return { R, S, cam, OC, G, dark, view, fit, flyTo, flyPath, setOnFrame: (f) => { onFrame = f; } };
  }

  global.SceneKit = { create };
})(window);
