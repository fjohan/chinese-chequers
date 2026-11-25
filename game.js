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
const computerPlayers = new Set([3]);
const progressLabels = new Map();
const svgNamespace = 'http://www.w3.org/2000/svg';
const trails = document.createElementNS(svgNamespace, 'svg');
trails.setAttribute('class', 'jump-trails');
trails.setAttribute('viewBox', '0 0 100 100');
trails.setAttribute('preserveAspectRatio', 'none');
trails.setAttribute('aria-hidden', 'true');
board.append(trails);
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
    const left = 50 + x * 7.45;
    const top = 5 + r * 5.625;
    button.style.setProperty('--x', left + '%');
    button.style.setProperty('--y', top + '%');
    const cell = { q, r, col, camp, left, top, button, marble, team: null };
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
  return computerPlayers.has(turn);
}

function showJump(path) {
  const trail = document.createElementNS(svgNamespace, 'g');
  const line = document.createElementNS(svgNamespace, 'polyline');
  const start = document.createElementNS(svgNamespace, 'circle');
  trail.setAttribute('class', 'jump-trail');
  trail.style.color = teams[turn].color;
  line.setAttribute('points', path.map(cell => cell.left + ',' + cell.top).join(' '));
  start.setAttribute('cx', path[0].left);
  start.setAttribute('cy', path[0].top);
  start.setAttribute('r', '0.85');
  trail.append(line, start);
  trail.addEventListener('animationend', () => trail.remove(), { once: true });
  trails.append(trail);
}

function render() {
  const thinking = isComputer() && winner === null;
  moves = selected && !thinking ? legalMoves(selected, visited.size > 0, visited) : new Map();
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

  for (const [team, progress] of progressLabels) {
    progress.textContent = goalCount(team) + ' / 10';
  }
}

function renderPlayerControls() {
  progressLabels.clear();
  playerList.replaceChildren(...players.map(team => {
    const row = document.createElement('li');
    const piece = document.createElement('span');
    const name = document.createElement('span');
    const progress = document.createElement('span');
    const control = document.createElement('select');
    piece.className = 'marble';
    piece.setAttribute('aria-hidden', 'true');
    piece.style.setProperty('--color', teams[team].color);
    name.textContent = teams[team].name;
    progress.className = 'goal-progress';
    progressLabels.set(team, progress);
    control.setAttribute('aria-label', teams[team].name + ' player type');
    control.add(new Option('Human', 'human'));
    control.add(new Option('Computer', 'computer'));
    control.value = computerPlayers.has(team) ? 'computer' : 'human';
    control.addEventListener('change', () => {
      if (control.value === 'computer') computerPlayers.add(team);
      else computerPlayers.delete(team);
      if (team === turn) {
        render();
        scheduleComputer();
      }
    });
    row.append(piece, name, progress, control);
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
      showJump([selected, cell]);
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
  scheduleComputer();
}

function scheduleComputer() {
  clearTimeout(timer);
  if (winner === null && isComputer()) timer = setTimeout(computerTurn, 750);
}

function computerTurn() {
  const continuing = visited.size > 0;
  const goal = opposite(turn);
  const oneAway = goalCount(turn) === 9;
  const targets = [...cells.values()].filter(cell => cell.camp === goal);
  const tip = targets.reduce((furthest, cell) =>
    Math.hypot(cell.left - 50, cell.top - 50) > Math.hypot(furthest.left - 50, furthest.top - 50)
      ? cell : furthest);
  // Axial coordinates keep the computer's strategy consistent across all six arms.
  const distance = cell => {
    const dq = cell.q - tip.q;
    const dr = cell.r - tip.r;
    return Math.sqrt(dq * dq + dq * dr + dr * dr);
  };
  let best = null;
  for (const origin of continuing ? [selected] : cells.values()) {
    if (origin.team !== turn) continue;
    const occupant = cell => cell === origin ? null : cell.team;
    const explored = new Set([...visited, origin]);
    const pending = [[origin]];
    const consider = (path, destination, action) => {
      const entersGoal = Number(destination.camp === goal) - Number(origin.camp === goal);
      const score = oneAway && entersGoal === 1
        ? Infinity : (distance(origin) - distance(destination)) * 3 + entersGoal * 12 + Math.random();
      if ((!continuing || score > 0) && (!best || score > best.score)) {
        best = { origin, destination, score, path: action === 'jump' ? [...path, destination] : null };
      }
    };
    for (const path of pending) {
      const landing = path[path.length - 1];
      for (const [destination, action] of legalMoves(landing, continuing || landing !== origin, explored, occupant)) {
        consider(path, destination, action);
        if (action === 'jump') {
          pending.push([...path, destination]);
          explored.add(destination);
        }
      }
    }
  }
  if (best) {
    if (best.path) showJump(best.path);
    best.origin.team = null;
    best.destination.team = turn;
  }
  advance();
}

function reset() {
  players = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 6: [0, 1, 2, 3, 4, 5] }[mode.value];
  turn = players[0];
  selected = null;
  visited = new Set();
  winner = null;
  trails.replaceChildren();
  for (const cell of cells.values()) cell.team = players.includes(cell.camp) ? cell.camp : null;
  renderPlayerControls();
  render();
  scheduleComputer();
}

finish.addEventListener('click', () => {
  if (!finish.disabled) advance();
});
document.querySelector('#restart').addEventListener('click', reset);
mode.addEventListener('change', reset);
reset();
