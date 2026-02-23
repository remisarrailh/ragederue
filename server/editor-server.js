'use strict';
/**
 * editor-server.js — Serveur HTTP de persistance pour l'éditeur de niveaux.
 *
 * Port : 9001 (configurable via EDITOR_PORT)
 *
 * Routes :
 *   GET  /levels        → renvoie le tableau LEVELS en JSON
 *   POST /levels        → écrit chaque niveau dans son propre fichier
 *                         et régénère js/config/levels.js (agrégateur)
 *   GET  /assets        → liste les assets de assets/Stage Layers/
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const PORT        = parseInt(process.env.EDITOR_PORT ?? '9001', 10);
const ROOT        = path.join(__dirname, '..');
const LEVELS_DIR  = path.join(ROOT, 'js', 'config', 'levels');
const LEVELS_MAIN = path.join(ROOT, 'js', 'config', 'levels.js');
const ASSETS_ROOT = path.join(ROOT, 'assets', 'Stage Layers');

// ── Lecture ────────────────────────────────────────────────────────────────

/**
 * Lit un fichier de niveau individuel (export default { ... }).
 *
 * IMPORTANT : vm.runInNewContext n'expose PAS les variables `const`/`let`
 * sur l'objet contexte — il faut absolument utiliser `var`.
 */
function readOneLevelFile(filePath) {
  try {
    const src     = fs.readFileSync(filePath, 'utf8');
    // Supprime le commentaire de bloc en tête, puis remplace `export default`
    // par `var _level =` (var est nécessaire pour être visible sur ctx)
    const cleaned = src
      .replace(/^\/\*[\s\S]*?\*\/\s*/m, '')   // strip leading block comment
      .replace(/^export default\s+/m, 'var _level = ');
    const ctx = {};
    vm.runInNewContext(cleaned, ctx);
    if (!ctx._level || !ctx._level.id) {
      console.warn(`[EditorServer] Fichier ignoré (pas de niveau valide) : ${filePath}`);
      return null;
    }
    return ctx._level;
  } catch (e) {
    console.error(`[EditorServer] Erreur lecture ${filePath} :`, e.message);
    return null;
  }
}

/** Lit tous les niveaux dans LEVELS_DIR (ordre alphabétique par nom de fichier) */
function readAllLevels() {
  if (!fs.existsSync(LEVELS_DIR)) return [];
  const files = fs.readdirSync(LEVELS_DIR)
    .filter(f => f.endsWith('.js'))
    .sort();
  return files
    .map(f => readOneLevelFile(path.join(LEVELS_DIR, f)))
    .filter(Boolean);  // retire les null (fichiers non parsables)
}

// ── Génération de code ────────────────────────────────────────────────────

function generateOneLevelJs(level) {
  const lines = [];
  lines.push(`/** ${level.id}.js — ${level.name} */`);
  lines.push('export default {');
  lines.push(`  id: '${level.id}',`);
  lines.push(`  name: '${level.name}',`);
  lines.push(`  worldW: ${level.worldW ?? 3840},`);
  lines.push(`  parallax: { bg: ${level.parallax?.bg ?? 0.06}, mid: ${level.parallax?.mid ?? 0.25} },`);
  if (level.background)        lines.push(`  background: '${level.background}',`);
  if (level.laneTop    != null) lines.push(`  laneTop: ${level.laneTop},`);
  if (level.laneBottom != null) lines.push(`  laneBottom: ${level.laneBottom},`);
  if (level.spawnX != null) lines.push(`  spawnX: ${level.spawnX},`);
  lines.push('  props: [');
  for (const p of (level.props ?? [])) {
    const blockStr = p.blocksPlayer ? ', blocksPlayer: true' : '';
    lines.push(`    { type: '${p.type}', x: ${p.x}, y: ${p.y}, scale: ${p.scale ?? 1}${blockStr} },`);
  }
  lines.push('  ],');
  lines.push('  containers: [');
  for (const c of (level.containers ?? []))
    lines.push(`    { x: ${c.x}, y: ${c.y}, texture: '${c.texture ?? 'barrel'}' },`);
  lines.push('  ],');
  lines.push('  transitZones: [');
  for (const z of (level.transitZones ?? [])) {
    const tgt  = z.targetLevel ? `'${z.targetLevel}'` : 'null';
    const yStr = (z.y      != null) ? `, y: ${z.y}` : '';
    const hStr = (z.height != null) ? `, height: ${z.height}` : '';
    lines.push(`    { id: '${z.id}', type: '${z.type}', x: ${z.x}${yStr}, width: ${z.width ?? 120}${hStr}, targetLevel: ${tgt}, label: '${z.label ?? ''}' },`);
  }
  lines.push('  ],');
  lines.push('};');
  return lines.join('\n') + '\n';
}

function generateAggregatorJs(levelIds) {
  const lines = [];
  lines.push('/**');
  lines.push(' * levels.js — Agrégateur auto-généré par le serveur éditeur.');
  lines.push(' *');
  lines.push(' * NE PAS MODIFIER MANUELLEMENT : éditer via l\'éditeur (touche L)');
  lines.push(' * puis cliquer [ SAVE ].');
  lines.push(' */');
  lines.push('');
  for (const id of levelIds)
    lines.push(`import ${id} from './levels/${id}.js';`);
  lines.push('');
  lines.push(`export const LEVELS = [${levelIds.join(', ')}];`);
  lines.push('');
  lines.push("export const LEVEL_MAP = Object.fromEntries(LEVELS.map(l => [l.id, l]));");
  lines.push('');
  lines.push("if (import.meta.hot) import.meta.hot.accept(() => {});");
  return lines.join('\n') + '\n';
}

// ── Sauvegarde ────────────────────────────────────────────────────────────

function saveLevels(rawLevels) {
  // Filtre défensif : écarte tout élément null/undefined ou sans id
  const levels = rawLevels.filter(l => l != null && l.id);
  if (levels.length !== rawLevels.length)
    console.warn(`[EditorServer] ${rawLevels.length - levels.length} niveau(x) invalide(s) ignoré(s)`);
  if (levels.length === 0) throw new Error('aucun niveau valide à sauvegarder');

  // Crée le répertoire si nécessaire
  if (!fs.existsSync(LEVELS_DIR)) fs.mkdirSync(LEVELS_DIR, { recursive: true });

  const incomingIds = new Set(levels.map(l => l.id));

  // Supprime les fichiers de niveaux supprimés depuis l'éditeur
  const existing = fs.readdirSync(LEVELS_DIR).filter(f => f.endsWith('.js'));
  for (const f of existing) {
    const id = f.replace(/\.js$/, '');
    if (!incomingIds.has(id)) {
      fs.unlinkSync(path.join(LEVELS_DIR, f));
      console.log(`[EditorServer] Deleted level file: ${f}`);
    }
  }

  // Écrit chaque niveau dans son propre fichier
  for (const level of levels) {
    const filePath = path.join(LEVELS_DIR, `${level.id}.js`);
    fs.writeFileSync(filePath, generateOneLevelJs(level), 'utf8');
  }

  // Régénère l'agrégateur levels.js
  const ids = levels.map(l => l.id);
  fs.writeFileSync(LEVELS_MAIN, generateAggregatorJs(ids), 'utf8');

  console.log(`[EditorServer] Saved ${levels.length} level(s): ${ids.join(', ')}`);
}

// ── Liste des assets ─────────────────────────────────────────────────────

function listAssets() {
  const result = {};
  try {
    const entries = fs.readdirSync(ASSETS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const files = fs.readdirSync(path.join(ASSETS_ROOT, entry.name))
            .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
          if (files.length) result[entry.name] = files;
        } catch { /* ignore unreadable dirs */ }
      } else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(entry.name)) {
        if (!result['']) result[''] = [];
        result[''].push(entry.name);
      }
    }
  } catch { /* assets dir not found */ }
  return result;
}

// ── Serveur ───────────────────────────────────────────────────────────────

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const { pathname } = new URL(req.url, `http://localhost:${PORT}`);

  // ── GET /levels ──────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/levels') {
    try {
      json(res, 200, readAllLevels());
    } catch (e) {
      console.error('[EditorServer] readAllLevels error:', e.message);
      json(res, 500, { error: e.message });
    }
    return;
  }

  // ── POST /levels ─────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/levels') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const levels = JSON.parse(body);
        if (!Array.isArray(levels)) throw new Error('payload must be an array');
        saveLevels(levels);
        json(res, 200, { ok: true, count: levels.length });
      } catch (e) {
        console.error('[EditorServer] saveLevels error:', e.message);
        json(res, 400, { error: e.message });
      }
    });
    return;
  }

  // ── GET /assets ──────────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/assets') {
    json(res, 200, listAssets());
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[EditorServer] http://localhost:${PORT}`);
  console.log(`[EditorServer] Levels dir : ${LEVELS_DIR}`);
  console.log(`[EditorServer] Aggregator : ${LEVELS_MAIN}`);
});
