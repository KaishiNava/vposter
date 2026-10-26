import { Canvas, FabricImage, IText, Rect, Circle, Line, ActiveSelection, filters } from 'fabric';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = new Canvas('posterCanvas', {
  width: 1080, height: 1350, backgroundColor: '#171727',
  preserveObjectStacking: true, selection: true,
});
let zoom = 0.6;
let history = [], historyIndex = -1, restoring = false, historyTimer;
let radiusValue = 0;
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const objects = () => canvas.getObjects();
const active = () => canvas.getActiveObject();
const isText = (o) => o && (o.type === 'i-text' || o.type === 'textbox' || o.type === 'text');
const isShape = (o) => o && (o.type === 'rect' || o.type === 'circle');
const nameOf = (o) => o?.name || (isText(o) ? 'Teks' : o?.type === 'image' ? 'Gambar' : o?.type === 'circle' ? 'Lingkaran' : o?.type === 'line' ? 'Garis' : 'Bentuk');
const toast = (msg) => {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 2400);
};
function resizeStage() {
  const wrap = $('stageWrap');
  wrap.style.width = `${canvas.getWidth() * zoom}px`;
  wrap.style.height = `${canvas.getHeight() * zoom}px`;
  // Keep the document in true pixel coordinates; scale only its displayed CSS size.
  canvas.setDimensions({ width: canvas.getWidth() * zoom, height: canvas.getHeight() * zoom }, { cssOnly: true });
  canvas.setZoom(1);
  canvas.calcOffset();
  $('zoomRange').value = Math.round(zoom * 100);
  $('zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
  $('canvasDimensions').textContent = `${canvas.getWidth()} × ${canvas.getHeight()} px`;
  $('footerDimensions').textContent = `${canvas.getWidth()} × ${canvas.getHeight()} px`;
}
function setZoom(value) { zoom = clamp(value, .25, 1); resizeStage(); }
function scheduleHistory() {
  if (restoring) return;
  clearTimeout(historyTimer);
  historyTimer = setTimeout(pushHistory, 180);
}
function snapshot() {
  return JSON.stringify({ version: 1, name: $('projectName').value, width: canvas.getWidth(), height: canvas.getHeight(), json: canvas.toJSON(['name', 'selectable', 'evented', 'lockMovementX', 'lockMovementY', 'vposterEffects']) });
}
function pushHistory() {
  if (restoring) return;
  const s = snapshot();
  if (history[historyIndex] === s) return;
  history = history.slice(0, historyIndex + 1);
  history.push(s);
  if (history.length > 50) history.shift();
  historyIndex = history.length - 1;
  updateUndoRedo();
  queueAutosave();
}
function updateUndoRedo() { $('undoBtn').disabled = historyIndex <= 0; $('redoBtn').disabled = historyIndex >= history.length - 1; }
async function restoreSnapshot(s) {
  if (!s) return;
  restoring = true;
  const data = JSON.parse(s);
  await canvas.loadFromJSON(data.json);
  canvas.setDimensions({ width: data.width, height: data.height });
  canvas.backgroundColor = data.json.background || '#171727';
  $('projectName').value = data.name || 'Poster Tanpa Judul';
  updateProjectName(); canvas.renderAll(); setZoom(zoom); refreshLayers(); updateProperties();
  restoring = false;
}
async function travelHistory(dir) {
  const next = historyIndex + dir;
  if (next < 0 || next >= history.length) return;
  historyIndex = next; await restoreSnapshot(history[historyIndex]); updateUndoRedo();
}
function updateProjectName() { $('crumbName').textContent = $('projectName').value || 'Poster Tanpa Judul'; document.title = `${$('projectName').value || 'VPoster Studio'} — VPoster Studio`; }
function addObject(obj, name) {
  obj.name = name; obj.set({ cornerStyle: 'circle', transparentCorners: false, cornerColor: '#a78bfa', borderColor: '#8b5cf6', padding: 3 });
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll(); refreshLayers(); updateProperties(); scheduleHistory();
}
function addText() {
  const t = new IText('Tulis teks di sini', { left: 140, top: 140, fontFamily: 'Arial', fontSize: 64, fill: '#ffffff', fontWeight: 'bold', shadow: 'rgba(0,0,0,0.25) 2px 3px 5px' });
  addObject(t, 'Teks baru'); t.enterEditing(); t.selectAll();
}
function addRect() { addObject(new Rect({ left: 180, top: 180, width: 300, height: 180, fill: '#8b5cf6', rx: 0, ry: 0, strokeWidth: 0 }), 'Bentuk kotak'); }
function addCircle() { addObject(new Circle({ left: 220, top: 220, radius: 90, fill: '#22d3ee', strokeWidth: 0 }), 'Lingkaran'); }
function addLine() { addObject(new Line([0, 0, 320, 0], { left: 180, top: 240, stroke: '#ffffff', strokeWidth: 8 }), 'Garis'); }
$('addText').addEventListener('click', addText);
$('addRect').addEventListener('click', addRect);
$('addCircle').addEventListener('click', addCircle);
$('addLine').addEventListener('click', addLine);

$('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Pilih file gambar yang valid.'); return; }
  try {
    const url = await readAsDataURL(file);
    const img = await FabricImage.fromURL(url);
    const maxW = canvas.getWidth() * .72, maxH = canvas.getHeight() * .72;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    img.set({ left: (canvas.getWidth() - img.width * scale) / 2, top: (canvas.getHeight() - img.height * scale) / 2, scaleX: scale, scaleY: scale });
    addObject(img, file.name.replace(/\.[^.]+$/, '') || 'Gambar');
    toast('Gambar berhasil ditambahkan.');
  } catch (err) { console.error(err); toast('Gagal membuka gambar ini.'); }
  e.target.value = '';
});
function readAsDataURL(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
}

function refreshLayers() {
  const list = $('layersList'), arr = objects().slice().reverse();
  $('layerCount').textContent = arr.length;
  if (!arr.length) { list.innerHTML = '<div class="empty-state">Belum ada elemen.<br>Tambahkan gambar atau teks dulu.</div>'; return; }
  list.innerHTML = '';
  arr.forEach((obj) => {
    const row = document.createElement('button'); row.className = `layer-item${active() === obj ? ' selected' : ''}`;
    const icon = isText(obj) ? 'T' : obj.type === 'image' ? '▧' : obj.type === 'circle' ? '●' : obj.type === 'line' ? '／' : '▰';
    const title = document.createElement('span'); title.className = 'layer-icon'; title.textContent = icon;
    const label = document.createElement('span'); label.className = 'layer-title'; label.textContent = obj.name || nameOf(obj);
    const lock = document.createElement('span'); lock.className = 'layer-lock'; lock.textContent = obj.lockMovementX ? '🔒' : '';
    row.append(title, label, lock);
    row.addEventListener('click', () => { canvas.setActiveObject(obj); canvas.requestRenderAll(); updateProperties(); refreshLayers(); });
    list.append(row);
  });
}
function updateProperties() {
  const obj = active(), valid = obj && !(obj instanceof ActiveSelection);
  $('noSelection').classList.toggle('hidden', !!valid);
  $('objectProperties').classList.toggle('hidden', !valid);
  if (!valid) { refreshLayers(); return; }
  $('objectType').textContent = nameOf(obj); $('objectMeta').textContent = `${Math.round(obj.getScaledWidth())} × ${Math.round(obj.getScaledHeight())} px`;
  $('objectTypeIcon').textContent = isText(obj) ? 'T' : obj.type === 'image' ? '▧' : obj.type === 'circle' ? '●' : '▰';
  $('propX').value = Math.round(obj.left || 0); $('propY').value = Math.round(obj.top || 0);
  $('propW').value = Math.round(obj.getScaledWidth()); $('propH').value = Math.round(obj.getScaledHeight());
  $('propAngle').value = Math.round(obj.angle || 0); $('rotationLabel').textContent = `${Math.round(obj.angle || 0)}°`;
  $('propOpacity').value = Math.round((obj.opacity ?? 1) * 100); $('opacityLabel').textContent = `${$('propOpacity').value}%`;
  $('textControls').classList.toggle('hidden', !isText(obj));
  $('shapeControls').classList.toggle('hidden', !isShape(obj));
  $('imageEffects').classList.toggle('hidden', obj.type !== 'image');
  if (obj.type === 'image') syncEffectControls(obj);
  if (isText(obj)) {
    $('propText').value = obj.text || ''; $('propFont').value = obj.fontFamily || 'Arial';
    $('propFontSize').value = obj.fontSize || 48; $('propFill').value = toHex(obj.fill) || '#ffffff';
    $('propStroke').value = toHex(obj.stroke) || '#000000'; $('propStrokeWidth').value = obj.strokeWidth || 0;
    $('boldBtn').classList.toggle('on', obj.fontWeight === 'bold'); $('italicBtn').classList.toggle('on', obj.fontStyle === 'italic');
    $('alignBtn').textContent = `⇤ ${obj.textAlign || 'left'}`;
  }
  if (isShape(obj)) { $('propShapeFill').value = toHex(obj.fill) || '#8b5cf6'; $('propRadius').value = obj.rx || 0; }
  refreshLayers();
}
function toHex(color) {
  if (typeof color !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const m = color.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  return m ? '#' + m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('') : null;
}
function modifyObj(fn) { const o = active(); if (!o) return; fn(o); o.setCoords(); canvas.requestRenderAll(); updateProperties(); scheduleHistory(); }
function bindNum(id, prop, min = -100000, max = 100000) {
  $(id).addEventListener('change', () => modifyObj(o => {
    const v = clamp($(id).value, min, max);
    if (prop === 'scaleX') o.set('scaleX', v / Math.max(o.width || 1, 1));
    else if (prop === 'scaleY') o.set('scaleY', v / Math.max(o.height || 1, 1));
    else o.set(prop, v);
  }));
}
bindNum('propX', 'left'); bindNum('propY', 'top');
$('propW').addEventListener('change', () => modifyObj(o => { o.scaleX = clamp($('propW').value, 1, 10000) / Math.max(o.width, 1); }));
$('propH').addEventListener('change', () => modifyObj(o => { o.scaleY = clamp($('propH').value, 1, 10000) / Math.max(o.height, 1); }));
$('propAngle').addEventListener('input', () => { const o = active(); if (!o) return; o.rotate(Number($('propAngle').value)); $('rotationLabel').textContent = `${$('propAngle').value}°`; canvas.requestRenderAll(); });
$('propAngle').addEventListener('change', scheduleHistory);
$('propOpacity').addEventListener('input', () => { const o = active(); if (!o) return; o.set('opacity', Number($('propOpacity').value) / 100); $('opacityLabel').textContent = `${$('propOpacity').value}%`; canvas.requestRenderAll(); });
$('propOpacity').addEventListener('change', scheduleHistory);
$('propText').addEventListener('input', () => modifyObj(o => { if (isText(o)) o.set('text', $('propText').value); }));
$('propFont').addEventListener('change', () => modifyObj(o => { if (isText(o)) o.set('fontFamily', $('propFont').value); }));
$('propFontSize').addEventListener('change', () => modifyObj(o => { if (isText(o)) o.set('fontSize', clamp($('propFontSize').value, 6, 300)); }));
$('propFill').addEventListener('input', () => modifyObj(o => { if (isText(o)) o.set('fill', $('propFill').value); }));
$('propStroke').addEventListener('input', () => modifyObj(o => { if (isText(o)) o.set('stroke', $('propStroke').value); }));
$('propStrokeWidth').addEventListener('change', () => modifyObj(o => { if (isText(o)) o.set('strokeWidth', clamp($('propStrokeWidth').value, 0, 20)); }));
$('boldBtn').addEventListener('click', () => modifyObj(o => { if (isText(o)) o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold'); }));
$('italicBtn').addEventListener('click', () => modifyObj(o => { if (isText(o)) o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic'); }));
$('alignBtn').addEventListener('click', () => modifyObj(o => { if (isText(o)) { const opts = ['left', 'center', 'right']; o.set('textAlign', opts[(opts.indexOf(o.textAlign) + 1) % opts.length]); } }));
$('propShapeFill').addEventListener('input', () => modifyObj(o => { if (isShape(o)) o.set('fill', $('propShapeFill').value); }));
$('propRadius').addEventListener('input', () => modifyObj(o => { if (o.type === 'rect') o.set({ rx: Number($('propRadius').value), ry: Number($('propRadius').value) }); }));
$('duplicateObj').addEventListener('click', async () => { const o = active(); if (!o) return; const clone = await o.clone(['name']); clone.set({ left: (o.left || 0) + 24, top: (o.top || 0) + 24 }); clone.name = `${o.name || nameOf(o)} copy`; addObject(clone, clone.name); toast('Objek berhasil diduplikat.'); });
$('centerObj').addEventListener('click', () => modifyObj(o => { o.set({ left: (canvas.getWidth() - o.getScaledWidth()) / 2, top: (canvas.getHeight() - o.getScaledHeight()) / 2 }); }));
$('flipObj').addEventListener('click', () => modifyObj(o => o.set('flipX', !o.flipX)));
function deleteActive() { const o = active(); if (!o) return; if (o instanceof ActiveSelection) o.getObjects().forEach(x => canvas.remove(x)); else canvas.remove(o); canvas.discardActiveObject(); canvas.requestRenderAll(); updateProperties(); scheduleHistory(); }
$('deleteObj').addEventListener('click', deleteActive); $('deleteLayer').addEventListener('click', deleteActive);
$('layerUp').addEventListener('click', () => modifyObj(o => canvas.bringObjectForward(o)));
$('layerDown').addEventListener('click', () => modifyObj(o => canvas.sendObjectBackwards(o)));
$('toggleLock').addEventListener('click', () => modifyObj(o => { const locked = !o.lockMovementX; o.set({ lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked, selectable: !locked, evented: !locked }); }));
canvas.on('selection:created', updateProperties); canvas.on('selection:updated', updateProperties); canvas.on('selection:cleared', updateProperties);
canvas.on('object:modified', () => { updateProperties(); scheduleHistory(); });
canvas.on('object:added', () => { refreshLayers(); scheduleHistory(); });
canvas.on('object:removed', () => { refreshLayers(); scheduleHistory(); });
canvas.on('text:changed', () => scheduleHistory());
$('bgColor').addEventListener('input', () => { canvas.backgroundColor = $('bgColor').value; $('bgHex').textContent = $('bgColor').value.toUpperCase(); canvas.requestRenderAll(); });
$('bgColor').addEventListener('change', scheduleHistory);
$('clearCanvas').addEventListener('click', () => { if (!confirm('Hapus semua elemen dari kanvas?')) return; canvas.getObjects().slice().forEach(o => canvas.remove(o)); canvas.discardActiveObject(); canvas.backgroundColor = $('bgColor').value; canvas.requestRenderAll(); updateProperties(); scheduleHistory(); toast('Kanvas dibersihkan.'); });
$('projectName').addEventListener('input', updateProjectName);
document.querySelectorAll('.tool[data-panel]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tool[data-panel]').forEach(b => b.classList.toggle('active', b === btn));
  ['add', 'layers', 'canvas'].forEach(p => $(`panel-${p}`).classList.toggle('hidden', p !== btn.dataset.panel));
}));
$('sizePreset').addEventListener('change', () => {
  const preset = $('sizePreset').value; $('customSize').classList.toggle('hidden', preset !== 'custom');
  const sizes = { poster: [1080, 1350], a4p: [2480, 3508], a4l: [3508, 2480], a3p: [3508, 4961], a5p: [1748, 2480], letter: [2550, 3300], story: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080] };
  if (sizes[preset]) applyCanvasSize(...sizes[preset]);
});
$('applySize').addEventListener('click', () => applyCanvasSize(clamp($('canvasW').value, 100, 4000), clamp($('canvasH').value, 100, 4000)));
function applyCanvasSize(w, h) {
  canvas.setDimensions({ width: w, height: h }); $('canvasW').value = w; $('canvasH').value = h;
  const area = $('stageScroll'); setZoom(Math.min(zoom, (area.clientWidth - 36) / w, (area.clientHeight - 36) / h, 1)); canvas.requestRenderAll(); scheduleHistory();
}
$('zoomRange').addEventListener('input', () => setZoom(Number($('zoomRange').value) / 100));
$('zoomOut').addEventListener('click', () => setZoom(zoom - .1)); $('zoomIn').addEventListener('click', () => setZoom(zoom + .1));
function fitCanvasToWorkspace() {
  const area = $('stageScroll');
  if (!area || !area.clientWidth || !area.clientHeight) return;
  if (window.innerWidth <= 900) {
    // Keep a compact, app-like canvas on phones, leaving room for tools and property sheets.
    const byWidth = (area.clientWidth * 0.55) / canvas.getWidth();
    const byHeight = (area.clientHeight * 0.48) / canvas.getHeight();
    setZoom(Math.min(0.36, byWidth, byHeight));
  } else {
    setZoom(Math.min((area.clientWidth - 90) / canvas.getWidth(), (area.clientHeight - 70) / canvas.getHeight(), 1));
  }
}
$('fitBtn').addEventListener('click', fitCanvasToWorkspace);
// Pan/hand tool: drag the workspace with the toggle or hold Space; middle mouse also works.
let panMode = false, panning = false, panStart = null, spaceHeld = false;
const stageScroll = $('stageScroll');
$('panBtn').addEventListener('click', () => { panMode = !panMode; $('panBtn').classList.toggle('on', panMode); stageScroll.classList.toggle('pan-mode', panMode); toast(panMode ? 'Mode geser aktif — tarik area kerja.' : 'Mode geser nonaktif.'); });
stageScroll.addEventListener('pointerdown', e => {
  if (!(panMode || spaceHeld || e.button === 1)) return;
  panning = true; panStart = { x: e.clientX, y: e.clientY, left: stageScroll.scrollLeft, top: stageScroll.scrollTop };
  stageScroll.classList.add('panning'); stageScroll.setPointerCapture?.(e.pointerId); e.preventDefault();
});
stageScroll.addEventListener('pointermove', e => { if (!panning || !panStart) return; stageScroll.scrollLeft = panStart.left - (e.clientX - panStart.x); stageScroll.scrollTop = panStart.top - (e.clientY - panStart.y); });
const stopPan = () => { panning = false; panStart = null; stageScroll.classList.remove('panning'); };
stageScroll.addEventListener('pointerup', stopPan); stageScroll.addEventListener('pointercancel', stopPan);

$('undoBtn').addEventListener('click', () => travelHistory(-1)); $('redoBtn').addEventListener('click', () => travelHistory(1));
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const editing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); travelHistory(e.shiftKey ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !editing) { e.preventDefault(); travelHistory(1); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !editing && active()) { e.preventDefault(); deleteActive(); }
  else if (e.code === 'Space' && !editing) { spaceHeld = true; stageScroll.classList.add('pan-mode'); e.preventDefault(); }
  else if (e.key === 'Escape') { canvas.discardActiveObject(); canvas.requestRenderAll(); updateProperties(); }
});
document.addEventListener('keyup', e => { if (e.code === 'Space') { spaceHeld = false; if (!panMode) stageScroll.classList.remove('pan-mode'); stopPan(); } });

const effectDefaults = { blur: 0, brightness: 0, contrast: 0, saturation: 0, grayscale: false, sepia: false, glow: 0 };
function getEffectValues(obj) { return { ...effectDefaults, ...(obj.vposterEffects || {}) }; }
function syncEffectControls(obj) {
  const v = getEffectValues(obj);
  ['blur','brightness','contrast','saturation'].forEach(k => { $(`effect${k[0].toUpperCase()}${k.slice(1)}`).value = v[k]; $(`${k}Label`).textContent = Number(v[k]).toFixed(2); });
  $('effectGlow').value = v.glow || 0; $('glowLabel').textContent = String(v.glow || 0);
  $('effectGrayscale').classList.toggle('on', v.grayscale); $('effectSepia').classList.toggle('on', v.sepia);
}
function applyImageEffects(patch = {}, reset = false) {
  const obj = active(); if (!obj || obj.type !== 'image') return;
  const values = reset ? { ...effectDefaults } : { ...getEffectValues(obj), ...patch };
  const f = [];
  if (values.blur > 0) f.push(new filters.Blur({ blur: Number(values.blur) }));
  if (values.brightness !== 0) f.push(new filters.Brightness({ brightness: Number(values.brightness) }));
  if (values.contrast !== 0) f.push(new filters.Contrast({ contrast: Number(values.contrast) }));
  if (values.saturation !== 0) f.push(new filters.Saturation({ saturation: Number(values.saturation) }));
  if (values.grayscale) f.push(new filters.Grayscale());
  if (values.sepia) f.push(new filters.Sepia());
  obj.vposterEffects = values; obj.filters = f; obj.applyFilters();
  obj.set('shadow', values.glow > 0 ? `rgba(167,139,250,0.9) 0px 0px ${Number(values.glow)}px` : null);
  canvas.requestRenderAll(); syncEffectControls(obj); scheduleHistory();
}
['blur','brightness','contrast','saturation'].forEach(k => $(`effect${k[0].toUpperCase()}${k.slice(1)}`).addEventListener('input', e => applyImageEffects({ [k]: Number(e.target.value) })));
$('effectGlow').addEventListener('input', e => applyImageEffects({ glow: Number(e.target.value) }));
$('effectPreset').addEventListener('change', e => {
  const presets = {
    none: { blur: 0, brightness: 0, contrast: 0, saturation: 0, grayscale: false, sepia: false, glow: 0 },
    soft: { blur: .18, brightness: .04, contrast: .02, saturation: -.08, grayscale: false, sepia: false, glow: 0 },
    dream: { blur: .08, brightness: .12, contrast: -.08, saturation: .12, grayscale: false, sepia: false, glow: 20 },
    bright: { blur: 0, brightness: .2, contrast: .08, saturation: .12, grayscale: false, sepia: false, glow: 12 },
    cinema: { blur: 0, brightness: -.04, contrast: .24, saturation: -.18, grayscale: false, sepia: false, glow: 0 },
    vivid: { blur: 0, brightness: .03, contrast: .18, saturation: .55, grayscale: false, sepia: false, glow: 0 },
    mono: { blur: 0, brightness: 0, contrast: .1, saturation: 0, grayscale: true, sepia: false, glow: 0 },
    vintage: { blur: .02, brightness: .06, contrast: -.08, saturation: -.35, grayscale: false, sepia: true, glow: 0 },
    frost: { blur: .12, brightness: .16, contrast: -.12, saturation: -.15, grayscale: false, sepia: false, glow: 8 }
  };
  applyImageEffects(presets[e.target.value] || presets.none);
});
$('effectGrayscale').addEventListener('click', () => { const o = active(); if (o?.type === 'image') applyImageEffects({ grayscale: !getEffectValues(o).grayscale }); });
$('effectSepia').addEventListener('click', () => { const o = active(); if (o?.type === 'image') applyImageEffects({ sepia: !getEffectValues(o).sepia }); });
$('resetEffects').addEventListener('click', () => applyImageEffects({}, true));

// Project library uses IndexedDB so projects and embedded image data survive reloads.
const DB_NAME = 'vposter-studio-db';
const DB_VERSION = 1;
let dbPromise;
function openProjectDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}
async function dbGetAll() {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('projects', 'readonly').objectStore('projects').getAll();
    req.onsuccess = () => resolve((req.result || []).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(entry) {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openProjectDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').delete(id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
async function migrateLegacyProjects() {
  try {
    const existing = await dbGetAll();
    if (existing.length) return;
    const old = JSON.parse(localStorage.getItem('vposter-projects') || '[]');
    for (const p of old) if (p?.id && p?.data) await dbPut(p);
    const draft = localStorage.getItem('vposter-last-project');
    if (!old.length && draft) {
      const parsed = JSON.parse(draft);
      if (parsed?.json) await dbPut({ id: `vp-migrated-${Date.now()}`, name: parsed.name || 'Proyek dipulihkan', updatedAt: new Date().toISOString(), data: draft });
    }
  } catch (err) { console.warn('Migrasi penyimpanan lama dilewati', err); }
}
let autosaveTimer;
async function saveCurrentProject(showToast = true) {
  try {
    const data = snapshot(), name = $('projectName').value.trim() || 'Poster Tanpa Judul';
    const id = window.vposterCurrentProjectId || `vp-${Date.now()}`;
    window.vposterCurrentProjectId = id;
    let thumbnail = '';
    try { thumbnail = canvas.toDataURL({ format: 'jpeg', quality: .55, multiplier: Math.min(.18, 220 / canvas.getWidth()) }); } catch {}
    const entry = { id, name, updatedAt: new Date().toISOString(), data, thumbnail, width: canvas.getWidth(), height: canvas.getHeight() };
    await dbPut(entry);
    if (showToast) toast('Proyek tersimpan di IndexedDB.');
    renderDashboardProjects().catch(console.error);
    return entry;
  } catch (err) {
    console.error(err); toast('Penyimpanan gagal. Periksa ruang penyimpanan browser.');
  }
}
function queueAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (window.vposterCurrentProjectId && !$('dashboard').classList.contains('visible')) saveCurrentProject(false);
  }, 900);
}
function showDashboard() {
  $('dashboard').classList.add('visible');
  document.querySelector('.topbar').classList.add('dashboard-underlay');
  document.querySelector('.layout').classList.add('dashboard-underlay');
  $('dashboard').setAttribute('aria-hidden', 'false');
  renderDashboardProjects().catch(err => { console.error(err); $('dashboardProjects').innerHTML = '<div class="dashboard-empty">Penyimpanan tidak tersedia di mode privat browser ini.</div>'; });
}
function showEditor() {
  $('dashboard').classList.remove('visible');
  document.querySelector('.topbar').classList.remove('dashboard-underlay');
  document.querySelector('.layout').classList.remove('dashboard-underlay');
  $('dashboard').setAttribute('aria-hidden', 'true');
  setTimeout(() => { resizeStage(); fitCanvasToWorkspace(); canvas.requestRenderAll(); }, 40);
}
function createBlankProject(name = 'Poster Baru') {
  canvas.clear(); canvas.setDimensions({ width: 1080, height: 1350 });
  canvas.backgroundColor = '#171727'; $('bgColor').value = '#171727'; $('bgHex').textContent = '#171727';
  $('projectName').value = name; window.vposterCurrentProjectId = `vp-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  updateProjectName(); canvas.requestRenderAll(); updateProperties(); history = []; historyIndex = -1; pushHistory(); showEditor();
}
async function openProjectEntry(p) {
  await restoreSnapshot(p.data); window.vposterCurrentProjectId = p.id;
  history = []; historyIndex = -1; pushHistory(); showEditor(); toast('Proyek dibuka dari IndexedDB.');
}
async function renderDashboardProjects() {
  const grid = $('dashboardProjects'); if (!grid) return;
  const projects = await dbGetAll(); grid.innerHTML = '';
  if (!projects.length) { grid.innerHTML = '<div class="dashboard-empty"><span>✦</span><b>Belum ada proyek</b><small>Tekan “Proyek baru” atau mulai dari foto untuk membuat desain pertama.</small></div>'; return; }
  projects.forEach(p => {
    const card = document.createElement('article'); card.className = 'dashboard-project-card';
    const open = document.createElement('button'); open.className = 'dashboard-project-open';
    const preview = document.createElement('div'); preview.className = 'dashboard-project-preview';
    if (p.thumbnail) { const img = document.createElement('img'); img.src = p.thumbnail; img.alt = ''; preview.append(img); }
    else { preview.innerHTML = '<span>V</span>'; }
    const info = document.createElement('div'); info.className = 'dashboard-project-info';
    const title = document.createElement('b'); title.textContent = p.name || 'Poster Tanpa Judul';
    const meta = document.createElement('small'); meta.textContent = `${p.width || 1080} × ${p.height || 1350} · ${new Date(p.updatedAt).toLocaleDateString('id-ID')}`;
    info.append(title, meta); open.append(preview, info); open.addEventListener('click', () => openProjectEntry(p).catch(err => { console.error(err); toast('Proyek gagal dibuka.'); }));
    const actions = document.createElement('div'); actions.className = 'dashboard-card-actions';
    const rename = document.createElement('button'); rename.textContent = '•••'; rename.title = 'Ganti nama atau hapus';
    rename.addEventListener('click', async () => {
      const action = prompt(`Proyek: ${p.name}\nKetik nama baru, atau HAPUS untuk menghapus proyek ini.`);
      if (action === null) return;
      if (action.trim().toUpperCase() === 'HAPUS') { if (confirm(`Hapus proyek “${p.name}” secara permanen dari penyimpanan lokal?`)) { await dbDelete(p.id); renderDashboardProjects(); } return; }
      if (action.trim()) { p.name = action.trim(); p.updatedAt = new Date().toISOString(); await dbPut(p); renderDashboardProjects(); }
    });
    actions.append(rename); card.append(open, actions); grid.append(card);
  });
}
async function renderSavedProjects() {
  const list = $('savedProjects'), projects = await dbGetAll(); list.innerHTML = '';
  if (!projects.length) { list.innerHTML = '<div class="empty-state">Belum ada proyek tersimpan.<br>Buat proyek baru untuk mulai.</div>'; return; }
  projects.forEach(p => {
    const row = document.createElement('div'); row.className = 'saved-project-row';
    const info = document.createElement('button'); info.className = 'saved-project-open';
    const title = document.createElement('b'); title.textContent = p.name || 'Poster Tanpa Judul';
    const date = document.createElement('small'); date.textContent = `Diperbarui ${new Date(p.updatedAt).toLocaleDateString('id-ID')}`;
    info.append(title, date); info.addEventListener('click', async () => { await openProjectEntry(p); $('projectsModal').classList.add('hidden'); });
    const del = document.createElement('button'); del.className = 'project-delete'; del.textContent = '×'; del.title = 'Hapus proyek'; del.addEventListener('click', async () => { if (!confirm(`Hapus proyek “${p.name}”?`)) return; await dbDelete(p.id); renderSavedProjects(); renderDashboardProjects(); });
    row.append(info, del); list.append(row);
  });
}
$('dashboardNew').addEventListener('click', () => createBlankProject());
$('projectsBtn').addEventListener('click', () => { renderSavedProjects().catch(console.error); $('projectsModal').classList.remove('hidden'); });
$('closeProjects').addEventListener('click', () => $('projectsModal').classList.add('hidden'));
$('projectsModal').addEventListener('click', e => { if (e.target === $('projectsModal')) $('projectsModal').classList.add('hidden'); });
$('newProject').addEventListener('click', () => { $('projectsModal').classList.add('hidden'); createBlankProject(); });
$('dashboardImageInput').addEventListener('change', async e => {
  const file = e.target.files?.[0]; if (!file) return;
  try {
    createBlankProject(file.name.replace(/\.[^.]+$/, '') || 'Poster dari Foto');
    const url = await readAsDataURL(file); const img = await FabricImage.fromURL(url);
    const scale = Math.min(canvas.getWidth() * .88 / img.width, canvas.getHeight() * .88 / img.height, 1);
    img.set({ left: (canvas.getWidth() - img.width * scale) / 2, top: (canvas.getHeight() - img.height * scale) / 2, scaleX: scale, scaleY: scale });
    addObject(img, file.name.replace(/\.[^.]+$/, '') || 'Foto'); saveCurrentProject(false); toast('Foto dimasukkan ke proyek baru.');
  } catch (err) { console.error(err); toast('Foto tidak dapat dibuka.'); }
  e.target.value = '';
});
$('saveBtn').addEventListener('click', async () => {
  try {
    const blob = new Blob([snapshot()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${safeFilename($('projectName').value)}.vposter.json`; a.click(); URL.revokeObjectURL(url);
    await saveCurrentProject(false); toast('Proyek disimpan sebagai file JSON dan IndexedDB.');
  } catch (err) { console.error(err); toast('Tidak bisa menyimpan proyek. Coba kurangi ukuran gambar.'); }
});
function safeFilename(s) { return (s || 'poster-vposter').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'poster-vposter'; }
$('exportBtn').addEventListener('click', () => { $('exportName').value = safeFilename($('projectName').value); $('exportModal').classList.remove('hidden'); });
$('closeModal').addEventListener('click', () => $('exportModal').classList.add('hidden'));
$('exportModal').addEventListener('click', e => { if (e.target === $('exportModal')) $('exportModal').classList.add('hidden'); });
$('downloadExport').addEventListener('click', () => {
  const format = $('exportFormat').value, name = safeFilename($('exportName').value);
  canvas.discardActiveObject(); canvas.requestRenderAll();
  const oldZoom = canvas.getZoom(); canvas.setZoom(1);
  const dataURL = canvas.toDataURL({ format: format === 'jpeg' ? 'jpeg' : 'png', multiplier: 1, quality: .95 });
  canvas.setZoom(oldZoom); canvas.requestRenderAll();
  const a = document.createElement('a'); a.href = dataURL; a.download = `${name}.${format === 'jpeg' ? 'jpg' : 'png'}`; a.click();
  $('exportModal').classList.add('hidden'); toast('Export selesai. Cek folder Download kamu.');
});
// Compact Move & Transform controls inspired by mobile graphics editors.
let transformMode = 'move';
document.querySelectorAll('[data-transform-mode]').forEach(btn => btn.addEventListener('click', () => {
  transformMode = btn.dataset.transformMode;
  document.querySelectorAll('[data-transform-mode]').forEach(b => b.classList.toggle('active', b === btn));
  ['Move','Scale','Rotate','Skew'].forEach((label, i) => $('transform'+label).classList.toggle('hidden', ['move','scale','rotate','skew'][i] !== transformMode));
}));
document.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => {
  const o = active(); if (!o) return; const step = 10;
  const d = { up:[0,-step], down:[0,step], left:[-step,0], right:[step,0] }[btn.dataset.move];
  modifyObj(x => x.set({ left:(x.left||0)+d[0], top:(x.top||0)+d[1] }));
}));
$('transformScaleRange').addEventListener('input', e => { const o=active(); if(!o)return; const ratio=Number(e.target.value)/100; o.set({scaleX:ratio,scaleY:ratio}); $('transformScaleLabel').textContent=`${e.target.value}%`; o.setCoords(); canvas.requestRenderAll(); updateProperties(); });
$('transformScaleRange').addEventListener('change', scheduleHistory);
$('transformRotateRange').addEventListener('input', e => { const o=active(); if(!o)return; o.rotate(Number(e.target.value)); $('transformRotateLabel').textContent=`${e.target.value}°`; $('propAngle').value=e.target.value; $('rotationLabel').textContent=`${e.target.value}°`; o.setCoords(); canvas.requestRenderAll(); });
$('transformRotateRange').addEventListener('change', scheduleHistory);
$('transformSkewX').addEventListener('change', e => modifyObj(o => o.set('skewX', clamp(e.target.value,-60,60))));
$('transformSkewY').addEventListener('change', e => modifyObj(o => o.set('skewY', clamp(e.target.value,-60,60))));
$('transformZoomOut').addEventListener('click', () => setZoom(zoom-.1)); $('transformZoomIn').addEventListener('click', () => setZoom(zoom+.1));
$('deleteSelectedQuick').addEventListener('click', deleteActive);
$('projectName').addEventListener('change', () => { updateProjectName(); queueAutosave(); });
window.addEventListener('resize', () => { if (window.innerWidth <= 900) fitCanvasToWorkspace(); });
function closeMobilePanels() {
  $('sidebar').classList.remove('mobile-open'); $('properties').classList.remove('mobile-open');
  $('mobileBackdrop').classList.remove('show');
}
function openMobilePanel(which) {
  if (window.innerWidth > 900) return;
  closeMobilePanels();
  if (which === 'properties') $('properties').classList.add('mobile-open');
  else {
    $('sidebar').classList.add('mobile-open');
    document.querySelectorAll('.tool[data-panel]').forEach(b => b.classList.toggle('active', b.dataset.panel === which));
    ['add','layers','canvas'].forEach(p => $(`panel-${p}`).classList.toggle('hidden', p !== which));
  }
  $('mobileBackdrop').classList.add('show');
}
document.querySelectorAll('[data-mobile]').forEach(btn => btn.addEventListener('click', () => openMobilePanel(btn.dataset.mobile)));
$('mobileBackdrop').addEventListener('click', closeMobilePanels);
canvas.on('selection:created', () => { updateProperties(); if (window.innerWidth <= 900) openMobilePanel('properties'); });
canvas.on('selection:updated', () => { updateProperties(); if (window.innerWidth <= 900) openMobilePanel('properties'); });
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMobilePanels(); else fitCanvasToWorkspace(); });

updateProjectName(); resizeStage(); pushHistory(); updateProperties();
setTimeout(() => fitCanvasToWorkspace(), 100);
// Start at the project dashboard and migrate older localStorage projects when present.
(async () => {
  try { await migrateLegacyProjects(); showDashboard(); }
  catch (err) { console.error(err); showDashboard(); }
})();
