/** level_03.js — Planque */
export default {
  id: 'level_03',
  name: 'Planque',
  worldW: 2160,
  parallax: { bg: 0.06, mid: 0.25 },
  background: 'house',
  props: [
  ],
  containers: [
    { x: 785, y: 470, texture: 'coffrePlanque', isHideoutChest: true },
    { x: 938, y: 468, texture: 'workbench', isUpgradeStation: true },
  ],
  transitZones: [
    { id: 'zone_1771948237482', type: 'warp', x: 1858, y: 279, width: 120, height: 200, targetLevel: 'level_01', targetWarpId: 'zone_1771807424563', label: 'WARP' },
  ],
};
