/** level_03.js — Planque */
export default {
  id: 'level_03',
  name: 'Planque',
  isPlanque: true,
  worldW: 2160,
  parallax: { bg: 0.06, mid: 0.25 },
  background: 'house',
  props: [
  ],
  containers: [
    { x: 400, y: 410, texture: 'barrel', isHideoutChest: true },
  ],
  transitZones: [
    { id: 'zone_extract', type: 'extract', x: 2805, y: 300, width: 120, height: 200, targetLevel: null, label: 'EXTRACT' },
    { id: 'zone_1771948237482', type: 'warp', x: 1858, y: 279, width: 120, height: 200, targetLevel: 'level_01', label: 'WARP' },
  ],
};
