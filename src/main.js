import { Canvas, FabricImage, IText, Rect, Circle, Line, ActiveSelection } from 'fabric';
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
  canvas.setDimensions({ width: canvas.getWidth(), height: canvas.getHeight() });
  canvas.setZoom(zoom);
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
  return JSON.stringify({ version: 1, name: $('projectName').value, width: canvas.getWidth(), height: canvas.getHeight(), json: canvas.toJSON(['name', 'selectable', 'evented', 'lockMovementX', 'lockMovementY']) });
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
  const sizes = { poster: [1080, 1350], story: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080] };
  if (sizes[preset]) applyCanvasSize(...sizes[preset]);
});
$('applySize').addEventListener('click', () => applyCanvasSize(clamp($('canvasW').value, 100, 4000), clamp($('canvasH').value, 100, 4000)));
function applyCanvasSize(w, h) {
  canvas.setDimensions({ width: w, height: h }); $('canvasW').value = w; $('canvasH').value = h;
  setZoom(Math.min(zoom, 760 / w, 650 / h)); canvas.requestRenderAll(); scheduleHistory();
}
$('zoomRange').addEventListener('input', () => setZoom(Number($('zoomRange').value) / 100));
$('zoomOut').addEventListener('click', () => setZoom(zoom - .1)); $('zoomIn').addEventListener('click', () => setZoom(zoom + .1));
$('fitBtn').addEventListener('click', () => {
  const area = $('stageScroll'); setZoom(Math.min((area.clientWidth - 90) / canvas.getWidth(), (area.clientHeight - 70) / canvas.getHeight(), 1));
});
$('undoBtn').addEventListener('click', () => travelHistory(-1)); $('redoBtn').addEventListener('click', () => travelHistory(1));
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const editing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); travelHistory(e.shiftKey ? 1 : -1); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !editing) { e.preventDefault(); travelHistory(1); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !editing && active()) { e.preventDefault(); deleteActive(); }
  else if (e.key === 'Escape') { canvas.discardActiveObject(); canvas.requestRenderAll(); updateProperties(); }
});
$('saveBtn').addEventListener('click', () => {
  try {
    const blob = new Blob([snapshot()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `${safeFilename($('projectName').value)}.vposter.json`; a.click(); URL.revokeObjectURL(url);
    localStorage.setItem('vposter-last-project', snapshot()); toast('Proyek disimpan sebagai file JSON.');
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
window.addEventListener('resize', () => { if (window.innerWidth < 900) setZoom(Math.min(zoom, .55)); });
updateProjectName(); resizeStage(); pushHistory(); updateProperties();
setTimeout(() => $('fitBtn').click(), 60);

// Restore the last autosaved local draft, when available.
try {
  const draft = localStorage.getItem('vposter-last-project');
  if (draft) {
    const parsed = JSON.parse(draft);
    if (parsed?.json && confirm('Ditemukan proyek terakhir yang disimpan di browser. Mau memulihkannya?')) {
      restoreSnapshot(draft).then(() => { history = []; historyIndex = -1; pushHistory(); toast('Proyek dipulihkan.'); });
    }
  }
} catch { /* Ignore invalid local draft */ }
