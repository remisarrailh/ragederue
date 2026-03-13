/**
 * storage.js — Wrapper centralisé pour localStorage.
 *
 * Élimine les `parseFloat(localStorage.getItem('RAGEDERUE_...') ?? '0.5')`
 * dispersés dans GameScene, TitleScene, PauseScene, InputController, LevelEditorScene.
 *
 * Usage : import { Storage } from '../utils/storage.js';
 *         const vol = Storage.getMusicVol();
 */

import {
  LS_MUSIC_VOL,
  LS_SFX_VOL,
  LS_PAD_INDEX,
  LS_EDITOR_LEVELS,
} from '../config/constants.js';

export const Storage = {

  // ── Audio ────────────────────────────────────────────────────────────────
  getMusicVol: ()  => parseFloat(localStorage.getItem(LS_MUSIC_VOL) ?? '0.5'),
  setMusicVol: (v) => localStorage.setItem(LS_MUSIC_VOL, Number(v).toFixed(2)),

  getSfxVol:   ()  => parseFloat(localStorage.getItem(LS_SFX_VOL) ?? '0.5'),
  setSfxVol:   (v) => localStorage.setItem(LS_SFX_VOL, Number(v).toFixed(2)),

  // ── Gamepad ──────────────────────────────────────────────────────────────
  getPadIndex: ()  => parseInt(localStorage.getItem(LS_PAD_INDEX) ?? '-1', 10),
  setPadIndex: (i) => localStorage.setItem(LS_PAD_INDEX, String(i)),

  // ── Level Editor ─────────────────────────────────────────────────────────
  getEditorLevels: () => {
    try {
      const raw = localStorage.getItem(LS_EDITOR_LEVELS);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setEditorLevels: (levels) => {
    localStorage.setItem(LS_EDITOR_LEVELS, JSON.stringify(levels));
  },
  hasEditorLevels: () => localStorage.getItem(LS_EDITOR_LEVELS) !== null,
};
