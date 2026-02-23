/** level_03.js — Planque */
export default {
  id: 'level_03',
  name: 'Planque',
  worldW: 2160,
  parallax: { bg: 0.06, mid: 0.25 },
  background: 'house',
  isPlanque: true,       // ← Pas d'ennemis, regen auto HP/faim/soif
  spawnX: 300,
  props: [
  ],
  // Le coffre de planque — toujours accessible, contenu persistant (localStorage)
  containers: [
    { x: 460, y: 410, texture: 'barrel', isHideoutChest: true },
  ],
  transitZones: [
    // Warp de retour vers les rues (côté gauche de la planque)
    { id: 'zone_sortir', type: 'warp', x: 50, y: 88, width: 100, height: 322, targetLevel: 'level_01', label: 'Sortir' },
  ],
};
