'use strict';

const teams = [
  { name: 'Coral', color: '#ff826f' },
  { name: 'Gold', color: '#fbc663' },
  { name: 'Sage', color: '#a8d17e' },
  { name: 'Teal', color: '#62d7cb' },
  { name: 'Blue', color: '#80b6fb' },
  { name: 'Lilac', color: '#c9a2f7' },
];
const lineSizes = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
const directions = [[1, 0], [-1, 0], [0, 1], [-1, 1], [0, -1], [1, -1]];
const board = document.querySelector('#board');
const mode = document.querySelector('#mode');
const finish = document.querySelector('#finish');
const turnLabel = document.querySelector('#turn');
const hint = document.querySelector('#hint');
const turnMarble = document.querySelector('#turn-marble');
const playerList = document.querySelector('#players');
const cells = new Map();
const key = (q, r) => q + ',' + r;
const opposite = team => (team + 3) % 6;
let players, turn, selected, visited, winner, timer, focusCell, moves, canPass;

for (const [r, size] of lineSizes.entries()) {
  for (let col = 0; col < size; col++) {
    const q = col - (size - 1 + r) / 2;
    const x = q + r / 2;
    const outsideHex = Math.max(Math.abs(q + 4), Math.abs(r - 8), Math.abs(q + r - 4)) > 4;
    let camp = null;
    if (outsideHex) {
      if (r < 4) camp = 0;
      else if (r > 12) camp = 3;
      else if (r < 8) camp = x > 0 ? 1 : 5;
      else camp = x > 0 ? 2 : 4;
    }

    const button = document.createElement('button');
    const marble = document.createElement('span');
    button.className = 'hole';
    marble.className = 'marble';
    marble.setAttribute('aria-hidden', 'true');
    button.append(marble);
    button.style.setProperty('--x', (50 + x * 7.45) + '%');
    button.style.setProperty('--y', (5 + r * 5.625) + '%');
    const cell = { q, r, col, camp, button, marble, team: null };
    cells.set(key(q, r), cell);
    button.addEventListener('click', () => play(cell));
    button.addEventListener('focus', () => {
      if (focusCell) focusCell.button.tabIndex = -1;
      focusCell = cell;
      button.tabIndex = 0;
    });
    button.addEventListener('keydown', event => moveFocus(event, cell));
    board.append(button);
  }
}

function moveFocus(event, cell) {
  const offsets = {
    ArrowLeft: [[-1, 0]], ArrowRight: [[1, 0]],
    ArrowUp: [[0, -1], [1, -1]], ArrowDown: [[0, 1], [-1, 1]],
  }[event.key];
  if (!offsets) return;
  event.preventDefault();
  for (const [dq, dr] of offsets) {
    const next = cells.get(key(cell.q + dq, cell.r + dr));
    if (next) {
      next.button.focus();
      break;
    }
  }
}

function legalMoves(from, onlyJumps, seen, occupant = cell => cell.team) {
  const options = new Map();
  for (const [dq, dr] of directions) {
    const near = cells.get(key(from.q + dq, from.r + dr));
    if (!near) continue;
    if (occupant(near) === null) {
      if (!onlyJumps) options.set(near, 'step');
      continue;
    }
    const far = cells.get(key(from.q + 2 * dq, from.r + 2 * dr));
    if (far && occupant(far) === null && !seen.has(far)) options.set(far, 'jump');
  }
  return options;
}

function goalCount(team) {
  return [...cells.values()].filter(cell => cell.team === team && cell.camp === opposite(team)).length;
}

function isComputer() {
  return mode.value === 'cpu' && turn === 3;
}

function render() {
  const thinking = isComputer() && winner === null;
  moves = selected ? legalMoves(selected, visited.size > 0, visited) : new Map();
  const available = new Set();
  if (!thinking && winner === null && !visited.size) {
    for (const cell of cells.values()) {
      if (cell.team === turn && legalMoves(cell, false, visited).size) available.add(cell);
    }
  }
  canPass = !thinking && winner === null && !visited.size && !available.size;
  if (!board.contains(document.activeElement)) {
    focusCell = available.values().next().value || focusCell || cells.values().next().value;
  }

  for (const cell of cells.values()) {
    const { button, marble, team, camp } = cell;
    const target = camp !== null && players.includes(opposite(camp)) ? teams[opposite(camp)] : null;
    const piece = team === null ? null : teams[team];
    button.style.setProperty('--cup', target ? target.color + '47' : '#182c30');
    button.classList.toggle('selected', selected === cell);
    button.classList.toggle('legal', moves.has(cell));
    button.classList.toggle('playable', available.has(cell));
    button.tabIndex = cell === focusCell ? 0 : -1;
    marble.hidden = !piece;
    if (piece) marble.style.setProperty('--color', piece.color);
    const location = 'Row ' + (cell.r + 1) + ', hole ' + (cell.col + 1);
    const content = piece ? piece.name + ' marble' : 'Empty hole';
    const goal = target ? ', ' + target.name + ' goal' : '';
    const state = moves.has(cell) ? ', legal ' + moves.get(cell) : selected === cell ? ', selected' : '';
    button.setAttribute('aria-label', location + ', ' + content + goal + state);
  }

  const active = teams[winner ?? turn];
  turnMarble.style.setProperty('--color', active.color);
  turnLabel.textContent = winner !== null ? active.name + ' wins!' : active.name + ' to move';
  if (winner !== null) hint.textContent = 'All ten marbles reached their goal.';
  else if (thinking) hint.textContent = 'Computer is thinking…';
  else if (visited.size) hint.textContent = 'Keep jumping or end your turn.';
  else if (canPass) hint.textContent = 'No legal moves. Pass your turn.';
  else if (selected) hint.textContent = 'Choose a highlighted hole.';
  else hint.textContent = 'Choose a marble to move.';
  finish.textContent = canPass ? 'Pass turn' : 'End turn';
  finish.disabled = winner !== null || thinking || (!visited.size && !canPass);

  playerList.replaceChildren(...players.map(team => {
    const row = document.createElement('li');
    const piece = document.createElement('span');
    const name = document.createElement('span');
    const progress = document.createElement('span');
    piece.className = 'marble';
    piece.setAttribute('aria-hidden', 'true');
    piece.style.setProperty('--color', teams[team].color);
    name.textContent = teams[team].name + (mode.value === 'cpu' && team === 3 ? ' · CPU' : '');
    progress.textContent = goalCount(team) + ' / 10';
    row.append(piece, name, progress);
    return row;
  }));
}

function play(cell) {
  if (winner !== null || isComputer()) return;
  const action = moves.get(cell);
  if (action) {
    selected.team = null;
    cell.team = turn;
    if (action === 'jump') {
      visited.add(selected);
      visited.add(cell);
    }
    selected = cell;
    if (goalCount(turn) === 10 || action === 'step' || !legalMoves(cell, true, visited).size) advance();
    else render();
  } else if (!visited.size) {
    selected = cell.team === turn && selected !== cell && legalMoves(cell, false, visited).size ? cell : null;
    render();
  }
}

function advance() {
  selected = null;
  visited.clear();
  if (goalCount(turn) === 10) winner = turn;
  else turn = players[(players.indexOf(turn) + 1) % players.length];
  render();
  if (winner === null && isComputer()) timer = setTimeout(computerTurn, 450);
}

function computerTurn() {
  let best = null;
  for (const origin of cells.values()) {
    if (origin.team !== turn) continue;
    const occupant = cell => cell === origin ? null : cell.team;
    const explored = new Set([origin]);
    const pending = [];
    const consider = destination => {
      const entersGoal = Number(destination.camp === opposite(turn)) - Number(origin.camp === opposite(turn));
      const sideways = Math.abs(destination.q + destination.r / 2) - Math.abs(origin.q + origin.r / 2);
      const score = (origin.r - destination.r) * 3 + entersGoal * 12 - sideways * .4 + Math.random();
      if (!best || score > best.score) best = { origin, destination, score };
    };
    for (const [destination, action] of legalMoves(origin, false, explored)) {
      consider(destination);
      if (action === 'jump') {
        pending.push(destination);
        explored.add(destination);
      }
    }
    for (const landing of pending) {
      for (const destination of legalMoves(landing, true, explored, occupant).keys()) {
        consider(destination);
        pending.push(destination);
        explored.add(destination);
      }
    }
  }
  if (best) {
    best.origin.team = null;
    best.destination.team = turn;
  }
  advance();
}

function reset() {
  clearTimeout(timer);
  players = { cpu: [0, 3], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] }[mode.value];
  turn = players[0];
  selected = null;
  visited = new Set();
  winner = null;
  for (const cell of cells.values()) cell.team = players.includes(cell.camp) ? cell.camp : null;
  render();
}

finish.addEventListener('click', () => {
  if (!finish.disabled) advance();
});
document.querySelector('#restart').addEventListener('click', reset);
mode.addEventListener('change', reset);
reset();
