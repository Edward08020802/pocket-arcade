/**
 * Chess rules and a small search, kept free of React so it can be tested with
 * perft (counting leaf nodes of the move tree) against published values.
 *
 * Board is 64 entries, index 0 = a8, index 63 = h1, using FEN letters:
 * uppercase is White, lowercase is Black, null is empty.
 */

export const WHITE = 'w';
export const BLACK = 'b';

const isUpper = (c) => c >= 'A' && c <= 'Z';
export const colorOf = (p) => (p == null ? null : isUpper(p) ? WHITE : BLACK);
export const typeOf = (p) => (p == null ? null : p.toLowerCase());
const opposite = (c) => (c === WHITE ? BLACK : WHITE);

const fileOf = (i) => i % 8;
const rankOf = (i) => Math.floor(i / 8);

const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const at = (rank, file) => (rank < 0 || rank > 7 || file < 0 || file > 7 ? -1 : rank * 8 + file);

export function parseFen(fen) {
  const [placement, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Array(64).fill(null);
  let i = 0;
  for (const ch of placement) {
    if (ch === '/') continue;
    if (ch >= '1' && ch <= '8') i += Number(ch);
    else board[i++] = ch;
  }
  return {
    board,
    turn: turn === 'b' ? BLACK : WHITE,
    castling: castling === '-' ? '' : castling,
    ep: !ep || ep === '-' ? null : squareToIndex(ep),
    half: Number(half ?? 0),
    full: Number(full ?? 1),
  };
}

export const squareToIndex = (sq) =>
  (8 - Number(sq[1])) * 8 + (sq.charCodeAt(0) - 97);
export const indexToSquare = (i) =>
  String.fromCharCode(97 + fileOf(i)) + (8 - rankOf(i));

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const initialPosition = () => parseFen(START_FEN);

/** Is `square` attacked by any piece of `by`? Used for check and castling. */
export function isAttacked(board, square, by) {
  const r = rankOf(square);
  const f = fileOf(square);

  // Pawns attack diagonally forward; white pawns come from the rank below.
  const pawnRank = by === WHITE ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    const idx = at(pawnRank, f + df);
    if (idx >= 0) {
      const p = board[idx];
      if (p && colorOf(p) === by && typeOf(p) === 'p') return true;
    }
  }

  for (const [dr, df] of KNIGHT_DELTAS) {
    const idx = at(r + dr, f + df);
    if (idx >= 0) {
      const p = board[idx];
      if (p && colorOf(p) === by && typeOf(p) === 'n') return true;
    }
  }

  for (const [dr, df] of KING_DELTAS) {
    const idx = at(r + dr, f + df);
    if (idx >= 0) {
      const p = board[idx];
      if (p && colorOf(p) === by && typeOf(p) === 'k') return true;
    }
  }

  const slide = (dirs, kinds) => {
    for (const [dr, df] of dirs) {
      let rr = r + dr;
      let ff = f + df;
      while (true) {
        const idx = at(rr, ff);
        if (idx < 0) break;
        const p = board[idx];
        if (p) {
          if (colorOf(p) === by && kinds.includes(typeOf(p))) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
    return false;
  };

  return slide(BISHOP_DIRS, ['b', 'q']) || slide(ROOK_DIRS, ['r', 'q']);
}

export function kingSquare(board, color) {
  const target = color === WHITE ? 'K' : 'k';
  return board.indexOf(target);
}

export function inCheck(pos, color = pos.turn) {
  const k = kingSquare(pos.board, color);
  return k >= 0 && isAttacked(pos.board, k, opposite(color));
}

const PROMOS = ['q', 'r', 'b', 'n'];

/** Every pseudo-legal move -- king safety is filtered afterwards. */
function pseudoMoves(pos) {
  const { board, turn, ep, castling } = pos;
  const moves = [];
  const add = (from, to, extra) => moves.push({ from, to, ...extra });

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || colorOf(piece) !== turn) continue;
    const kind = typeOf(piece);
    const r = rankOf(from);
    const f = fileOf(from);

    if (kind === 'p') {
      const dir = turn === WHITE ? -1 : 1;
      const startRank = turn === WHITE ? 6 : 1;
      const promoRank = turn === WHITE ? 0 : 7;

      const one = at(r + dir, f);
      if (one >= 0 && !board[one]) {
        if (rankOf(one) === promoRank) PROMOS.forEach((p) => add(from, one, { promo: p }));
        else {
          add(from, one, {});
          const two = at(r + 2 * dir, f);
          if (r === startRank && two >= 0 && !board[two]) add(from, two, { double: true });
        }
      }
      for (const df of [-1, 1]) {
        const cap = at(r + dir, f + df);
        if (cap < 0) continue;
        const target = board[cap];
        if (target && colorOf(target) !== turn) {
          if (rankOf(cap) === promoRank) PROMOS.forEach((p) => add(from, cap, { promo: p }));
          else add(from, cap, {});
        } else if (!target && ep != null && cap === ep) {
          add(from, cap, { enPassant: true });
        }
      }
      continue;
    }

    if (kind === 'n' || kind === 'k') {
      const deltas = kind === 'n' ? KNIGHT_DELTAS : KING_DELTAS;
      for (const [dr, df] of deltas) {
        const to = at(r + dr, f + df);
        if (to < 0) continue;
        const target = board[to];
        if (!target || colorOf(target) !== turn) add(from, to, {});
      }
      if (kind === 'k') {
        // Castling: rights present, squares empty, and the king never passes
        // through or lands on an attacked square.
        const rights = turn === WHITE ? ['K', 'Q'] : ['k', 'q'];
        const home = turn === WHITE ? 60 : 4;
        if (from === home && !isAttacked(board, home, opposite(turn))) {
          if (castling.includes(rights[0]) &&
              !board[home + 1] && !board[home + 2] &&
              !isAttacked(board, home + 1, opposite(turn)) &&
              !isAttacked(board, home + 2, opposite(turn))) {
            add(from, home + 2, { castle: 'k' });
          }
          if (castling.includes(rights[1]) &&
              !board[home - 1] && !board[home - 2] && !board[home - 3] &&
              !isAttacked(board, home - 1, opposite(turn)) &&
              !isAttacked(board, home - 2, opposite(turn))) {
            add(from, home - 2, { castle: 'q' });
          }
        }
      }
      continue;
    }

    const dirs = kind === 'b' ? BISHOP_DIRS : kind === 'r' ? ROOK_DIRS
      : BISHOP_DIRS.concat(ROOK_DIRS);
    for (const [dr, df] of dirs) {
      let rr = r + dr;
      let ff = f + df;
      while (true) {
        const to = at(rr, ff);
        if (to < 0) break;
        const target = board[to];
        if (!target) add(from, to, {});
        else {
          if (colorOf(target) !== turn) add(from, to, {});
          break;
        }
        rr += dr;
        ff += df;
      }
    }
  }
  return moves;
}

const ROOK_HOME = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

export function makeMove(pos, move) {
  const board = pos.board.slice();
  const piece = board[move.from];
  const kind = typeOf(piece);
  const color = colorOf(piece);
  const captured = move.enPassant
    ? board[move.to + (color === WHITE ? 8 : -8)]
    : board[move.to];

  board[move.from] = null;
  board[move.to] = move.promo
    ? (color === WHITE ? move.promo.toUpperCase() : move.promo)
    : piece;

  if (move.enPassant) board[move.to + (color === WHITE ? 8 : -8)] = null;

  if (move.castle) {
    // The rook hops to the far side of the king.
    const home = color === WHITE ? 60 : 4;
    if (move.castle === 'k') {
      board[home + 1] = board[home + 3];
      board[home + 3] = null;
    } else {
      board[home - 1] = board[home - 4];
      board[home - 4] = null;
    }
  }

  // Castling rights: lost when the king moves, or when a rook leaves or is
  // captured on its home square.
  let castling = pos.castling;
  if (kind === 'k') {
    castling = castling.replace(color === WHITE ? /[KQ]/g : /[kq]/g, '');
  }
  if (ROOK_HOME[move.from]) castling = castling.replace(ROOK_HOME[move.from], '');
  if (ROOK_HOME[move.to]) castling = castling.replace(ROOK_HOME[move.to], '');

  return {
    board,
    turn: opposite(color),
    castling,
    ep: move.double ? (move.from + move.to) / 2 : null,
    half: kind === 'p' || captured ? 0 : pos.half + 1,
    full: color === BLACK ? pos.full + 1 : pos.full,
    captured,
  };
}

/** Legal moves: pseudo-legal filtered by whether they leave the king in check. */
export function legalMoves(pos) {
  const out = [];
  for (const m of pseudoMoves(pos)) {
    const next = makeMove(pos, m);
    if (!isAttacked(next.board, kingSquare(next.board, pos.turn), next.turn)) out.push(m);
  }
  return out;
}

export function gameStatus(pos) {
  const moves = legalMoves(pos);
  if (moves.length > 0) {
    if (pos.half >= 100) return 'fifty-move';
    if (insufficientMaterial(pos.board)) return 'insufficient';
    return 'playing';
  }
  return inCheck(pos) ? 'checkmate' : 'stalemate';
}

function insufficientMaterial(board) {
  const pieces = board.filter(Boolean).map(typeOf);
  if (pieces.some((p) => p === 'p' || p === 'r' || p === 'q')) return false;
  // King vs king, or king and a single minor piece.
  return pieces.length <= 3;
}

/** Perft: leaf nodes of the move tree. The standard correctness check. */
export function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) total += perft(makeMove(pos, m), depth - 1);
  return total;
}

// ---------------------------------------------------------------- evaluation

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables, from White's point of view (index 0 = a8).
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
      0,  0,  0,  0,  0,  0,  0,  0,
      5, 10, 10, 10, 10, 10, 10,  5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
     -5,  0,  0,  0,  0,  0,  0, -5,
      0,  0,  0,  5,  5,  0,  0,  0],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20],
};

const mirror = (i) => (7 - rankOf(i)) * 8 + fileOf(i);

/** Centipawns from the side-to-move's point of view. */
export function evaluate(pos) {
  let total = 0;
  for (let i = 0; i < 64; i++) {
    const p = pos.board[i];
    if (!p) continue;
    const kind = typeOf(p);
    const white = colorOf(p) === WHITE;
    const value = VALUE[kind] + PST[kind][white ? i : mirror(i)];
    total += white ? value : -value;
  }
  return pos.turn === WHITE ? total : -total;
}

const MATE = 100000;

/** Captures first, best capture first -- cheap ordering that prunes a lot. */
function orderMoves(pos, moves) {
  return moves
    .map((m) => {
      const victim = pos.board[m.to];
      const attacker = pos.board[m.from];
      const gain = victim ? VALUE[typeOf(victim)] - VALUE[typeOf(attacker)] / 10 : 0;
      return { m, gain: gain + (m.promo ? 800 : 0) };
    })
    .sort((a, b) => b.gain - a.gain)
    .map((x) => x.m);
}

/**
 * Search captures only, until the position is quiet.
 *
 * Without this the engine stops counting mid-exchange: it sees itself win a
 * queen at the last ply and never sees the recapture, so it hangs pieces in
 * exactly the situations a human would punish.
 */
function quiesce(pos, alpha, beta, deadline, ply = 0) {
  const stand = evaluate(pos);
  if (ply > 6 || Date.now() > deadline) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = legalMoves(pos).filter((m) => pos.board[m.to] || m.promo);
  for (const m of orderMoves(pos, captures)) {
    const value = -quiesce(makeMove(pos, m), -beta, -alpha, deadline, ply + 1);
    if (value >= beta) return beta;
    if (value > alpha) alpha = value;
  }
  return alpha;
}

function negamax(pos, depth, alpha, beta, deadline) {
  const moves = legalMoves(pos);
  if (!moves.length) return inCheck(pos) ? -MATE - depth : 0;
  if (depth === 0) return quiesce(pos, alpha, beta, deadline);
  if (Date.now() > deadline) return evaluate(pos);

  let best = -Infinity;
  for (const m of orderMoves(pos, moves)) {
    const value = -negamax(makeMove(pos, m), depth - 1, -beta, -alpha, deadline);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Pick a move. `blunder` is the chance of ignoring the search and playing a
 * random legal move instead -- that is what makes the weaker ratings feel weak
 * in a human way rather than merely shallow.
 */
export function chooseMove(pos, { depth = 3, blunder = 0, budgetMs = 2500 } = {}) {
  const moves = legalMoves(pos);
  if (!moves.length) return null;
  if (blunder > 0 && Math.random() < blunder) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Iterative deepening: search depth 1, then 2, and so on, keeping the best
  // move from the last depth that finished. A timeout then costs accuracy, not
  // correctness -- aborting mid-depth and using those half-searched scores
  // could otherwise return a worse move than searching one ply less.
  const deadline = Date.now() + budgetMs;
  const ordered = orderMoves(pos, moves);
  let best = ordered[0];

  for (let d = 1; d <= depth; d++) {
    let localBest = null;
    let localScore = -Infinity;
    let aborted = false;

    for (const m of ordered) {
      if (Date.now() > deadline) { aborted = true; break; }
      const score = -negamax(makeMove(pos, m), d - 1, -Infinity, Infinity, deadline);
      if (score > localScore) {
        localScore = score;
        localBest = m;
      }
    }

    if (aborted) break;
    best = localBest;
    // Nothing deeper can beat a forced mate that is already found.
    if (localScore > MATE - 100) break;
  }
  return best;
}
