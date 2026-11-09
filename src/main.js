import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  RINGS, SEGMENTS, MIN_INNER_RADIUS, GEOMETRY_RESOLUTIONS, SHAPES, CLAY_COLORS, createProfile, createVerticalProfile,
  influenceCursorDiameter,
  materialTAtHeight, applyFullHeightStretch, applyVerticalPull, verticalPullDisplacement, screenSideFromAxis, applyDiameterDrag, applyLocalSmooth, applyLocalSharpen, applyRingRelief,
  formatHeightControlValue, isValidVerticalProfile, makeClayGeometry,
  makeClayMaterial, makeMetalMaterial, estimateVolume,
} from './ceramic.js';
import { applyTranslations, getLocale, setLocale, t } from './i18n.js';
import { SnapshotTimeline } from './history.js';
import { isShortcutBlockedTarget, resolveShortcut } from './shortcuts.js';
import './style.css';

RectAreaLightUniformsLib.init();
const $ = (selector) => document.querySelector(selector);
applyTranslations();
// main.js statically imports style.css above, so the app is revealed only after its stylesheet is active.
document.documentElement.classList.remove('app-loading');
const rangeInputs = [...document.querySelectorAll('input[type="range"]')];
function syncRangeProgress(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100), value = Number(input.value || 0);
  input.style.setProperty('--range-progress', `${max > min ? ((value - min) / (max - min)) * 100 : 0}%`);
}
rangeInputs.forEach((input) => {
  syncRangeProgress(input);
  input.addEventListener('input', () => syncRangeProgress(input));
});
const controlFolds = [...document.querySelectorAll('.control-fold')];
const foldSessionKey = 'torno-panel-state-v042';
try {
  const savedFolds = JSON.parse(sessionStorage.getItem(foldSessionKey) || 'null');
  controlFolds.forEach((fold, index) => { fold.open = Array.isArray(savedFolds) ? savedFolds[index] ?? false : false; });
  controlFolds.forEach((fold) => fold.addEventListener('toggle', () => {
    sessionStorage.setItem(foldSessionKey, JSON.stringify(controlFolds.map((item) => item.open)));
  }));
} catch {
  controlFolds.forEach((fold) => { fold.open = false; });
}
const stage = $('#stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#111510');
scene.fog = new THREE.Fog('#111510', 8, 18);
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
camera.position.set(4.15, 2.65, 6.2);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.28;
stage.prepend(renderer.domElement); renderer.domElement.className = 'webgl';

const ambientLight = new THREE.HemisphereLight('#d8dfd1', '#22231e', 1.25);
scene.add(ambientLight);
const key = new THREE.DirectionalLight('#fff0d7', 4.1); key.position.set(-3.5, 6.5, 4.2); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 7; key.shadow.camera.bottom = -4; scene.add(key);
const rim = new THREE.DirectionalLight('#b5c9dd', 3.2); rim.position.set(4, 4.5, -4); scene.add(rim);
const strip = new THREE.RectAreaLight('#e3e8ec', 7, 4, 0.7); strip.position.set(1.2, 4.4, 1.4); strip.lookAt(0, 0.5, 0); scene.add(strip);
const fill = new THREE.PointLight('#d6a77e', 17, 10); fill.position.set(2.8, 1.6, 3); scene.add(fill);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
room.dispose(); pmrem.dispose();
function setAmbientLighting(value) {
  const level = THREE.MathUtils.clamp(Number(value) / 100, 0, 1);
  ambientLight.intensity = 1.25 * level;
  scene.environmentIntensity = level;
  $('#lightingValue').textContent = `${Math.round(level * 100)}%`;
  syncRangeProgress($('#lighting'));
}
setAmbientLighting($('#lighting').value);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#171a16', roughness: 0.92 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.035; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(30, 60, '#343b32', '#252b24'); grid.position.y = -0.025; grid.material.transparent = true; grid.material.opacity = 0.25; scene.add(grid);

const turntable = new THREE.Group(); scene.add(turntable);
const metal = makeMetalMaterial();
const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.16, 128), metal);
wheel.position.y = 0.1; wheel.castShadow = true; wheel.receiveShadow = true; turntable.add(wheel);
const wheelTop = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, 0.035, 128), metal);
wheelTop.position.y = 0.196; wheelTop.castShadow = true; wheelTop.receiveShadow = true; turntable.add(wheelTop);
const grooveMat = new THREE.MeshStandardMaterial({ color: '#7d8588', metalness: 0.92, roughness: 0.32 });
for (let i = 0; i < 18; i++) {
  const radius = 0.34 + i * 0.044;
  const groove = new THREE.Mesh(new THREE.TorusGeometry(radius, i % 4 === 0 ? 0.0035 : 0.002, 5, 128), grooveMat);
  groove.rotation.x = Math.PI / 2; groove.position.y = 0.218; turntable.add(groove);
}
const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 0.43, 64), new THREE.MeshStandardMaterial({ color: '#252b2d', metalness: 0.86, roughness: 0.3 }));
foot.position.y = -0.19; turntable.add(foot);
const wearMat = new THREE.MeshStandardMaterial({ color: '#737b7d', metalness: 0.92, roughness: 0.38 });
for (let i = 0; i < 12; i++) {
  const a = i * 2.399;
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.008 + (i % 3) * 0.002, 6, 5), wearMat);
  mark.position.set(Math.cos(a) * (0.98 + (i % 3) * 0.035), 0.218, Math.sin(a) * (0.98 + (i % 3) * 0.035)); turntable.add(mark);
}

const state = {
  shape: 'cylinder', presetVersion: 2, appearanceVersion: 2, color: 'terracotta', profile: createProfile('cylinder', 2),
  height: 0.62, verticalProfile: createVerticalProfile(0.62), heightLock: true, cavity: 0.43, thickness: 0.11,
  modelResolution: 'balanced', exportResolution: 'standard', adaptiveTopology: true,
  smoothVisual: true, prioritizeQuads: true, imperfections: 50,
  pressure: 0.42, influence: 0.18, preserveVolume: false, dirty: false,
};
const LEGACY_TERRACOTTA = '#a95739';
const clay = new THREE.Mesh(new THREE.BufferGeometry(), makeClayMaterial(CLAY_COLORS.find((color) => color.id === state.color)?.color || '#6b5143', 'fresh'));
clay.material.userData.clayFinish = 'fresh';
clay.castShadow = true; clay.receiveShadow = true; clay.position.y = 0.22; turntable.add(clay);
const cursorSegments = 64, cursorPositions = [];
for (let i = 0; i < cursorSegments; i++) {
  const angle = (i / cursorSegments) * Math.PI * 2;
  cursorPositions.push(Math.cos(angle), Math.sin(angle), 0);
}
const cursorRingGeometry = new THREE.BufferGeometry();
cursorRingGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cursorPositions, 3));
const cursorRing = new THREE.LineLoop(cursorRingGeometry, new THREE.LineBasicMaterial({
  color: '#d1ddb0', transparent: true, opacity: 0.62, depthTest: false, depthWrite: false, toneMapped: false,
}));
const cursorDotGeometry = new THREE.BufferGeometry();
cursorDotGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
const cursorDot = new THREE.Points(cursorDotGeometry, new THREE.PointsMaterial({
  color: '#e1e9cd', size: 4, sizeAttenuation: false, transparent: true, opacity: 0.82,
  depthTest: false, depthWrite: false, toneMapped: false,
}));
const influenceCursor = new THREE.Group();
influenceCursor.add(cursorRing, cursorDot); influenceCursor.visible = false; influenceCursor.renderOrder = 1000; scene.add(influenceCursor);
function resizeInfluenceCursor() {
  const diameter = influenceCursorDiameter(state.influence);
  const radius = diameter * 0.5;
  influenceCursor.scale.set(radius, radius, radius);
}
resizeInfluenceCursor();
function updateInfluenceCursor(hit) {
  if (mode !== 'model' || tool === 'height' || !hit) { influenceCursor.visible = false; return; }
  turntable.updateMatrixWorld(true); clay.updateMatrixWorld(true);
  const normal = hit.face?.normal?.clone().transformDirection(clay.matrixWorld) || new THREE.Vector3(0, 1, 0);
  influenceCursor.position.copy(hit.point).addScaledVector(normal, 0.012);
  influenceCursor.quaternion.copy(camera.quaternion);
  resizeInfluenceCursor(); influenceCursor.visible = true;
}
function clayFinish() { return state.shape === 'cylinder' && state.presetVersion >= 2 ? 'fresh' : 'classic'; }
function clayColor(id = state.color) {
  if (id === 'terracotta' && (state.appearanceVersion < 2 || clayFinish() !== 'fresh')) return LEGACY_TERRACOTTA;
  return CLAY_COLORS.find((color) => color.id === id)?.color || '#6b5143';
}
function setClayAppearance() {
  const finish = clayFinish();
  if (clay.material.userData.clayFinish !== finish) {
    const previous = clay.material;
    clay.material = makeClayMaterial(clayColor(), finish);
    new Set([previous.map, previous.bumpMap, previous.roughnessMap].filter(Boolean)).forEach((texture) => texture.dispose());
    previous.dispose();
    clay.material.userData.clayFinish = finish;
  } else clay.material.color.set(clayColor());
  clay.material.flatShading = !state.smoothVisual;
  clay.material.bumpScale = (finish === 'fresh' ? 0.0035 : 0.012) * (state.imperfections / 50);
  clay.material.needsUpdate = true;
}
function resolutionSettings(level) {
  const key = level === 'standard' ? 'balanced' : level;
  return GEOMETRY_RESOLUTIONS[key] || GEOMETRY_RESOLUTIONS.balanced;
}
function maxFeasibleWallMm(profile = state.profile) {
  const room = Math.min(...profile.map((radius) => radius - MIN_INNER_RADIUS));
  return Math.max(1, Math.min(32, Math.floor(room * 100 + 1e-6)));
}
function rebuildClay(resolution = state.modelResolution) {
  const maximumWall = maxFeasibleWallMm();
  if (state.thickness * 100 > maximumWall + 1e-6) state.thickness = maximumWall / 100;
  const old = clay.geometry;
  const quality = resolutionSettings(resolution);
  clay.geometry = makeClayGeometry(state.profile, state.height, state.cavity, state.thickness, {
    ...quality, adaptive: state.adaptiveTopology, imperfections: state.imperfections,
    surfaceStyle: clayFinish(), verticalProfile: state.verticalProfile,
  });
  setClayAppearance();
  old.dispose(); updatePieceMeta();
}
function updatePieceMeta() {
  const selected = SHAPES.find((shape) => shape.id === state.shape);
  $('#pieceName').textContent = (selected ? t(`shape.${selected.id}`) : t('piece.generic')).toLocaleUpperCase(getLocale());
  const heightCm = formatHeightControlValue(state.height);
  $('#heightControl').value = heightCm;
  if (document.activeElement !== $('#heightExact')) $('#heightExact').value = heightCm;
  $('#heightValue').textContent = `${heightCm} cm`;
  $('#thickness').max = maxFeasibleWallMm();
  $('#thickness').value = Math.min(Math.round(state.thickness * 100), Number($('#thickness').max));
  $('#thicknessValue').textContent = `${Math.round(state.thickness * 100)} mm`;
  syncRangeProgress($('#heightControl')); syncRangeProgress($('#thickness'));
}
function syncGeometryControls() {
  $('#modelResolution').value = state.modelResolution;
  $('#exportResolution').value = state.exportResolution;
  $('#adaptiveTopology').checked = state.adaptiveTopology;
  $('#smoothVisual').checked = state.smoothVisual;
  $('#prioritizeQuads').checked = state.prioritizeQuads;
  $('#imperfections').value = state.imperfections;
  $('#imperfectionsValue').textContent = `${state.imperfections}%`;
  $('#thickness').value = Math.round(state.thickness * 100);
  $('#thicknessValue').textContent = `${Math.round(state.thickness * 100)} mm`;
  syncRangeProgress($('#imperfections')); syncRangeProgress($('#thickness'));
}
rebuildClay();

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.64, 0); controls.enableDamping = true; controls.dampingFactor = 0.065;
controls.minDistance = 2.6; controls.maxDistance = 40; controls.minPolarAngle = 0.015; controls.maxPolarAngle = Math.PI - 0.015;
controls.enablePan = false; controls.update();
let cameraTransition = null, activeCameraView = 'perspective';
controls.addEventListener('start', () => { cameraTransition = null; });
function cameraFitDistance() {
  const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const radius = Math.max(...state.profile);
  const standardFit = Math.max(3.2, state.height / (1.42 * halfFov), (2 * radius) / (1.42 * halfFov * Math.max(0.45, camera.aspect)));
  const responsive = window.matchMedia('(max-width: 900px), (max-height: 520px) and (orientation: landscape)').matches;
  if (!responsive) return standardFit;
  const stageRect = stage.getBoundingClientRect();
  const topbarBottom = $('.topbar').getBoundingClientRect().bottom;
  const sheetOpen = $('#toolSheet').dataset.sheetOpen === 'true';
  const obstructionTop = (sheetOpen ? $('#toolSheet') : $('.bottom-panel')).getBoundingClientRect().top;
  const visibleHeight = THREE.MathUtils.clamp((obstructionTop - topbarBottom) / Math.max(1, stageRect.height), 0.18, 0.94);
  const wheelFit = 1.3 / (halfFov * Math.max(0.2, camera.aspect) * 0.95);
  const assemblyHeight = state.height + 0.55;
  const visibleAreaFit = assemblyHeight / (2 * halfFov * visibleHeight * 0.87);
  return Math.max(standardFit, wheelFit, visibleAreaFit);
}
function scheduleCameraFrame(view = activeCameraView, forcePreset = false) {
  const changedView = view !== activeCameraView;
  activeCameraView = view;
  const target = new THREE.Vector3(0, clay.position.y + state.height * 0.5, 0);
  const perspective = new THREE.Vector3(4.15, 2.01, 6.2).normalize();
  const direction = forcePreset || changedView
    ? view === 'front' ? new THREE.Vector3(0, 0, 1)
      : view === 'side' ? new THREE.Vector3(1, 0, 0)
        : view === 'top' ? new THREE.Vector3(0.001, 1, 0.18).normalize()
          : perspective
    : camera.position.clone().sub(controls.target).normalize();
  const responsiveCamera = window.matchMedia('(max-width: 900px), (max-height: 520px) and (orientation: landscape)').matches;
  const distance = cameraFitDistance() * (responsiveCamera ? 1.02 : 1.08);
  if (responsiveCamera) {
    const stageRect = stage.getBoundingClientRect();
    const top = $('.topbar').getBoundingClientRect().bottom;
    const bottomSelector = $('#toolSheet').dataset.sheetOpen === 'true' ? '#toolSheet' : '.bottom-panel';
    const bottomEdge = $(bottomSelector).getBoundingClientRect().top;
    const centerFraction = THREE.MathUtils.clamp(((top + bottomEdge) * 0.5 - stageRect.top) / Math.max(1, stageRect.height), 0.15, 0.5);
    const screenUp = new THREE.Vector3(0, 1, 0).addScaledVector(direction, -direction.y);
    if (screenUp.lengthSq() > 1e-6) {
      screenUp.normalize();
      const verticalSpan = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      target.addScaledVector(screenUp, -(0.5 - centerFraction) * verticalSpan);
    }
  }
  cameraTransition = { target, position: target.clone().addScaledVector(direction, distance) };
  scene.fog.near = Math.max(8, distance + state.height * 0.25);
  scene.fog.far = Math.max(18, distance + state.height * 1.75);
  $('#cameraView').value = view;
}

const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let mode = 'model', tool = 'throw', shiftToolRestore = null, rpm = 72, running = true, sculpting = false, dragStart = null;
const history = new SnapshotTimeline(50);
let toastTimer;
let pristinePresetHistory = true;
const canvas = renderer.domElement;

function snapshot(includePreferences = false) {
  const data = {
    version: 4, shape: state.shape, presetVersion: state.presetVersion, appearanceVersion: state.appearanceVersion,
    color: state.color, profile: [...state.profile], height: state.height,
    verticalProfile: [...state.verticalProfile], heightLock: state.heightLock, preserveVolume: state.preserveVolume,
    cavity: state.cavity, thickness: state.thickness, imperfections: state.imperfections,
    pressure: state.pressure, influence: state.influence,
  };
  if (includePreferences) Object.assign(data, {
    modelResolution: state.modelResolution, exportResolution: state.exportResolution,
    adaptiveTopology: state.adaptiveTopology, smoothVisual: state.smoothVisual, prioritizeQuads: state.prioritizeQuads,
  });
  return data;
}
function applySnapshot(data) {
  state.shape = data.shape; state.color = data.color; state.profile = [...data.profile]; state.height = data.height;
  state.verticalProfile = Array.isArray(data.verticalProfile) ? [...data.verticalProfile] : createVerticalProfile(state.height);
  state.heightLock = typeof data.heightLock === 'boolean' ? data.heightLock : true;
  state.preserveVolume = typeof data.preserveVolume === 'boolean' ? data.preserveVolume : false;
  state.presetVersion = data.shape === 'cylinder' && data.presetVersion === 2 ? 2 : data.shape === 'cylinder' ? 1 : 2;
  state.appearanceVersion = data.appearanceVersion === 2 ? 2 : 1;
  state.cavity = data.cavity; state.thickness = data.thickness; state.pressure = data.pressure; state.influence = data.influence;
  state.imperfections = THREE.MathUtils.clamp(Number(data.imperfections ?? 50), 0, 100);
  if (['light', 'balanced', 'high'].includes(data.modelResolution)) state.modelResolution = data.modelResolution;
  if (['light', 'standard', 'high'].includes(data.exportResolution)) state.exportResolution = data.exportResolution;
  if (typeof data.adaptiveTopology === 'boolean') state.adaptiveTopology = data.adaptiveTopology;
  if (typeof data.smoothVisual === 'boolean') state.smoothVisual = data.smoothVisual;
  if (typeof data.prioritizeQuads === 'boolean') state.prioritizeQuads = data.prioritizeQuads;
  $('#heightLock').checked = state.heightLock;
  $('#preserveVolume').checked = state.preserveVolume;
  setClayAppearance();
  const heightCm = formatHeightControlValue(state.height);
  $('#heightControl').value = heightCm; $('#heightExact').value = heightCm; $('#heightValue').textContent = `${heightCm} cm`;
  $('#pressure').value = Math.round(state.pressure * 100); $('#pressureValue').textContent = `${Math.round(state.pressure * 100)}%`;
  $('#influence').value = Math.round(state.influence * 100); $('#influenceValue').textContent = `${Math.round(state.influence * 100)} cm`;
  syncGeometryControls(); updateColorSelection(); drawShapeCatalog(); rebuildClay(); scheduleCameraFrame();
}
function addHistory({ clean = false, edit = true } = {}) {
  if (edit && pristinePresetHistory) { pristinePresetHistory = false; history.markClean(); }
  history.record(snapshot(), { clean });
  state.dirty = pristinePresetHistory ? false : history.isDirty; updateHistoryButtons();
}
function resetHistory({ pristine = false } = {}) { history.reset(snapshot()); pristinePresetHistory = pristine; state.dirty = false; updateHistoryButtons(); }
function updateHistoryButtons() { $('#undoButton').disabled = !history.canUndo; $('#redoButton').disabled = !history.canRedo; }
function updateDirtyFromHistory() { state.dirty = pristinePresetHistory ? false : history.isDirty; updateHistoryButtons(); }
function undo() { const data = history.undo(); if (!data) return; applySnapshot(data); updateDirtyFromHistory(); }
function redo() { const data = history.redo(); if (!data) return; applySnapshot(data); updateDirtyFromHistory(); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
function canDiscard() { return !state.dirty || window.confirm(t('confirm.discard')); }

function drawShapeCatalog() {
  $('#shapeCatalog').innerHTML = SHAPES.map((shape) => { const name = t(`shape.${shape.id}`); return `<button class="shape-option${state.shape === shape.id ? ' selected' : ''}" data-shape="${shape.id}" title="${name}"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="${shapePath(shape)}"/></svg><span>${name}</span></button>`; }).join('');
  $('#shapeCatalog').querySelectorAll('[data-shape]').forEach((button) => button.addEventListener('click', () => selectShape(button.dataset.shape)));
}
function shapePath(shape) {
  const pts = Array.from({ length: 13 }, (_, i) => shape.profile(i / 12));
  const right = pts.map((r, i) => `${20 + r * 11},${36 - i * 2.6}`).join(' L ');
  const left = [...pts].reverse().map((r, i) => `${20 - r * 11},${36 - (12 - i) * 2.6}`).join(' L ');
  return `M ${right} L ${left} Z`;
}
function selectShape(id) {
  if (id === state.shape) return;
  const discardEdits = state.dirty;
  if (!canDiscard()) return;
  const shape = SHAPES.find((item) => item.id === id); if (!shape) return;
  state.shape = id; state.presetVersion = 2; if (id === 'cylinder') state.appearanceVersion = 2;
  state.height = shape.height; state.verticalProfile = createVerticalProfile(state.height); state.cavity = shape.cavity;
  state.profile = createProfile(id, state.presetVersion); setClayAppearance(); rebuildClay(); drawShapeCatalog(); drawColors();
  if (discardEdits) resetHistory({ pristine: true });
  else if (pristinePresetHistory) addHistory({ clean: true, edit: false });
  else addHistory();
  scheduleCameraFrame(); toast(t('toast.shape', { shape: t(`shape.${shape.id}`) }));
}
function drawColors() {
  $('#clayColors').innerHTML = CLAY_COLORS.map((color) => { const name = t(`color.${color.id}`); const label = `${t('panel.clay')}: ${name}`; const swatch = clayColor(color.id); return `<button class="color-option${state.color === color.id ? ' selected' : ''}" data-color="${color.id}" title="${label}" aria-label="${label}" style="--swatch:${swatch}"></button>`; }).join('');
  $('#clayColors').querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => {
    const color = CLAY_COLORS.find((item) => item.id === button.dataset.color); if (!color || color.id === state.color) return;
    state.color = color.id; state.appearanceVersion = 2; setClayAppearance(); drawColors(); addHistory();
  }));
}
function updateColorSelection() { drawColors(); }
drawShapeCatalog(); drawColors(); syncGeometryControls(); resetHistory({ pristine: true });

document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
  if (!setLocale(button.dataset.language)) return;
  drawShapeCatalog(); drawColors(); updatePieceMeta();
  setTool(tool); setWheel(running);
  syncToolSheetToggle();
}));
const immersiveToggle = $('#immersiveToggle');
function setImmersiveMode(enabled) {
  stage.classList.toggle('immersive-mode', enabled);
  const key = enabled ? 'immersive.exit' : 'immersive.enter';
  immersiveToggle.dataset.i18nTitle = key;
  immersiveToggle.dataset.i18nAriaLabel = key;
  immersiveToggle.title = t(key);
  immersiveToggle.setAttribute('aria-label', t(key));
  immersiveToggle.setAttribute('aria-pressed', String(enabled));
  immersiveToggle.querySelector('use').setAttribute('href', enabled ? '#icon-minimize-2' : '#icon-maximize-2');
  if (enabled) immersiveToggle.focus({ preventScroll: true });
}
immersiveToggle.addEventListener('click', () => setImmersiveMode(!stage.classList.contains('immersive-mode')));
function syncToolSheetToggle() {
  const open = $('#toolSheet').dataset.sheetOpen === 'true';
  const label = t(open ? 'panel.hideTools' : 'panel.showTools');
  $('#sheetToggleLabel').textContent = label;
  $('#toolSheetToggle').setAttribute('aria-label', label);
  $('#toolSheetToggle').setAttribute('aria-expanded', String(open));
  $('#toolSheetToggle use').setAttribute('href', open ? '#icon-chevron-down' : '#icon-chevron-up');
}
syncToolSheetToggle();
$('#toolSheetToggle').addEventListener('click', () => {
  const sheet = $('#toolSheet');
  sheet.dataset.sheetOpen = String(sheet.dataset.sheetOpen !== 'true');
  syncToolSheetToggle();
});
$('#toolSheet').addEventListener('transitionend', (event) => {
  if (event.target === event.currentTarget && event.propertyName === 'max-height') scheduleCameraFrame();
});

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera);
}
function hitClay(event) { updatePointer(event); return raycaster.intersectObject(clay, false)[0] || null; }
function diameterScreenSide(hitPoint) {
  camera.updateMatrixWorld();
  const hitScreenX = hitPoint.clone().project(camera).x;
  const axisScreenX = new THREE.Vector3(clay.position.x, hitPoint.y, clay.position.z).project(camera).x;
  return screenSideFromAxis(hitScreenX, axisScreenX);
}
canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'model') return;
  if (event.shiftKey && tool !== 'smooth') {
    if (shiftToolRestore === null) shiftToolRestore = tool;
    setTool('smooth');
  }
  const hit = hitClay(event); if (!hit) return;
  updateInfluenceCursor(hit);
  cameraTransition = null;
  sculpting = true; dragStart = {
    x: event.clientX, y: event.clientY,
    pointerType: event.pointerType,
    gestureTool: event.shiftKey ? 'smooth' : tool,
    t: THREE.MathUtils.clamp(materialTAtHeight(state.verticalProfile, hit.point.y - clay.position.y, state.height), 0.02, 0.98),
    screenSide: ['diameter', 'throw'].includes(tool) ? diameterScreenSide(hit.point) : 1,
    volume: estimateVolume(state.profile, state.height, state.verticalProfile),
    initialHeight: state.height,
  };
  if (['groove', 'ridge'].includes(dragStart.gestureTool)) {
    state.profile = applyRingRelief({
      profile: state.profile, centerT: dragStart.t, kind: dragStart.gestureTool,
      pressure: state.pressure, influence: state.influence, height: state.height, dab: true,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
    });
  }
  controls.enabled = false; canvas.setPointerCapture(event.pointerId); canvas.classList.add('sculpting'); event.preventDefault();
  rebuildClay('light');
});
canvas.addEventListener('pointermove', (event) => {
  if (mode !== 'model') { influenceCursor.visible = false; return; }
  if (!sculpting || !dragStart) { updateInfluenceCursor(hitClay(event)); return; }
  const dx = event.clientX - dragStart.x, dy = event.clientY - dragStart.y;
  const gestureTool = dragStart.gestureTool;
  if (gestureTool === 'groove' || gestureTool === 'ridge') {
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    state.profile = applyRingRelief({
      profile: state.profile, centerT, kind: gestureTool, deltaDistance: Math.hypot(dx, dy),
      pressure: state.pressure, influence: state.influence, height: state.height,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
    });
    dragStart.t = centerT; rebuildClay('light');
  } else if (gestureTool === 'smooth') {
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    state.profile = applyLocalSmooth({
      profile: state.profile, centerT, deltaDistance: Math.hypot(dx, dy),
      pressure: state.pressure, influence: state.influence, height: state.height,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
    });
    dragStart.t = centerT; rebuildClay('light');
  } else if (gestureTool === 'sharpen') {
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    state.profile = applyLocalSharpen({
      profile: state.profile, centerT, deltaDistance: Math.hypot(dx, dy),
      pressure: state.pressure, influence: state.influence, height: state.height,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
    });
    dragStart.t = centerT; rebuildClay('light');
  } else if (gestureTool === 'throw') {
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    const minRadius = Math.max(0.14, state.thickness + MIN_INNER_RADIUS);
    const radialProfile = applyDiameterDrag({
      profile: state.profile, centerT, deltaX: dx, screenSide: dragStart.screenSide,
      pressure: state.pressure, influence: state.influence, height: state.height, minRadius,
    });
    camera.updateMatrixWorld();
    const rect = canvas.getBoundingClientRect();
    const cameraDistance = camera.position.distanceTo(controls.target);
    const worldPerPixel = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(1, rect.height);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const displacement = verticalPullDisplacement(dy, worldPerPixel, screenUp.y, state.pressure);
    const pulled = applyVerticalPull({
      profile: radialProfile, verticalProfile: state.verticalProfile, height: state.height, centerT,
      displacement, influence: state.influence, thickness: state.thickness, cavityFraction: state.cavity, heightLock: state.heightLock,
    });
    state.profile = pulled.profile; state.verticalProfile = pulled.verticalProfile; state.height = pulled.height;
    dragStart.t = centerT; rebuildClay('light');
  } else if (gestureTool === 'height') {
    const oldHeight = state.height;
    const stretched = applyFullHeightStretch({
      profile: state.profile, verticalProfile: state.verticalProfile, height: state.height, deltaY: dy,
      pressure: state.pressure, desiredVolume: dragStart.volume,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
    });
    state.height = stretched.height; state.verticalProfile = stretched.verticalProfile; state.profile = stretched.profile;
    dragStart.volume = estimateVolume(state.profile, state.height, state.verticalProfile);
    if (Math.abs(state.height - oldHeight) > 0.0001) rebuildClay('light');
  } else if (gestureTool === 'deform') {
    camera.updateMatrixWorld();
    const rect = canvas.getBoundingClientRect();
    const cameraDistance = camera.position.distanceTo(controls.target);
    const worldPerPixel = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) / Math.max(1, rect.height);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const displacement = verticalPullDisplacement(dy, worldPerPixel, screenUp.y, state.pressure);
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    const pulled = applyVerticalPull({
      profile: state.profile, verticalProfile: state.verticalProfile, height: state.height, centerT,
      displacement, influence: state.influence, thickness: state.thickness, cavityFraction: state.cavity, heightLock: state.heightLock,
    });
    state.profile = pulled.profile; state.verticalProfile = pulled.verticalProfile; state.height = pulled.height;
    dragStart.t = centerT; rebuildClay('light');
  } else if (gestureTool === 'diameter') {
    const centerT = THREE.MathUtils.clamp(dragStart.t - dy * 0.0024, 0.025, 0.985);
    state.profile = applyDiameterDrag({
      profile: state.profile, centerT, deltaX: dx, screenSide: dragStart.screenSide,
      pressure: state.pressure, influence: state.influence, height: state.height,
      minRadius: Math.max(0.14, state.thickness + MIN_INNER_RADIUS),
      preserveVolume: state.preserveVolume, desiredVolume: dragStart.volume,
      verticalProfile: state.verticalProfile,
    });
    dragStart.volume = estimateVolume(state.profile, state.height, state.verticalProfile);
    dragStart.t = centerT;
    rebuildClay('light');
  }
  const cursorHit = hitClay(event);
  if (cursorHit) updateInfluenceCursor(cursorHit);
  dragStart.x = event.clientX; dragStart.y = event.clientY;
});
canvas.addEventListener('pointerleave', () => { if (!sculpting) influenceCursor.visible = false; });
function stopSculpt(event) {
  if (!sculpting) return;
  const heightChanged = ['throw', 'deform', 'height'].includes(dragStart?.gestureTool) && Math.abs(state.height - dragStart.initialHeight) > 1e-4;
  const touchPointer = event?.pointerType === 'touch' || dragStart?.pointerType === 'touch';
  sculpting = false; dragStart = null; controls.enabled = true; canvas.classList.remove('sculpting'); rebuildClay(); addHistory();
  if (touchPointer) influenceCursor.visible = false;
  if (heightChanged) scheduleCameraFrame();
}
canvas.addEventListener('pointerup', stopSculpt); canvas.addEventListener('pointercancel', stopSculpt); canvas.addEventListener('lostpointercapture', stopSculpt);

document.querySelectorAll('.mode').forEach((button) => button.addEventListener('click', () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.mode').forEach((b) => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  controls.enabled = true; canvas.classList.toggle('view-only', mode === 'view');
  if (mode === 'view') influenceCursor.visible = false;
}));
function setTool(value) {
  tool = value;
  if (tool === 'height') influenceCursor.visible = false;
  $('#heightLockLabel').hidden = tool === 'diameter';
  document.querySelectorAll('[data-tool]').forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  const volumeToggle = $('#preserveVolume');
  volumeToggle.disabled = tool !== 'diameter';
  $('#preserveVolumeLabel').classList.toggle('is-disabled', volumeToggle.disabled);
  const hintKey = tool === 'throw' ? 'hint.throw' : tool === 'deform' ? 'hint.deform' : tool === 'height' ? 'hint.height' : tool === 'smooth' ? 'hint.smooth' : tool === 'sharpen' ? 'hint.sharpen' : tool === 'groove' ? 'hint.groove' : tool === 'ridge' ? 'hint.ridge' : 'hint.diameter';
  $('#toolHint').textContent = t(hintKey);
}
document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
$('#heightLock').addEventListener('change', (event) => { state.heightLock = event.target.checked; addHistory(); });
$('#preserveVolume').addEventListener('change', (event) => { state.preserveVolume = event.target.checked; addHistory(); });
$('#pressure').addEventListener('input', (event) => { state.pressure = Number(event.target.value) / 100; $('#pressureValue').textContent = `${event.target.value}%`; });
$('#influence').addEventListener('input', (event) => {
  state.influence = Number(event.target.value) / 100; $('#influenceValue').textContent = `${event.target.value} cm`;
  resizeInfluenceCursor();
});
$('#modelResolution').addEventListener('change', (event) => { state.modelResolution = event.target.value; rebuildClay(); });
$('#exportResolution').addEventListener('change', (event) => { state.exportResolution = event.target.value; });
$('#adaptiveTopology').addEventListener('change', (event) => { state.adaptiveTopology = event.target.checked; rebuildClay(); });
$('#smoothVisual').addEventListener('change', (event) => { state.smoothVisual = event.target.checked; clay.material.flatShading = !state.smoothVisual; clay.material.needsUpdate = true; });
$('#prioritizeQuads').addEventListener('change', (event) => { state.prioritizeQuads = event.target.checked; });
$('#imperfections').addEventListener('input', (event) => {
  state.imperfections = Number(event.target.value); $('#imperfectionsValue').textContent = `${state.imperfections}%`;
  setClayAppearance(); rebuildClay('light');
});
$('#imperfections').addEventListener('change', () => { rebuildClay(); addHistory(); });
$('#lighting').addEventListener('input', (event) => setAmbientLighting(event.target.value));
function setHeightCm(value, preview = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return false;
  const cm = THREE.MathUtils.clamp(parsed, 2.4, 100);
  const nextHeight = cm / 10;
  if (Math.abs(nextHeight - state.height) > 1e-6) {
    const verticalScale = nextHeight / state.height;
    state.height = nextHeight; state.verticalProfile = state.verticalProfile.map((y) => y * verticalScale);
    state.verticalProfile[RINGS] = state.height;
    rebuildClay(preview ? 'light' : state.modelResolution); scheduleCameraFrame();
  }
  return true;
}
$('#heightControl').addEventListener('input', (event) => setHeightCm(event.target.value, true));
$('#heightControl').addEventListener('change', (event) => { setHeightCm(event.target.value); addHistory(); });
$('#heightExact').addEventListener('input', (event) => {
  const value = event.target.valueAsNumber;
  if (Number.isFinite(value) && value >= 2.4 && value <= 100) setHeightCm(value, true);
});
$('#heightExact').addEventListener('change', (event) => {
  setHeightCm(event.target.value); event.target.value = (state.height * 10).toFixed(1); addHistory();
});
$('#thickness').addEventListener('input', (event) => {
  const requested = Number(event.target.value), maxFeasible = maxFeasibleWallMm();
  const millimeters = THREE.MathUtils.clamp(requested, 1, maxFeasible);
  if (millimeters !== requested) { event.target.value = millimeters; toast(t('toast.maxWall', { value: millimeters })); }
  state.thickness = millimeters / 100; $('#thicknessValue').textContent = `${millimeters} mm`; rebuildClay('light');
});
$('#thickness').addEventListener('change', () => { rebuildClay(); addHistory(); });
$('#pressure').addEventListener('change', addHistory); $('#influence').addEventListener('change', addHistory);
$('#speed').addEventListener('input', (event) => { rpm = Number(event.target.value); $('#speedValue').innerHTML = `${rpm} <small>RPM</small>`; if (!running && rpm > 0) setWheel(true); updateWheelText(); });
function updateWheelText() { $('#wheelStatus').textContent = `${t(running ? 'wheel.running' : 'wheel.paused')} · ${rpm} ${t('unit.rpm')}`; $('.status-light').classList.toggle('paused', !running); }
function setWheel(value) {
  running = value;
  const action = t(running ? 'wheel.pause' : 'wheel.resume');
  $('#wheelToggle').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-${running ? 'pause' : 'play'}" /></svg>`;
  $('#wheelToggle').setAttribute('aria-label', action); $('#wheelToggle').title = action;
  $('.wheel-icon').classList.toggle('spinning', running); updateWheelText();
}
$('#wheelToggle').addEventListener('click', () => setWheel(!running));
$('#undoButton').addEventListener('click', undo); $('#redoButton').addEventListener('click', redo);
const shortcutsDialog = $('#shortcutsDialog');
$('#shortcutsButton').addEventListener('click', () => shortcutsDialog.showModal());
$('#shortcutsClose').addEventListener('click', () => shortcutsDialog.close());
shortcutsDialog.addEventListener('click', (event) => { if (event.target === shortcutsDialog) shortcutsDialog.close(); });
document.addEventListener('keydown', (event) => {
  // H remains usable from the focused immersive exit button; other controls retain native keys.
  const immersiveButtonH = event.key.toLowerCase() === 'h' && event.target.closest?.('#immersiveToggle');
  const action = resolveShortcut(event, !immersiveButtonH && isShortcutBlockedTarget(event.target));
  if (!action) return;
  if (action.type === 'tool') { event.preventDefault(); setTool(action.tool); }
  else if (action.type === 'wheel') { event.preventDefault(); setWheel(!running); }
  else if (action.type === 'immersive') { event.preventDefault(); setImmersiveMode(!stage.classList.contains('immersive-mode')); }
  else if (action.type === 'undo') { event.preventDefault(); undo(); }
  else if (action.type === 'redo') { event.preventDefault(); redo(); }
  else if (action.type === 'temporary-smooth' && mode === 'model' && tool !== 'smooth') {
    shiftToolRestore = tool; setTool('smooth');
  }
});
document.addEventListener('keyup', (event) => {
  if (event.key !== 'Shift' || shiftToolRestore === null) return;
  const restoreTool = shiftToolRestore; shiftToolRestore = null;
  if (tool === 'smooth') setTool(restoreTool);
});
window.addEventListener('blur', () => {
  if (shiftToolRestore === null) return;
  const restoreTool = shiftToolRestore; shiftToolRestore = null;
  if (tool === 'smooth') setTool(restoreTool);
});
$('#resetButton').addEventListener('click', () => {
  const discardEdits = state.dirty;
  if (!canDiscard()) return;
  const shape = SHAPES.find((item) => item.id === state.shape);
  state.height = shape.height; state.verticalProfile = createVerticalProfile(state.height); state.cavity = shape.cavity; state.profile = createProfile(state.shape, state.presetVersion); setClayAppearance(); rebuildClay();
  scheduleCameraFrame();
  if (discardEdits) resetHistory({ pristine: true });
  else if (pristinePresetHistory) addHistory({ clean: true, edit: false });
  else addHistory();
});
$('#homeView').addEventListener('click', () => scheduleCameraFrame('perspective', true));
$('#cameraView').addEventListener('change', (event) => scheduleCameraFrame(event.target.value, true));

function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1200);
}
$('#saveProject').addEventListener('click', () => {
  download(JSON.stringify(snapshot(true), null, 2), 'torno-pieza.json', 'application/json');
  pristinePresetHistory = false; history.markClean(); state.dirty = false; updateHistoryButtons(); toast(t('toast.projectSaved'));
});
$('#loadProject').addEventListener('click', () => { if (canDiscard()) $('#projectFile').click(); });
$('#projectFile').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const validShape = SHAPES.some((shape) => shape.id === data.shape), validColor = CLAY_COLORS.some((color) => color.id === data.color);
    const profileValid = Array.isArray(data.profile) && data.profile.length === RINGS + 1 && data.profile.every((r) => Number.isFinite(r) && r >= 0.14 && r <= 1.85);
    if (![2, 3, 4].includes(data.version) || !validShape || !validColor || !profileValid || !Number.isFinite(data.height) || data.height < 0.24 || data.height > 10 || (data.verticalProfile !== undefined && !isValidVerticalProfile(data.verticalProfile, data.height)) || (data.heightLock !== undefined && typeof data.heightLock !== 'boolean') || (data.preserveVolume !== undefined && typeof data.preserveVolume !== 'boolean') || !Number.isFinite(data.thickness) || data.thickness < 0.01 || data.thickness > 0.32 || (data.imperfections !== undefined && (!Number.isFinite(data.imperfections) || data.imperfections < 0 || data.imperfections > 100))) throw new Error(t('error.invalidProject'));
    data.version = 4; data.imperfections = Number(data.imperfections ?? 50);
    data.cavity = THREE.MathUtils.clamp(Number(data.cavity), 0.12, 0.82); data.thickness = THREE.MathUtils.clamp(data.thickness, 0.01, 0.32);
    data.pressure = THREE.MathUtils.clamp(Number(data.pressure), 0.05, 1); data.influence = THREE.MathUtils.clamp(Number(data.influence), 0.01, 0.42);
    applySnapshot(data); resetHistory(); drawShapeCatalog(); toast(t('toast.pieceLoaded'));
  } catch { toast(t('error.openProject')); }
});

function exportMesh(scale = 1, resolution = state.exportResolution) {
  const exportScene = new THREE.Scene();
  const quality = resolutionSettings(resolution);
  const geometry = makeClayGeometry(state.profile, state.height, state.cavity, state.thickness, {
    ...quality, adaptive: state.adaptiveTopology, imperfections: state.imperfections, surfaceStyle: clayFinish(), verticalProfile: state.verticalProfile,
  });
  const mesh = new THREE.Mesh(geometry, clay.material.clone());
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.setScalar(scale); exportScene.add(mesh);
  exportScene.updateMatrixWorld(true); return { exportScene, mesh, geometry };
}
function validateCeramicMesh(geometry) {
  const position = geometry.getAttribute('position'), index = geometry.index;
  if (!index || index.count % 3) return { valid: false, reason: t('error.stl.index') };
  const vertexKey = (id) => `${Math.round(position.getX(id) * 1e5)},${Math.round(position.getY(id) * 1e5)},${Math.round(position.getZ(id) * 1e5)}`;
  const edges = new Map(), faces = new Set();
  let signedVolume = 0, degenerate = 0, duplicateFaces = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const keys = ids.map(vertexKey), faceKey = [...keys].sort().join('|');
    if (new Set(keys).size < 3) degenerate++;
    if (faces.has(faceKey)) duplicateFaces++; else faces.add(faceKey);
    const a = new THREE.Vector3().fromBufferAttribute(position, ids[0]);
    const b = new THREE.Vector3().fromBufferAttribute(position, ids[1]);
    const c = new THREE.Vector3().fromBufferAttribute(position, ids[2]);
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-16) degenerate++;
    signedVolume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    for (let side = 0; side < 3; side++) {
      const ka = keys[side], kb = keys[(side + 1) % 3];
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const edge = edges.get(key) || { count: 0, winding: 0 };
      edge.count++; edge.winding += ka < kb ? 1 : -1; edges.set(key, edge);
    }
  }
  const badEdges = [...edges.values()].filter((edge) => edge.count !== 2 || edge.winding !== 0).length;
  const minWall = Math.min(...state.profile.map((radius) => radius - Math.max(MIN_INNER_RADIUS, radius - state.thickness)));
  const maxFeasibleWall = Math.min(...state.profile.map((radius) => radius - MIN_INNER_RADIUS));
  const validProfile = state.profile.every((radius) => Number.isFinite(radius) && radius > state.thickness + MIN_INNER_RADIUS - 1e-6);
  // Allow only sub-micron float drift at the exact 1 mm wall limit.
  const validWall = minWall >= 0.01 - 1e-6 && state.thickness <= maxFeasibleWall + 1e-6;
  const valid = degenerate === 0 && duplicateFaces === 0 && badEdges === 0 && signedVolume > 1e-10 && validWall && validProfile && state.cavity * state.height > 0;
  return { valid, reason: valid ? '' : t('error.stl.stats', { degenerate, duplicate: duplicateFaces, edges: badEdges, wall: (minWall * 100).toFixed(2) }) };
}
$('#exportGlb').addEventListener('click', async () => {
  let exported;
  try { const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'); exported = exportMesh(); const result = await new GLTFExporter().parseAsync(exported.exportScene, { binary: true, onlyVisible: true }); download(result, 'torno-pieza.glb', 'model/gltf-binary'); toast(t('toast.exportGlb', { resolution: t(`resolution.${state.exportResolution}`) })); }
  catch (error) { console.error(error); toast(t('error.exportGlb')); }
  finally { exported?.geometry.dispose(); exported?.mesh.material.dispose(); }
});
$('#exportObj').addEventListener('click', async () => {
  let exported;
  try { const { exportOBJ } = await import('./obj-export.js'); exported = exportMesh(); download(exportOBJ(exported.mesh, { prioritizeQuads: state.prioritizeQuads }), 'torno-pieza.obj', 'text/plain'); toast(t('toast.exportObj', { resolution: t(`resolution.${state.exportResolution}`), quads: state.prioritizeQuads ? ' · quads' : '' })); }
  catch (error) { console.error(error); toast(t('error.exportObj')); }
  finally { exported?.geometry.dispose(); exported?.mesh.material.dispose(); }
});
$('#exportStl').addEventListener('click', () => {
  const exported = exportMesh(1, state.exportResolution);
  const validation = validateCeramicMesh(exported.geometry);
  if (!validation.valid) { exported.geometry.dispose(); exported.mesh.material.dispose(); toast(t('error.stl.validation', { reason: validation.reason })); return; }
  import('three/addons/exporters/STLExporter.js').then(({ STLExporter }) => {
    exported.mesh.scale.setScalar(100); exported.mesh.updateMatrix(); exported.exportScene.updateMatrixWorld(true);
    const result = new STLExporter().parse(exported.exportScene, { binary: true });
    download(result, 'torno-pieza.stl', 'model/stl'); toast(t('toast.exportStl', { resolution: t(`resolution.${state.exportResolution}`) }));
  }).catch(() => toast(t('error.exportStl'))).finally(() => { exported.geometry.dispose(); exported.mesh.material.dispose(); });
});
$('#capturePng').addEventListener('click', () => {
  const oldPixelRatio = renderer.getPixelRatio(), oldBackground = scene.background, oldFog = scene.fog;
  const oldClearColor = renderer.getClearColor(new THREE.Color()), oldClearAlpha = renderer.getClearAlpha();
  const oldSize = renderer.getSize(new THREE.Vector2()), oldAspect = camera.aspect;
  const localPosition = clay.position.clone(), localQuaternion = clay.quaternion.clone(), localScale = clay.scale.clone();
  const visibility = [];
  scene.updateMatrixWorld(true);
  scene.attach(clay);
  scene.traverse((object) => {
    visibility.push([object, object.visible]);
    object.visible = object === scene || object === clay || object.isLight === true;
  });
  const scale = Number($('#captureScale').value), width = Math.round(stage.clientWidth * scale), heightPx = Math.round(stage.clientHeight * scale);
  scene.background = null; scene.fog = null; renderer.setPixelRatio(1); renderer.setSize(width, heightPx, false);
  camera.aspect = width / heightPx; camera.updateProjectionMatrix();
  renderer.setClearColor(0x000000, 0); controls.update(); renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (blob) download(blob, 'torno-pieza.png', 'image/png');
    turntable.attach(clay); clay.position.copy(localPosition); clay.quaternion.copy(localQuaternion); clay.scale.copy(localScale);
    visibility.forEach(([object, visible]) => { object.visible = visible; });
    scene.background = oldBackground; scene.fog = oldFog; camera.aspect = oldAspect; camera.updateProjectionMatrix();
    renderer.setPixelRatio(oldPixelRatio); renderer.setSize(oldSize.x, oldSize.y, false); renderer.setClearColor(oldClearColor, oldClearAlpha);
    controls.update(); renderer.render(scene, camera);
    toast(blob ? t('toast.pngSaved') : t('error.png'));
  }, 'image/png');
});

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  if (!width || !height) return;
  camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  if (typeof scheduleCameraFrame === 'function') scheduleCameraFrame();
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
resize();
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), 0.05);
  if (running && rpm > 0) turntable.rotation.y += (rpm / 60) * Math.PI * 2 * dt;
  controls.update();
  if (cameraTransition) {
    const blend = 1 - Math.exp(-dt * 5.5);
    camera.position.lerp(cameraTransition.position, blend); controls.target.lerp(cameraTransition.target, blend);
    if (camera.position.distanceToSquared(cameraTransition.position) < 1e-5 && controls.target.distanceToSquared(cameraTransition.target) < 1e-5) {
      camera.position.copy(cameraTransition.position); controls.target.copy(cameraTransition.target); cameraTransition = null;
    }
    controls.update();
  }
  renderer.render(scene, camera);
}
scheduleCameraFrame('perspective');
animate();
