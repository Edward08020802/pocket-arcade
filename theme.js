export const T = {
  bg: '#0B0D12',
  card: '#141821',
  cardHi: '#1B2230',
  border: '#242C3A',
  text: '#E8ECF4',
  dim: '#7C879B',
  green: '#22D38A',
  cyan: '#38BDF8',
  amber: '#FBBF24',
  red: '#F4547A',
  violet: '#A78BFA',
  pink: '#F472B6',
  lime: '#A3E635',
};

// One shared palette for anything that needs N distinct colours (tile values,
// tetromino shapes, card suits) so the games look like one app.
export const SPECTRUM = [
  T.cyan, T.green, T.amber, T.violet, T.pink, T.red, T.lime, '#60A5FA',
];
