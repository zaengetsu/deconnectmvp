// Jetons de la charte (valeurs exactes des maquettes Admin et Partenaire).
export const C = {
  ink: '#16182B',
  bg: '#F6F4F1',
  surface: '#fff',
  surfaceAlt: '#FBFAF8',
  sand: '#F1EEE9',
  segment: '#EDEAE4',
  muted: '#8A8FA6',
  text2: '#4A4E66',
  primary: '#3C41A8',
  primaryDark: '#262A78',
  primarySoft: '#EEEFFB',
  primaryPale: '#D9DAF3',
  primaryMid: '#B9BCE8',
  coral: '#FF9469',
  coralSoft: '#FFEDE4',
  coralText: '#C2582A',
  coralPale: '#FFF7F3',
  green: '#6E9E85',
  greenText: '#4A7A5F',
  greenSoft: '#E9F1EC',
  amberText: '#96681A',
  amberSoft: '#FBF0DA',
  redText: '#AE3A50',
  redSoft: '#FBE9EC',
  red: '#D8556B',
  mapBg: '#E9EDF2',
  border: 'rgba(22,24,43,.08)',
  borderStrong: 'rgba(22,24,43,.14)',
  borderChip: 'rgba(22,24,43,.1)',
  rowBorder: 'rgba(22,24,43,.05)',
  headBorder: 'rgba(22,24,43,.07)',
} as const;

/** Couleurs de statut [fond, texte] reprises des maquettes. */
export const TONES = {
  green: [C.greenSoft, C.greenText],
  blue: [C.primarySoft, C.primary],
  amber: [C.amberSoft, C.amberText],
  red: [C.redSoft, C.redText],
  neutral: [C.sand, C.text2],
  muted: [C.sand, C.muted],
  coral: [C.coralSoft, C.coralText],
} as const;
export type Tone = keyof typeof TONES;

/** seg() et chip() des maquettes. */
export const seg = (on: boolean) => ({ background: on ? '#fff' : 'transparent', color: on ? C.ink : C.muted });
export const chip = (on: boolean) => ({ background: on ? C.ink : '#fff', color: on ? '#fff' : C.text2, border: `1px solid ${on ? C.ink : C.borderChip}` });
