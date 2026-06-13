import { TARGET_WORDS, VALID_GUESSES } from './words.js';

// Epoch for Daily Wordle (June 19, 2021)
const EPOCH = new Date(2021, 5, 19, 0, 0, 0, 0);

// Global Application State
const state = {
  mode: 'daily',
  targetWord: '',
  dayIndex: 0,
  guesses: [],
  currentGuess: '',
  gameStatus: 'IN_PROGRESS', // 'IN_PROGRESS', 'WON', 'LOST'
  settings: {
    hardMode: false,
    darkTheme: true,
    highContrast: false,
  },
  stats: {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    guesses: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  }
};

// UI Elements
const board = document.getElementById('board');
const helpDialog = document.getElementById('help-dialog');
const statsDialog = document.getElementById('stats-dialog');
const settingsDialog = document.getElementById('settings-dialog');
const toastContainer = document.getElementById('toast-container');

// DOM elements for stats display
const statPlayed = document.getElementById('stat-played');
const statWinPct = document.getElementById('stat-win-pct');
const statStreak = document.getElementById('stat-streak');
const statMaxStreak = document.getElementById('stat-max-streak');
const guessDistribution = document.getElementById('guess-distribution');

// Timer ID for the countdown clock
let countdownTimerId = null;

// Initialize App
function init() {
  loadSettings();
  loadStats();
  setupTheme();
  setupDialogs();
  setupSettingsListeners();
  
  // Clean hash if practice was there
  if (window.location.hash) {
    window.location.hash = '';
  }
  
  buildBoard();
  initDailyGame();
  
  // Build keyboard layout
  buildKeyboard();
  
  // Set focus to body to capture keypresses
  document.body.focus();
}

// Setup Dialog Triggers and Fallbacks
function setupDialogs() {
  document.getElementById('btn-help').addEventListener('click', () => helpDialog.showModal());
  document.getElementById('btn-stats').addEventListener('click', () => {
    updateStatsDialog();
    statsDialog.showModal();
    startCountdown();
  });
  document.getElementById('btn-settings').addEventListener('click', () => settingsDialog.showModal());
  
  // Manage countdown lifecycle on dialog close
  statsDialog.addEventListener('close', stopCountdown);

  // Fallback for light-dismiss (clicking backdrop) in browsers without native support (Safari)
  [helpDialog, statsDialog, settingsDialog].forEach(dialog => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isDialogContent) {
          dialog.close();
        }
      });
    }
  });

  // Action buttons inside modals
  document.getElementById('btn-share').addEventListener('click', shareResult);
}

// Keyboard Layout Builder
function buildKeyboard() {
  const row1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const row2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const row3 = ['ENTER', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'BACKSPACE'];
  
  const createKey = (char) => {
    const btn = document.createElement('button');
    btn.classList.add('keyboard-key');
    btn.setAttribute('data-key', char.toLowerCase());
    
    if (char === 'ENTER') {
      btn.classList.add('wide-key');
      btn.textContent = 'ENTER';
    } else if (char === 'BACKSPACE') {
      btn.classList.add('wide-key');
      btn.innerHTML = '<i class="fa-solid fa-delete-left" aria-label="Backspace"></i>';
      btn.setAttribute('data-key', 'backspace');
    } else {
      btn.textContent = char.toUpperCase();
    }
    
    btn.addEventListener('click', () => handleInput(btn.getAttribute('data-key')));
    return btn;
  };

  const container1 = document.getElementById('kb-row-1');
  const container2 = document.getElementById('kb-row-2');
  const container3 = document.getElementById('kb-row-3');
  
  container1.innerHTML = '';
  container2.innerHTML = '';
  container3.innerHTML = '';

  row1.forEach(c => container1.appendChild(createKey(c)));
  row2.forEach(c => container2.appendChild(createKey(c)));
  row3.forEach(c => container3.appendChild(createKey(c)));
}

// Reset Keyboard Styles between games/modes
function resetKeyboardStyles() {
  document.querySelectorAll('.keyboard-key').forEach(key => {
    key.className = 'keyboard-key';
    if (key.getAttribute('data-key') === 'enter' || key.getAttribute('data-key') === 'backspace') {
      key.classList.add('wide-key');
    }
  });
}

// Update Keyboard Key Color State (Correct > Present > Absent)
function updateKeyStyle(char, stateClass) {
  const key = document.querySelector(`.keyboard-key[data-key="${char}"]`);
  if (!key) return;

  if (key.classList.contains('state-correct')) return; // Correct is absolute top
  if (key.classList.contains('state-present') && stateClass === 'state-absent') return; // Yellow beats Grey
  
  key.classList.remove('state-present', 'state-absent');
  key.classList.add(stateClass);
}

// Render Wordle Grid (6x5)
function buildBoard() {
  board.innerHTML = '';
  for (let r = 0; r < 6; r++) {
    const rowDiv = document.createElement('div');
    rowDiv.classList.add('board-row');
    rowDiv.setAttribute('data-row-index', r);
    rowDiv.setAttribute('role', 'row');
    
    for (let c = 0; c < 5; c++) {
      const tileDiv = document.createElement('div');
      tileDiv.classList.add('tile');
      tileDiv.setAttribute('data-col-index', c);
      tileDiv.setAttribute('role', 'gridcell');
      tileDiv.setAttribute('aria-label', `Row ${r + 1}, Column ${c + 1}: Empty`);
      rowDiv.appendChild(tileDiv);
    }
    board.appendChild(rowDiv);
  }
}

// Load current grid cells based on loaded guesses
function populateBoardFromState() {
  const rows = board.querySelectorAll('.board-row');
  
  // Fill in past guesses
  state.guesses.forEach((guess, rIndex) => {
    const cells = rows[rIndex].querySelectorAll('.tile');
    const colors = getLetterColors(guess, state.targetWord);
    
    cells.forEach((tile, cIndex) => {
      const char = guess[cIndex];
      tile.textContent = char.toUpperCase();
      tile.classList.add('flip');
      
      // Since it's loaded state, complete the color reveal immediately
      const colorClass = `state-${colors[cIndex]}`;
      tile.classList.add(colorClass);
      
      // Set aria labels
      tile.setAttribute('aria-label', `Row ${rIndex + 1}, Column ${cIndex + 1}: ${char.toUpperCase()}, ${colors[cIndex]}`);
      
      // Sync keyboard
      updateKeyStyle(char, colorClass);
    });
  });

  // If game is active, populate the active editing row (if any)
  if (state.gameStatus === 'IN_PROGRESS' && state.guesses.length < 6) {
    const activeRowIndex = state.guesses.length;
    const cells = rows[activeRowIndex].querySelectorAll('.tile');
    
    for (let cIndex = 0; cIndex < 5; cIndex++) {
      const char = state.currentGuess[cIndex] || '';
      cells[cIndex].textContent = char.toUpperCase();
      if (char) {
        cells[cIndex].classList.add('pop');
        cells[cIndex].setAttribute('aria-label', `Row ${activeRowIndex + 1}, Column ${cIndex + 1}: ${char.toUpperCase()}`);
      } else {
        cells[cIndex].classList.remove('pop');
        cells[cIndex].setAttribute('aria-label', `Row ${activeRowIndex + 1}, Column ${cIndex + 1}: Empty`);
      }
    }
  }
}

// Initialize Daily Puzzle State
function initDailyGame() {
  // 1. Calculate Daily Word
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  state.dayIndex = Math.floor((todayMidnight - EPOCH) / (24 * 60 * 60 * 1000));
  
  const wordIndex = state.dayIndex % TARGET_WORDS.length;
  state.targetWord = TARGET_WORDS[wordIndex];
  
  // 2. Load stored Daily state
  const storedState = localStorage.getItem('wordle_daily_state');
  const dateString = todayMidnight.toDateString();
  
  if (storedState) {
    const saved = JSON.parse(storedState);
    if (saved.dateString === dateString) {
      state.guesses = saved.guesses || [];
      state.gameStatus = saved.gameStatus || 'IN_PROGRESS';
      state.currentGuess = '';
      
      populateBoardFromState();
      
      if (state.gameStatus !== 'IN_PROGRESS') {
        setTimeout(() => {
          updateStatsDialog();
          statsDialog.showModal();
          startCountdown();
        }, 800);
      }
      return;
    }
  }
  
  // If no saved state or it's a new day, clear state
  state.guesses = [];
  state.currentGuess = '';
  state.gameStatus = 'IN_PROGRESS';
  saveGameState();
  populateBoardFromState();
  
  // Proactively show help dialog for new players
  if (!localStorage.getItem('wordle_returning_player')) {
    helpDialog.showModal();
    localStorage.setItem('wordle_returning_player', 'true');
  }
}

// Input Controllers (Hardware & Soft Keyboards)
function handleInput(key) {
  if (state.gameStatus !== 'IN_PROGRESS') return;
  
  if (key === 'enter') {
    submitGuess();
  } else if (key === 'backspace' || key === 'back') {
    deleteLetter();
  } else if (/^[a-z]$/.test(key)) {
    insertLetter(key);
  }
}

// Physical keyboard event listener
document.addEventListener('keydown', (e) => {
  // Ignore typing if modal dialogs are open
  if (helpDialog.open || statsDialog.open || settingsDialog.open) return;
  
  // Control key triggers
  if (e.key === 'Enter') {
    handleInput('enter');
  } else if (e.key === 'Backspace') {
    handleInput('backspace');
  } else {
    handleInput(e.key.toLowerCase());
  }
});

function insertLetter(char) {
  if (state.currentGuess.length >= 5) return;
  
  state.currentGuess += char;
  
  // Render letter in cell
  const rowIndex = state.guesses.length;
  const colIndex = state.currentGuess.length - 1;
  const activeRow = board.querySelectorAll('.board-row')[rowIndex];
  const tile = activeRow.querySelectorAll('.tile')[colIndex];
  
  tile.textContent = char.toUpperCase();
  tile.classList.add('pop');
  tile.setAttribute('aria-label', `Row ${rowIndex + 1}, Column ${colIndex + 1}: ${char.toUpperCase()}`);
}

function deleteLetter() {
  if (state.currentGuess.length === 0) return;
  
  const rowIndex = state.guesses.length;
  const colIndex = state.currentGuess.length - 1;
  const activeRow = board.querySelectorAll('.board-row')[rowIndex];
  const tile = activeRow.querySelectorAll('.tile')[colIndex];
  
  tile.textContent = '';
  tile.classList.remove('pop');
  tile.setAttribute('aria-label', `Row ${rowIndex + 1}, Column ${colIndex + 1}: Empty`);
  
  state.currentGuess = state.currentGuess.slice(0, -1);
}

// Submit and evaluate active guess
function submitGuess() {
  const guess = state.currentGuess;
  
  // 1. Length constraint
  if (guess.length < 5) {
    showToast('Not enough letters');
    shakeActiveRow();
    return;
  }
  
  // 2. Dictionary verification
  if (!VALID_GUESSES.includes(guess)) {
    showToast('Not in word list');
    shakeActiveRow();
    return;
  }
  
  // 3. Hard Mode verification
  if (state.settings.hardMode && state.guesses.length > 0) {
    const errorMsg = validateHardModeConstraints(guess);
    if (errorMsg) {
      showToast(errorMsg);
      shakeActiveRow();
      return;
    }
  }
  
  // Lock guess input while revealing flip animations
  state.gameStatus = 'ANIMATING'; 
  state.guesses.push(guess);
  state.currentGuess = '';
  
  const rowIndex = state.guesses.length - 1;
  const activeRow = board.querySelectorAll('.board-row')[rowIndex];
  const cells = activeRow.querySelectorAll('.tile');
  const colors = getLetterColors(guess, state.targetWord);
  
  // Execute sequential 3D Flip animations (250ms offset for each tile)
  cells.forEach((tile, cIndex) => {
    tile.style.animationDelay = `${cIndex * 150}ms`;
    tile.classList.add('flip');
    
    // Halfway through flip (approx 250ms), apply colors and values
    setTimeout(() => {
      const colorClass = `state-${colors[cIndex]}`;
      tile.classList.add(colorClass);
      tile.setAttribute('aria-label', `Row ${rowIndex + 1}, Column ${cIndex + 1}: ${guess[cIndex].toUpperCase()}, ${colors[cIndex]}`);
      
      // Update Keyboard key coloring
      updateKeyStyle(guess[cIndex], colorClass);
    }, cIndex * 150 + 250);
  });
  
  // Final evaluation after all 5 cells flip completely (approx 5 * 150 + 500 = 1250ms)
  setTimeout(() => {
    evaluateGameResolution(guess);
  }, 5 * 150 + 500);
}

// Calculate Correct, Present, Absent states for Wordle guess
function getLetterColors(guess, target) {
  const states = Array(5).fill('absent');
  const targetLetters = target.split('');
  
  // Pass 1: Correct letters (Green)
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      states[i] = 'correct';
      targetLetters[i] = null;
    }
  }
  
  // Pass 2: Present letters (Yellow)
  for (let i = 0; i < 5; i++) {
    if (states[i] !== 'correct') {
      const char = guess[i];
      const indexInTarget = targetLetters.indexOf(char);
      if (indexInTarget !== -1) {
        states[i] = 'present';
        targetLetters[indexInTarget] = null;
      }
    }
  }
  
  return states;
}

// Hard Mode Validator logic
function validateHardModeConstraints(guess) {
  const target = state.targetWord;
  const lastGuess = state.guesses[state.guesses.length - 1];
  const lastColors = getLetterColors(lastGuess, target);
  
  // Requirement 1: Any green letters must be used in the exact same spot
  for (let i = 0; i < 5; i++) {
    if (lastColors[i] === 'correct' && guess[i] !== lastGuess[i]) {
      const posName = ['1st', '2nd', '3rd', '4th', '5th'][i];
      return `${posName} letter must be ${lastGuess[i].toUpperCase()}`;
    }
  }
  
  // Requirement 2: Any yellow letters must be used somewhere in the guess
  const guessLetters = guess.split('');
  for (let i = 0; i < 5; i++) {
    if (lastColors[i] === 'present') {
      const neededChar = lastGuess[i];
      const foundIndex = guessLetters.indexOf(neededChar);
      
      if (foundIndex === -1) {
        return `Must contain ${neededChar.toUpperCase()}`;
      }
      
      // Consume the letter to handle duplicates properly
      guessLetters[foundIndex] = null;
    }
  }
  
  return null;
}

// Evaluate Win or Lose outcomes
function evaluateGameResolution(guess) {
  if (guess === state.targetWord) {
    state.gameStatus = 'WON';
    triggerConfetti();
    updateStats(true);
    saveGameState();
    
    // Custom celebratory toasts
    const winToasts = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
    const idx = state.guesses.length - 1;
    showToast(winToasts[idx]);
    
    setTimeout(() => {
      updateStatsDialog();
      statsDialog.showModal();
      if (state.mode === 'daily') startCountdown();
    }, 1200);
  } else if (state.guesses.length >= 6) {
    state.gameStatus = 'LOST';
    updateStats(false);
    saveGameState();
    showToast(state.targetWord.toUpperCase(), 3500);
    
    setTimeout(() => {
      updateStatsDialog();
      statsDialog.showModal();
      if (state.mode === 'daily') startCountdown();
    }, 2000);
  } else {
    // Game continues
    state.gameStatus = 'IN_PROGRESS';
    saveGameState();
  }
}

// Toast alerts helper
function showToast(message, duration = 1500) {
  const toast = document.createElement('div');
  toast.classList.add('toast');
  toast.textContent = message;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}

// Shake animation helper for active board row
function shakeActiveRow() {
  const rowIndex = state.guesses.length;
  const activeRow = board.querySelectorAll('.board-row')[rowIndex];
  if (!activeRow) return;
  
  activeRow.classList.add('shake');
  activeRow.addEventListener('animationend', () => {
    activeRow.classList.remove('shake');
  }, { once: true });
}

// Trigger Confetti effects
function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

/* LocalStorage Persistence & Settings */
function loadSettings() {
  const stored = localStorage.getItem('wordle_settings');
  if (stored) {
    state.settings = JSON.parse(stored);
  } else {
    // Default to dark theme if user's system prefers it
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    state.settings.darkTheme = !prefersLight;
  }
}

function saveSettings() {
  localStorage.setItem('wordle_settings', JSON.stringify(state.settings));
}

function loadStats() {
  const stored = localStorage.getItem('wordle_stats');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migration from old schema (which had separate daily/practice records)
      if (parsed && parsed.daily) {
        state.stats = parsed.daily;
        saveStats(); // Save migrated schema back to localStorage
      } else {
        state.stats = parsed;
      }
    } catch (e) {
      console.error('Failed to parse stats:', e);
    }
  }
}

function saveStats() {
  localStorage.setItem('wordle_stats', JSON.stringify(state.stats));
}

function saveGameState() {
  const todayMidnight = new Date();
  const dateString = new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), todayMidnight.getDate()).toDateString();
  
  const data = {
    dateString,
    guesses: state.guesses,
    gameStatus: state.gameStatus
  };
  localStorage.setItem('wordle_daily_state', JSON.stringify(data));
}

// Apply visual themes based on settings
function setupTheme() {
  const body = document.body;
  
  // Theme toggle slider
  const chkDark = document.getElementById('setting-dark-theme');
  chkDark.checked = state.settings.darkTheme;
  
  if (state.settings.darkTheme) {
    body.classList.remove('light-theme');
  } else {
    body.classList.add('light-theme');
  }
  
  // High contrast mode slider
  const chkContrast = document.getElementById('setting-high-contrast');
  chkContrast.checked = state.settings.highContrast;
  
  if (state.settings.highContrast) {
    body.classList.add('high-contrast');
  } else {
    body.classList.remove('high-contrast');
  }

  // Hard mode checkbox
  const chkHard = document.getElementById('setting-hard-mode');
  chkHard.checked = state.settings.hardMode;
}

function setupSettingsListeners() {
  const chkDark = document.getElementById('setting-dark-theme');
  const chkContrast = document.getElementById('setting-high-contrast');
  const chkHard = document.getElementById('setting-hard-mode');
  
  chkDark.addEventListener('change', (e) => {
    state.settings.darkTheme = e.target.checked;
    saveSettings();
    setupTheme();
  });
  
  chkContrast.addEventListener('change', (e) => {
    state.settings.highContrast = e.target.checked;
    saveSettings();
    setupTheme();
  });
  
  chkHard.addEventListener('change', (e) => {
    // If game has started, prevent setting changes midway
    if (state.guesses.length > 0 && state.gameStatus === 'IN_PROGRESS') {
      showToast("Hard mode can only be enabled at the start of a game");
      e.target.checked = state.settings.hardMode; // revert check
      return;
    }
    
    state.settings.hardMode = e.target.checked;
    saveSettings();
  });
}

// Update Statistics database
function updateStats(won) {
  const activeStats = state.stats;
  
  activeStats.played += 1;
  if (won) {
    activeStats.wins += 1;
    activeStats.currentStreak += 1;
    if (activeStats.currentStreak > activeStats.maxStreak) {
      activeStats.maxStreak = activeStats.currentStreak;
    }
    const attempts = state.guesses.length;
    activeStats.guesses[attempts] = (activeStats.guesses[attempts] || 0) + 1;
  } else {
    activeStats.currentStreak = 0;
  }
  
  saveStats();
}

// Format Statistics panels inside Dialog Modal
function updateStatsDialog() {
  const activeStats = state.stats;

  // Render numbers
  statPlayed.textContent = activeStats.played;
  const pct = activeStats.played > 0 ? Math.round((activeStats.wins / activeStats.played) * 100) : 0;
  statWinPct.textContent = pct;
  statStreak.textContent = activeStats.currentStreak;
  statMaxStreak.textContent = activeStats.maxStreak;

  // Render guess distribution bar sizes
  let maxGuessVal = 0;
  for (let i = 1; i <= 6; i++) {
    const val = activeStats.guesses[i] || 0;
    if (val > maxGuessVal) maxGuessVal = val;
  }

  const distRows = guessDistribution.querySelectorAll('.dist-row');
  
  for (let i = 1; i <= 6; i++) {
    const bar = distRows[i - 1].querySelector('.dist-bar');
    const val = activeStats.guesses[i] || 0;
    
    bar.textContent = val;
    
    // Highlight winning row if game resolved in this dialog check
    const isWinRow = state.gameStatus === 'WON' && state.guesses.length === i;
    if (isWinRow) {
      bar.classList.add('highlight');
    } else {
      bar.classList.remove('highlight');
    }
    
    // Calculate percentage width relative to the max count
    const pctWidth = maxGuessVal > 0 ? (val / maxGuessVal) * 100 : 0;
    // Set width and minimum width for aesthetics
    bar.style.width = maxGuessVal > 0 ? `calc(${pctWidth}% + 12px)` : '8%';
  }
}

// Countdown Clock for Daily Puzzle
function startCountdown() {
  stopCountdown();
  updateCountdown();
  countdownTimerId = setInterval(updateCountdown, 1000);
}

function stopCountdown() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
}

function updateCountdown() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const diffMs = tomorrow - now;
  
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diffMs % (60 * 1000)) / 1000);
  
  const formatted = [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0')
  ].join(':');
  
  const el = document.getElementById('next-wordle-timer');
  if (el) el.textContent = formatted;
}

// Share emoji grid representation to Clipboard
function shareResult() {
  if (state.gameStatus === 'IN_PROGRESS') return;
  
  const headerText = `Wordle ${state.dayIndex} ${state.gameStatus === 'WON' ? state.guesses.length : 'X'}/6`;
  
  const gridEmojis = state.guesses.map(guess => {
    const colors = getLetterColors(guess, state.targetWord);
    return colors.map(c => {
      if (c === 'correct') {
        return state.settings.highContrast ? '🟧' : '🟩';
      } else if (c === 'present') {
        return state.settings.highContrast ? '🟦' : '🟨';
      } else {
        return state.settings.darkTheme ? '⬛' : '⬜';
      }
    }).join('');
  }).join('\n');

  const shareText = `${headerText}\n\n${gridEmojis}\n\nPlay here: ${window.location.origin}${window.location.pathname}`;

  // Use Clipboard API if available, fallback to textarea copy
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => fallbackShareCopy(shareText));
  } else {
    fallbackShareCopy(shareText);
  }
}

function fallbackShareCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed'; // prevent scroll placement
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy text: ', err);
    showToast('Failed to copy stats');
  }
  document.body.removeChild(textarea);
}

// Start App Lifecycle
window.addEventListener('DOMContentLoaded', init);

// Register Service Worker for offline play and PWA installability
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}
