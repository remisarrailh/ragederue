/** level_02.js — Bar */
export default {
  id: 'level_02',
  name: 'Bar',
  worldW: 3005,
  parallax: { bg: 0.06, mid: 0.25 },
  background: 'bar_backgrounds',
  props: [
    { type: 'car', x: 282, y: 362, scale: 0.65 },
    { type: 'fore', x: 2295, y: 462, scale: 0.9895833333333334 },
  ],
  containers: [
  ],
  transitZones: [
    { id: 'zone_extract', type: 'extract', x: 3640, y: 300, width: 120, height: 200, targetLevel: null, targetWarpId: null, label: 'EXTRACT' },
  ],
};
