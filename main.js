const ELIMINATION_SCORE = 250;
const CELEBRATION_IMG = 'assets/celebration_hero_1777168705232.png';
const WORRIED_IMG = 'assets/worried_loser_1777168720213.png';

let players = [];
let knownPlayerNames = [];
let selectedPlayerNames = new Set();
let roundCount = 0;
let currentRoundScores = {};

/* --- STATE SYNCHRONIZATION --- */
function saveState() {
  localStorage.setItem('rummyCurrent', JSON.stringify({ players, roundCount }));
}

function loadState() {
  knownPlayerNames = JSON.parse(localStorage.getItem('rummyKnownPlayers') || '[]');
  selectedPlayerNames = new Set();

  const saved = localStorage.getItem('rummyCurrent');
  if (saved) {
    try {
      const state = JSON.parse(saved);
      players = state.players || [];
      roundCount = state.roundCount || 0;
      
      if (roundCount > 0) {
        document.getElementById('setup-section').classList.add('hidden');
        document.getElementById('game-section').classList.remove('hidden');
        renderGame();
        return; // skip setup
      }
    } catch(e) {}
  }

  // Pre-select players from history if starting fresh
  const history = JSON.parse(localStorage.getItem('rummyHistory') || '[]');
  if (history.length > 0 && selectedPlayerNames.size === 0) {
    history[history.length - 1].players.forEach(p => {
      selectedPlayerNames.add(p.name);
      if (!knownPlayerNames.includes(p.name)) knownPlayerNames.push(p.name);
    });
    localStorage.setItem('rummyKnownPlayers', JSON.stringify(knownPlayerNames));
  }

  renderSetupPlayerList();
  showLibraryTab('paused');
}

document.addEventListener('DOMContentLoaded', loadState);

/* --- SETUP PHASE --- */

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function addPlayer() {
  const input = document.getElementById('player-name-input');
  const name = input.value.trim();
  if (!name) return;
  
  if (!knownPlayerNames.includes(name)) {
    knownPlayerNames.push(name);
  }
  selectedPlayerNames.add(name);
  
  input.value = '';
  localStorage.setItem('rummyKnownPlayers', JSON.stringify(knownPlayerNames));
  renderSetupPlayerList();
}

function removeKnownPlayer(name) {
  knownPlayerNames = knownPlayerNames.filter(n => n !== name);
  selectedPlayerNames.delete(name);
  localStorage.setItem('rummyKnownPlayers', JSON.stringify(knownPlayerNames));
  renderSetupPlayerList();
}

function togglePlayerSelection(name, isChecked) {
  if (isChecked) selectedPlayerNames.add(name);
  else selectedPlayerNames.delete(name);
  document.getElementById('start-game-btn').disabled = selectedPlayerNames.size < 2;
}

function renderSetupPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '0.5rem';
  
  knownPlayerNames.forEach(name => {
    const isSel = selectedPlayerNames.has(name);
    const li = document.createElement('li');
    li.style.background = 'var(--panel-bg)';
    li.style.padding = '0.75rem 1rem';
    li.style.borderRadius = '8px';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.border = '1px solid var(--panel-border)';
    
    li.innerHTML = `
      <label style="display: flex; align-items: center; gap: 1rem; cursor: pointer; flex: 1;">
        <input type="checkbox" onchange="togglePlayerSelection('${name}', this.checked)" ${isSel ? 'checked' : ''} style="width: 20px; height: 20px; accent-color: var(--primary);" />
        <span style="font-size: 1.1rem; font-weight: 600;">${name}</span>
      </label>
      <button class="btn-danger btn-outline" style="padding: 0.25rem 0.5rem; border: none; font-size: 1rem;" onclick="removeKnownPlayer('${name}')">❌</button>
    `;
    list.appendChild(li);
  });
  
  document.getElementById('start-game-btn').disabled = selectedPlayerNames.size < 2;
}

function startGame() {
  players = Array.from(selectedPlayerNames).map(name => ({
    id: generateId(),
    name: name,
    scores: [],
    total: 0,
    hasBoughtBack: false,
    isOut: false
  }));

  document.getElementById('setup-section').classList.add('hidden');
  document.getElementById('game-section').classList.remove('hidden');
  roundCount = 1;

  // Ensure game has a unique ID for pausing
  if (!localStorage.getItem('rummyCurrentId')) {
    localStorage.setItem('rummyCurrentId', generateId());
  }

  saveState();
  renderGame();
}

/* --- GAME LOGIC --- */

function renderGame() {
  currentRoundScores = {};
  renderScorecard();
  
  let remainingPlayers = players.filter(p => !p.isOut);
  if (remainingPlayers.length <= 1 && players.length > 1) {
    document.getElementById('current-round-title').innerText = "Game Over!";
    document.getElementById('player-inputs').innerHTML = `
      <div style="text-align:center; padding: 2rem;">
        <h2 style="color: var(--success); font-size: 2rem;">🏆 ${remainingPlayers.length === 1 ? remainingPlayers[0].name : 'Nobody'} Wins! 🏆</h2>
        <button class="btn-primary" style="margin-top: 1.5rem;" onclick="startNewGame()">Start New Game</button>
      </div>
    `;
    const submitBtn = document.querySelector('#round-input-panel button.full-width');
    if (submitBtn) submitBtn.style.display = 'none';
  } else {
    document.getElementById('current-round-title').innerText = `Round ${roundCount} Input`;
    renderInputForm();
  }
}

function getHighestScore() {
  const activePlayers = players.filter(p => !p.isOut);
  if (activePlayers.length === 0) return 0;
  return Math.max(...activePlayers.map(p => p.total));
}

function buyInPlayer(id) {
  const player = players.find(p => p.id === id);
  if (!player) return;

  // Rejoin score is highest + 1
  const newScore = getHighestScore() + 1;
  const diff = newScore - player.total;
  
  // To make the scoreboard math work, we just add the diff to the current round... Actually, wait!
  // It's better to just set player.total to newScore and add a dummy tracking entry, 
  // but since we render by `reduce` over scores, let's just push a special score of (newScore - player.total)
  // Wait, if we push it right away, it messes up the current round's column index.
  // We can just pad their scores array to the current round count, and the last entry is the diff.
  
  // Pad missing rounds with 0 or "OUT", then set the buy-in value
  while (player.scores.length < roundCount - 1) {
    player.scores.push('OUT');
  }
  
  // we record the buy-in as an immediate +X pts adjustment in the last round so their total aligns.
  player.total = newScore;
  player.isOut = false;
  player.hasBoughtBack = true;
  
  saveState();
  renderGame(); // re-render layout
}

function setScore(playerId, score, buttonElem) {
  // Allow toggling off a button if it is already selected
  if (buttonElem && buttonElem.classList.contains('selected') && buttonElem.tagName === 'BUTTON') {
    buttonElem.classList.remove('selected');
    currentRoundScores[playerId] = null;
    return;
  }

  currentRoundScores[playerId] = score;
  
  // UI toggle selected class
  if (buttonElem) {
    const siblings = buttonElem.parentElement.querySelectorAll('button, input');
    siblings.forEach(el => {
      el.classList.remove('selected');
      // If we clicked a button, clear the custom input box
      if (el.tagName === 'INPUT' && el !== buttonElem) {
        el.value = '';
      }
    });
    buttonElem.classList.add('selected');
  }
}

function handleCustomScore(playerId, inputElem) {
  let val = parseInt(inputElem.value, 10);
  if (!isNaN(val)) {
    if (val > 80) val = 80;
    if (val < 0) val = 0;
    inputElem.value = val;
    setScore(playerId, val, inputElem);
  } else {
    // If the input was cleared, remove the score
    currentRoundScores[playerId] = null;
    inputElem.classList.remove('selected');
  }
}

function renderInputForm() {
  const container = document.getElementById('player-inputs');
  container.innerHTML = '';
  
  players.forEach(p => {
    if (p.isOut) {
      // Out player row
      const outRow = document.createElement('div');
      outRow.className = 'player-input-row player-out-row';
      
      const highestScore = getHighestScore();
      const activeCount = players.filter(pl => !pl.isOut).length;
      const canBuyBack = !p.hasBoughtBack && activeCount > 1 && (highestScore + 1 <= 224);
      
      let actionHtml = '';
      if (canBuyBack) {
        actionHtml = `<button class="btn-success" onclick="buyInPlayer('${p.id}')">Buy Back In (+1 Highest)</button>`;
      } else {
        actionHtml = `<span style="color: var(--danger); font-weight: 600;">Eliminated</span>`;
      }

      outRow.innerHTML = `
        <div class="player-input-header">
          <span>${p.name} (OUT)</span>
          <span>Score: ${p.total}</span>
        </div>
        ${actionHtml}
      `;
      container.appendChild(outRow);
    } else {
      // Active player row
      const row = document.createElement('div');
      row.className = 'player-input-row';
      row.innerHTML = `
        <div class="player-input-header">
          <span>${p.name}</span>
          <span>Total: ${p.total}</span>
        </div>
        <div class="score-buttons" id="btns-${p.id}">
          <button class="btn-primary" onclick="setScore('${p.id}', 0, this)">👑 0</button>
          <button class="btn-outline" onclick="setScore('${p.id}', 25, this)">🏳️ 25</button>
          <button class="btn-outline" onclick="setScore('${p.id}', 40, this)">🏃 40</button>
          <button class="btn-danger btn-outline" onclick="setScore('${p.id}', 80, this)">💀 80</button>
          <input type="number" min="0" max="80" class="btn-outline custom-input" placeholder="🔢 +" oninput="handleCustomScore('${p.id}', this)" />
        </div>
      `;
      container.appendChild(row);
      // default score empty
      currentRoundScores[p.id] = null;
    }
  });
}

function submitRound() {
  // Validate active players all have scores
  const activePlayers = players.filter(p => !p.isOut);
  for (let p of activePlayers) {
    if (currentRoundScores[p.id] === null || currentRoundScores[p.id] === undefined) {
      alert(`Please select or enter a score for ${p.name}.`);
      return;
    }
  }

  // Validate exactly one player has Rummy (0 points)
  let zeroCount = 0;
  for (let p of activePlayers) {
    if (currentRoundScores[p.id] === 0) zeroCount++;
  }
  
  if (zeroCount !== 1) {
    alert("Exactly one player must win the round with a Rummy (0 points). Please adjust the scores.");
    return;
  }
  
  // Apply scores
  players.forEach(p => {
    if (p.isOut) {
      p.scores.push('OUT'); // visual marker
    } else {
      const s = currentRoundScores[p.id];
      p.scores.push(s);
      p.total += s;
      
      if (p.total > ELIMINATION_SCORE) {
        p.isOut = true;
      }
    }
  });

  generateAnnouncements();
  
  roundCount++;
  saveState();
  renderGame();
}

/* --- HISTORY & PAUSING --- */
function pauseGame() {
  const currentId = localStorage.getItem('rummyCurrentId') || generateId();
  const paused = JSON.parse(localStorage.getItem('rummyPaused') || '[]');
  
  // Update or push
  const existingIdx = paused.findIndex(g => g.id === currentId);
  const gameObj = {
    id: currentId,
    date: new Date().toLocaleString(),
    players: JSON.parse(JSON.stringify(players)),
    roundCount: roundCount
  };
  
  if (existingIdx >= 0) paused[existingIdx] = gameObj;
  else paused.push(gameObj);
  localStorage.setItem('rummyPaused', JSON.stringify(paused));
  
  // Clear current active
  players = [];
  roundCount = 0;
  localStorage.removeItem('rummyCurrent');
  localStorage.removeItem('rummyCurrentId');
  
  document.getElementById('game-section').classList.add('hidden');
  document.getElementById('setup-section').classList.remove('hidden');
  renderSetupPlayerList();
  showLibraryTab('paused');
}

function resumeGame(id) {
  const paused = JSON.parse(localStorage.getItem('rummyPaused') || '[]');
  const gameIdx = paused.findIndex(g => g.id === id);
  if (gameIdx < 0) return;
  
  const game = paused[gameIdx];
  players = game.players;
  roundCount = game.roundCount;
  localStorage.setItem('rummyCurrentId', game.id);
  
  // Remove from paused
  paused.splice(gameIdx, 1);
  localStorage.setItem('rummyPaused', JSON.stringify(paused));
  saveState();
  
  document.getElementById('setup-section').classList.add('hidden');
  document.getElementById('game-section').classList.remove('hidden');
  renderGame();
}

function deletePausedGame(id) {
  const paused = JSON.parse(localStorage.getItem('rummyPaused') || '[]');
  const newPaused = paused.filter(g => g.id !== id);
  localStorage.setItem('rummyPaused', JSON.stringify(newPaused));
  showLibraryTab('paused'); // re-render
}

let currentLibraryTab = 'paused';

function showLibraryTab(tab) {
  currentLibraryTab = tab;
  
  const bPaused = document.getElementById('tab-paused');
  const bHistory = document.getElementById('tab-history');
  if (bPaused) bPaused.style.borderColor = tab === 'paused' ? 'var(--primary)' : 'var(--panel-border)';
  if (bHistory) bHistory.style.borderColor = tab === 'history' ? 'var(--primary)' : 'var(--panel-border)';
  
  const content = document.getElementById('library-content');
  if (!content) return;
  content.innerHTML = '';
  
  if (tab === 'paused') {
    const paused = JSON.parse(localStorage.getItem('rummyPaused') || '[]');
    if (paused.length === 0) {
      content.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No paused games.</p>';
      return;
    }
    
    paused.forEach(g => {
      const pNames = g.players.map(p => p.name).join(', ');
      const div = document.createElement('div');
      div.style.background = 'rgba(0,0,0,0.2)';
      div.style.padding = '1rem';
      div.style.borderRadius = '8px';
      div.style.marginBottom = '0.5rem';
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'center';
      
      div.innerHTML = `
        <div>
          <div style="font-weight: 600; margin-bottom:0.25rem;">Round ${g.roundCount}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">${pNames}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${g.date}</div>
        </div>
        <div style="display:flex; flex-direction: column; gap:0.5rem;">
          <button class="btn-success" style="padding: 0.5rem 1rem; border:none; border-radius:4px; font-weight:bold; cursor:pointer;" onclick="resumeGame('${g.id}')">▶️ Resume</button>
          <button class="btn-danger btn-outline" style="padding: 0.25rem; border:none; border-radius:4px; font-size:0.8rem; cursor:pointer;" onclick="deletePausedGame('${g.id}')">🗑️ Discard</button>
        </div>
      `;
      content.appendChild(div);
    });
  } else {
    // History
    const history = JSON.parse(localStorage.getItem('rummyHistory') || '[]');
    if (history.length === 0) {
      content.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No past matches yet.</p>';
      return;
    }
    
    const sorted = [...history].reverse();
    sorted.forEach(g => {
      let winner = g.players[0];
      g.players.forEach(p => { if(p.total < winner.total) winner = p; });
      
      // Build the mini-scorecard table
      const thead = '<th>Rnd</th>' + g.players.map(p => `<th>${p.name}</th>`).join('');
      let tbody = '';
      for (let i = 0; i < g.rounds; i++) {
        tbody += `<tr><td style="font-weight:600; color:var(--text-muted);">R${i + 1}</td>` + 
                 g.players.map(p => `<td>${getScoreDisplay(p.scores[i])}</td>`).join('') + 
                 `</tr>`;
      }
      const tfoot = '<th>Total</th>' + g.players.map(p => `<th style="color:${p.isOut ? 'var(--danger)' : 'var(--success)'}; text-decoration:${p.isOut ? 'line-through' : 'none'};">${p.total}</th>`).join('');
      
      const scorecardHtml = `
        <div class="table-wrapper" style="margin-top: 1rem; margin-bottom: 0;">
          <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.85rem;">
            <thead><tr style="border-bottom: 1px solid var(--panel-border);">${thead}</tr></thead>
            <tbody>${tbody}</tbody>
            <tfoot><tr>${tfoot}</tr></tfoot>
          </table>
        </div>
      `;
      
      const div = document.createElement('div');
      div.style.background = 'rgba(0,0,0,0.2)';
      div.style.padding = '1rem';
      div.style.borderRadius = '8px';
      div.style.marginBottom = '0.5rem';
      
      div.innerHTML = `
        <div style="font-weight: 600; color: var(--success); margin-bottom:0.25rem;">🏆 Winner: ${winner.name}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Rounds Played: ${g.rounds}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">${g.date}</div>
        <details>
          <summary style="cursor:pointer; font-size:0.85rem; color:var(--primary); font-weight:600;">View Full Round Details</summary>
          ${scorecardHtml}
        </details>
      `;
      content.appendChild(div);
    });
  }
}

function startNewGame() {
  const history = JSON.parse(localStorage.getItem('rummyHistory') || '[]');
  history.push({
    date: new Date().toLocaleString(),
    players: JSON.parse(JSON.stringify(players)),
    rounds: roundCount - 1
  });
  localStorage.setItem('rummyHistory', JSON.stringify(history));

  players = [];
  roundCount = 0;
  localStorage.removeItem('rummyCurrent');
  localStorage.removeItem('rummyCurrentId');
  
  document.getElementById('game-section').classList.add('hidden');
  document.getElementById('setup-section').classList.remove('hidden');
  
  renderSetupPlayerList();
  showLibraryTab('history');
}

/* --- UI AND ANNOUNCEMENTS --- */

// Map common scores to fun emojis
function getScoreDisplay(score) {
  if (score === 0) return '👑 Rummy';
  if (score === 25) return '🏳️ Drop';
  if (score === 40) return '🏃 M-Drop';
  if (score === 80) return '💀 Full Count';
  if (score === 'OUT') return '❌ OUT';
  if (score === null || score === undefined) return '-';
  return `🔢 ${score}`;
}

function renderScorecard() {
  const thead = document.getElementById('table-headers');
  const tbody = document.getElementById('table-body');
  const tfoot = document.getElementById('table-totals');
  
  // Headers
  thead.innerHTML = '<th>Round</th>';
  players.forEach(p => {
    thead.innerHTML += `<th class="${p.isOut ? 'th-out' : ''}">${p.name}</th>`;
  });
  
  // Body (Rounds)
  tbody.innerHTML = '';
  for (let i = 0; i < roundCount - 1; i++) {
    let tr = `<tr><td>R${i + 1}</td>`;
    players.forEach(p => {
      tr += `<td>${getScoreDisplay(p.scores[i])}</td>`;
    });
    tr += `</tr>`;
    tbody.innerHTML += tr;
  }
  
  // Foot (Totals)
  tfoot.innerHTML = '<th>Total</th>';
  players.forEach(p => {
    tfoot.innerHTML += `<th class="${p.isOut ? 'th-out' : 'th-highlight'}">${p.total}</th>`;
  });
}

const CELEBRATION_SLOGANS = [
  "Absolutely crushing it today!",
  "Taking names and winning games!",
  "Unstoppable force of nature!",
  "Is this Rummy or a masterclass?"
];

const WORRIED_SLOGANS = [
  "Sweating bullets right now!",
  "Dangerously close to the edge...",
  "Might need to remortgage the house.",
  "Praying for a good hand!"
];

function generateAnnouncements() {
  const activePlayers = players.filter(p => !p.isOut);
  if (activePlayers.length === 0) return;
  
  let bestPlayer = activePlayers[0];
  let worstPlayer = activePlayers[0];

  activePlayers.forEach(p => {
    if (p.total < bestPlayer.total) bestPlayer = p;
    if (p.total > worstPlayer.total) worstPlayer = p;
  });

  const banner = document.getElementById('announcement-banner');
  const img = document.getElementById('announcement-img');
  const title = document.getElementById('announcement-title');
  const desc = document.getElementById('announcement-desc');
  
  // Randomly decide whether to praise the leader or tease the loser (if they differ)
  if (bestPlayer.id === worstPlayer.id || Math.random() > 0.5) {
    // Show best
    img.src = CELEBRATION_IMG;
    title.innerText = `🌟 Leader: ${bestPlayer.name}`;
    desc.innerText = `Score: ${bestPlayer.total}. ` + CELEBRATION_SLOGANS[Math.floor(Math.random() * CELEBRATION_SLOGANS.length)];
    banner.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(59,130,246,0.2))';
    banner.style.borderColor = 'rgba(16,185,129,0.3)';
  } else {
    // Show worst
    img.src = WORRIED_IMG;
    title.innerText = `🔥 Danger Zone: ${worstPlayer.name}`;
    desc.innerText = `Score: ${worstPlayer.total}. ` + WORRIED_SLOGANS[Math.floor(Math.random() * WORRIED_SLOGANS.length)];
    banner.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(245,158,11,0.2))';
    banner.style.borderColor = 'rgba(239,68,68,0.3)';
  }

  // Trigger animation reset
  banner.classList.remove('hidden');
  banner.classList.remove('banner-animate');
  void banner.offsetWidth; // trigger reflow
  banner.classList.add('banner-animate');
}
