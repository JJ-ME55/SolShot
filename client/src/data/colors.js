/**
 * Tank color options for player selection.
 * Colors are stored as hex integers (Phaser format) and CSS hex strings.
 */
const TANK_COLORS = [
  { id: 0, name: 'RED',    hex: '#FF0000', phaserHex: 0xFF0000 },
  { id: 1, name: 'ORANGE', hex: '#FF9900', phaserHex: 0xFF9900 },
  { id: 2, name: 'YELLOW', hex: '#FFFF00', phaserHex: 0xFFFF00 },
  { id: 3, name: 'GREEN',  hex: '#00FF00', phaserHex: 0x00FF00 },
  { id: 4, name: 'CYAN',   hex: '#00FFFF', phaserHex: 0x00FFFF },
  { id: 5, name: 'BLUE',   hex: '#0066FF', phaserHex: 0x0066FF },
  { id: 6, name: 'PURPLE', hex: '#9900FF', phaserHex: 0x9900FF },
  { id: 7, name: 'PINK',   hex: '#FF00FF', phaserHex: 0xFF00FF },
  { id: 8, name: 'WHITE',  hex: '#FFFFFF', phaserHex: 0xFFFFFF },
];

export default TANK_COLORS;
