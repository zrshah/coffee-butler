import * as THREE from 'three';

// Scene = the 3D world. Camera = the eye looking at it.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;

// Renderer = draws the scene onto a <canvas>.
// Pixel ratio 1 = draw fewer pixels; kinder to an old tablet.
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// The future head: a blue wireframe sphere.
const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(1.2, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x4cc9f0, wireframe: true })
);
scene.add(sphere);

// Tap anywhere = one fast flip (a full turn), like the wake-up animation.
const FLIP_SPEED = 0.2; // radians per frame
let flipLeft = 0;
addEventListener('pointerdown', () => { flipLeft = Math.PI * 2; });

// FPS counter: count frames, show the total once per second.
const fpsEl = document.getElementById('fps');
let frames = 0;
let lastFpsTime = performance.now();

function animate(now) {
  sphere.rotation.y += 0.01;
  if (flipLeft > 0) {
    sphere.rotation.x += FLIP_SPEED;
    flipLeft -= FLIP_SPEED;
  }
  renderer.render(scene, camera);

  frames++;
  if (now - lastFpsTime >= 1000) {
    fpsEl.textContent = frames + ' fps';
    frames = 0;
    lastFpsTime = now;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Keep it full-screen if the window changes size or the tablet rotates.
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
