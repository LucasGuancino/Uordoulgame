const firebaseConfig = {
    apiKey: "AIzaSyDaP9ht_uvJmAPnerHWb-yv0MLoSZBr_0w",
    authDomain: "uordoul.firebaseapp.com",
    projectId: "uordoul",
    storageBucket: "uordoul.firebasestorage.app",
    messagingSenderId: "263347613669",
    appId: "1:263347613669:web:4e2f470bf13f701f2f490c"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const UORDOUL_START_DATE = new Date('2026-04-02T00:00:00');
const MULTI_MODE_START_DATE = new Date('2026-09-08T00:00:00');
const POINTS_TABLE = { 1: 700, 2: 500, 3: 400, 4: 300, 5: 200, 6: 100 };
const RESULT_STRENGTH = { absent: 1, present: 2, correct: 3 };

const MODES = {
    uordoul: {
        name: 'Uordoul',
        title: 'UORDOUL',
        boards: 1,
        attempts: 6,
        startLine: 1,
        startDate: UORDOUL_START_DATE,
        stateKey: 'uordoulState',
        pointsField: 'pontos',
        eloField: 'elo',
        lastDayField: 'ultimoDiaJogado',
        gamesField: 'jogosJogados',
        winsField: 'vitorias'
    },
    duordoul: {
        name: 'DUOrdoul',
        title: 'DUORDOUL',
        boards: 2,
        attempts: 7,
        startLine: 2000,
        startDate: MULTI_MODE_START_DATE,
        stateKey: 'duordoulState',
        pointsField: 'pontosDuordoul',
        eloField: 'eloDuordoul',
        lastDayField: 'ultimoDiaJogadoDuordoul',
        gamesField: 'jogosJogadosDuordoul',
        winsField: 'vitoriasDuordoul'
    },
    fourdoul: {
        name: 'FOURdoul',
        title: 'FOURDOUL',
        boards: 4,
        attempts: 9,
        startLine: 4000,
        startDate: MULTI_MODE_START_DATE,
        stateKey: 'fourdoulState',
        pointsField: 'pontosFourdoul',
        eloField: 'eloFourdoul',
        lastDayField: 'ultimoDiaJogadoFourdoul',
        gamesField: 'jogosJogadosFourdoul',
        winsField: 'vitoriasFourdoul'
    }
};

const RANKS = [
    { name: 'Sem Rank Ativo', min: 0, max: 100 },
    { name: 'Prata 1', min: 100, max: 400 },
    { name: 'Prata 2', min: 400, max: 800 },
    { name: 'Prata 3', min: 800, max: 1100 },
    { name: 'Prata Elite', min: 1100, max: 1700 },
    { name: 'Prata Elite Mestre', min: 1700, max: 2200 },
    { name: 'Ouro 1', min: 2200, max: 2800 },
    { name: 'Ouro 2', min: 2800, max: 3300 },
    { name: 'Ouro 3', min: 3300, max: 3800 },
    { name: 'Ouro Master', min: 3800, max: 4400 },
    { name: 'Guardião Master 1', min: 4400, max: 5100 },
    { name: 'Guardião Master 2', min: 5100, max: 5900 },
    { name: 'Guardião Master Elite', min: 5900, max: 6700 },
    { name: 'Xerife', min: 6700, max: 7400 },
    { name: 'Águia Lendária 1', min: 7400, max: 8100 },
    { name: 'Águia Lendária 2', min: 8100, max: 9000 },
    { name: 'Supremo Master Primeira Classe', min: 9000, max: 10000 },
    { name: 'The Global Elite', min: 10000, max: 999999999 }
];

let validWordsMap = {};
let validWords = [];
let targetWords = [];
let solvedBoards = [];
let boardScores = [];
let currentAttempt = 0;
let currentTile = 0;
let gameOver = false;
let diffInDays = 0;
let currentUser = null;
let currentLeaderboardMode = 'general';

const requestedMode = new URLSearchParams(window.location.search).get('mode');
const currentModeKey = MODES[requestedMode] ? requestedMode : 'uordoul';
const mode = MODES[currentModeKey];

function normalizar(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function getRankDetails(points) {
    return RANKS.find(rank => points >= rank.min && points < rank.max) || RANKS[RANKS.length - 1];
}

function getRankImageName(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '') + '.png';
}

function modeUrl(modeKey) {
    return modeKey === 'uordoul' ? 'index.html' : `index.html?mode=${modeKey}`;
}

function setupNavigation() {
    document.title = mode.name;
    document.getElementById('game-title').innerText = mode.title;

    document.querySelectorAll('.nav-item[data-mode]').forEach(button => {
        if (button.dataset.mode === currentModeKey) button.classList.add('active');
        button.onclick = () => window.location.href = modeUrl(button.dataset.mode);
    });

    const menu = document.getElementById('game-nav');
    const toggle = document.getElementById('menu-toggle');
    toggle.onclick = () => {
        const isOpen = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    };

    document.querySelector('.nav-item[data-action="leaderboard"]').onclick = () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        loadLeaderboard('general');
    };
}

function setupUserProfile(elo = 'Carregando...') {
    if (!currentUser) return;
    document.getElementById('user-avatar').src = currentUser.photoURL || '';
    document.getElementById('user-name').innerText = currentUser.displayName || 'Jogador';
    document.getElementById('user-rank').innerText = elo;
}

async function ensureUserDocument() {
    const ref = db.collection('usuarios').doc(currentUser.uid);
    const doc = await ref.get();

    if (!doc.exists) {
        const initialData = {
            nome: currentUser.displayName || 'Jogador',
            avatar: currentUser.photoURL || '',
            pontos: 0,
            elo: 'Sem Rank Ativo',
            ultimoDiaJogado: -1,
            jogosJogados: 0,
            vitorias: 0,
            pontosDuordoul: 0,
            eloDuordoul: 'Sem Rank Ativo',
            ultimoDiaJogadoDuordoul: -1,
            jogosJogadosDuordoul: 0,
            vitoriasDuordoul: 0,
            pontosFourdoul: 0,
            eloFourdoul: 'Sem Rank Ativo',
            ultimoDiaJogadoFourdoul: -1,
            jogosJogadosFourdoul: 0,
            vitoriasFourdoul: 0
        };
        await ref.set(initialData);
        return initialData;
    }

    const data = doc.data();
    const defaults = {
        pontosDuordoul: 0,
        eloDuordoul: 'Sem Rank Ativo',
        ultimoDiaJogadoDuordoul: -1,
        jogosJogadosDuordoul: 0,
        vitoriasDuordoul: 0,
        pontosFourdoul: 0,
        eloFourdoul: 'Sem Rank Ativo',
        ultimoDiaJogadoFourdoul: -1,
        jogosJogadosFourdoul: 0,
        vitoriasFourdoul: 0
    };

    const missing = {};
    Object.entries(defaults).forEach(([key, value]) => {
        if (data[key] === undefined) missing[key] = value;
    });
    if (Object.keys(missing).length) await ref.update(missing);
    return { ...defaults, ...data };
}

async function checkIfAlreadyPlayed() {
    if (!currentUser) return;
    const userData = await ensureUserDocument();
    const points = userData[mode.pointsField] || 0;
    const elo = userData[mode.eloField] || getRankDetails(points).name;
    setupUserProfile(elo);

    if (userData[mode.lastDayField] === diffInDays) {
        gameOver = true;
        showResultModal(
            solvedBoards.every(Boolean),
            0,
            points,
            getRankDetails(points),
            userData[mode.gamesField] || 0,
            userData[mode.winsField] || 0,
            true
        );
    }
}

function startAuthListener() {
    auth.onAuthStateChanged(async user => {
        if (user) {
            currentUser = user;
            document.getElementById('login-modal').classList.add('hidden');
            document.getElementById('profile').classList.remove('hidden');
            await checkIfAlreadyPlayed();
        } else {
            currentUser = null;
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('profile').classList.add('hidden');
        }
    });
}

document.getElementById('google-login-btn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error(error));
};

document.getElementById('logout-btn').onclick = () => auth.signOut();

function pointsForSolvedAttempt(attemptNumber) {
    return POINTS_TABLE[Math.min(attemptNumber, 6)] || POINTS_TABLE[6];
}

function calculateLossPoints(guess, target) {
    let greens = 0;
    let yellows = 0;
    const guessLetters = normalizar(guess).split('');
    const targetLetters = normalizar(target).split('');

    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            greens++;
            targetLetters[i] = null;
            guessLetters[i] = null;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] !== null && targetLetters.includes(guessLetters[i])) {
            yellows++;
            targetLetters[targetLetters.indexOf(guessLetters[i])] = null;
        }
    }

    if (greens === 4) return -100;
    if (greens === 3) return -150;
    if (greens === 2) return -200;
    if (greens === 1) return -300;
    if (yellows === 5 && greens === 0) return -500;
    if (greens === 0 && yellows === 0) return -800;
    return -400;
}

async function finalizeGame(pointsChange, isWin) {
    if (!currentUser) return;

    const userRef = db.collection('usuarios').doc(currentUser.uid);
    const doc = await userRef.get();
    if (!doc.exists) return;

    const data = doc.data();
    const oldPoints = data[mode.pointsField] || 0;
    const oldElo = data[mode.eloField] || getRankDetails(oldPoints).name;
    const newPoints = Math.max(0, oldPoints + pointsChange);
    const rank = getRankDetails(newPoints);
    const games = (data[mode.gamesField] || 0) + 1;
    const wins = (data[mode.winsField] || 0) + (isWin ? 1 : 0);

    await userRef.update({
        [mode.pointsField]: newPoints,
        [mode.eloField]: rank.name,
        [mode.lastDayField]: diffInDays,
        [mode.gamesField]: games,
        [mode.winsField]: wins,
        nome: currentUser.displayName || data.nome || 'Jogador',
        avatar: currentUser.photoURL || data.avatar || ''
    });

    setupUserProfile(rank.name);
    showResultModal(isWin, pointsChange, newPoints, rank, games, wins, false, oldElo);
}

function getUnsolvedWordsText() {
    const words = targetWords.filter((_, index) => !solvedBoards[index]);
    if (!words.length) return '';
    return words.length === 1 ? `A palavra era: ${words[0]}` : `As palavras eram: ${words.join(' • ')}`;
}

function showResultModal(isWin, pointsChange, totalPoints, rankDetails, jogos, vitorias, alreadyPlayed = false, oldElo = null) {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    title.innerText = isWin ? 'Vitória!' : (alreadyPlayed ? `${mode.name} de hoje concluído` : getUnsolvedWordsText());

    const rankIcon = document.getElementById('result-rank-icon');
    const oldIndex = RANKS.findIndex(rank => rank.name === oldElo);
    const newIndex = RANKS.findIndex(rank => rank.name === rankDetails.name);

    if (oldElo && newIndex > oldIndex) {
        rankIcon.src = `assets/${getRankImageName(oldElo)}`;
        setTimeout(() => {
            const sound = new Audio('assets/xpsound.mp3');
            sound.volume = 0.6;
            sound.play().catch(() => {});
            rankIcon.classList.add('rank-up-anim');
            setTimeout(() => { rankIcon.src = `assets/${getRankImageName(rankDetails.name)}`; }, 750);
        }, 800);
    } else {
        rankIcon.src = `assets/${getRankImageName(rankDetails.name)}`;
    }

    const changeText = document.getElementById('result-points-change');
    changeText.innerText = `${pointsChange > 0 ? '+' : ''}${pointsChange} pts`;
    changeText.className = pointsChange >= 0 ? 'positive-text' : 'negative-text';

    const nextRank = RANKS[newIndex + 1];
    const totalText = document.getElementById('result-points-total');
    totalText.innerText = nextRank
        ? `Faltam ${Math.max(0, nextRank.min - totalPoints)} pts para ${nextRank.name}`
        : `Total: ${totalPoints} pts (Rank Máximo)`;

    const baseFill = document.getElementById('progress-bar-fill');
    const changeFill = document.getElementById('progress-change-fill');
    const range = Math.max(1, rankDetails.max - rankDetails.min);
    const previousPoints = Math.max(rankDetails.min, totalPoints - pointsChange);
    const startPos = Math.max(0, Math.min(100, ((previousPoints - rankDetails.min) / range) * 100));
    const endPos = Math.max(0, Math.min(100, ((totalPoints - rankDetails.min) / range) * 100));

    baseFill.style.transition = 'none';
    changeFill.style.transition = 'none';

    if (pointsChange >= 0) {
        baseFill.style.width = `${startPos}%`;
        changeFill.className = 'progress-change-fill positive';
        changeFill.style.left = `${startPos}%`;
        changeFill.style.width = '0%';
        changeFill.style.opacity = '1';
    } else {
        baseFill.style.width = `${startPos}%`;
        changeFill.className = 'progress-change-fill negative';
        changeFill.style.left = `${endPos}%`;
        changeFill.style.width = `${Math.abs(startPos - endPos)}%`;
        changeFill.style.opacity = '0';
    }

    setTimeout(() => {
        changeFill.style.transition = 'width 1.5s ease-in-out, opacity 0.5s';
        if (pointsChange >= 0) {
            changeFill.style.width = `${Math.max(0, endPos - startPos)}%`;
        } else {
            changeFill.style.opacity = '1';
            baseFill.style.transition = 'width 1.5s ease-in-out';
            baseFill.style.width = `${endPos}%`;
        }
    }, 1000);

    document.getElementById('result-winrate').innerText = `${jogos === 0 ? 0 : Math.round((vitorias / jogos) * 100)}%`;
    document.getElementById('close-result-btn').onclick = () => {
        modal.classList.add('hidden');
        rankIcon.classList.remove('rank-up-anim');
    };

    setTimeout(() => modal.classList.remove('hidden'), alreadyPlayed ? 0 : 600);
}

function evaluateGuess(guess, target) {
    const displayGuess = guess.toUpperCase().split('');
    const guessLetters = normalizar(guess).split('');
    const targetLetters = normalizar(target).split('');
    const results = new Array(5).fill('absent');
    let correct = 0;

    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            results[i] = 'correct';
            correct++;
            targetLetters[i] = null;
            guessLetters[i] = null;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] !== null && targetLetters.includes(guessLetters[i])) {
            results[i] = 'present';
            targetLetters[targetLetters.indexOf(guessLetters[i])] = null;
        }
    }

    return { results, correct, displayGuess };
}

function createBoards() {
    const container = document.getElementById('boards');
    container.innerHTML = '';
    container.className = `boards-container mode-${currentModeKey}`;

    targetWords.forEach((_, boardIndex) => {
        const wrapper = document.createElement('section');
        wrapper.className = 'board-wrapper';

        const label = document.createElement('div');
        label.className = 'board-label';
        label.id = `board-label-${boardIndex}`;
        label.innerText = mode.boards === 1 ? '' : `Tabuleiro ${boardIndex + 1}`;
        wrapper.appendChild(label);

        const board = document.createElement('div');
        board.className = 'board';
        board.id = `board-${boardIndex}`;
        board.style.setProperty('--attempts', mode.attempts);

        for (let attempt = 0; attempt < mode.attempts; attempt++) {
            const row = document.createElement('div');
            row.className = 'row';
            for (let column = 0; column < 5; column++) {
                const tile = document.createElement('div');
                tile.className = 'tile';
                tile.id = `tile-${boardIndex}-${attempt}-${column}`;
                row.appendChild(tile);
            }
            board.appendChild(row);
        }

        wrapper.appendChild(board);
        container.appendChild(wrapper);
    });
}

function createKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';
    const rows = [
        ['Q','W','E','R','T','Y','U','I','O','P'],
        ['A','S','D','F','G','H','J','K','L'],
        ['ENTER','Z','X','C','V','B','N','M','⌫']
    ];

    rows.forEach(keys => {
        const row = document.createElement('div');
        row.className = 'keyboard-row';
        keys.forEach(key => {
            const button = document.createElement('button');
            button.className = 'key';
            button.innerText = key;
            button.id = `key-${key}`;
            if (key === 'ENTER' || key === '⌫') button.classList.add('large');
            button.onclick = () => handleKeyPress(key);
            row.appendChild(button);
        });
        keyboard.appendChild(row);
    });
}

function setupInputs() {
    document.onkeydown = event => {
        if (gameOver || !currentUser) return;
        if (event.key === 'Enter') handleKeyPress('ENTER');
        else if (event.key === 'Backspace') handleKeyPress('⌫');
        else if (/^[a-zA-Z]$/.test(event.key)) handleKeyPress(event.key.toUpperCase());
    };
}

function getCurrentInputTiles(boardIndex) {
    return Array.from({ length: 5 }, (_, column) =>
        document.getElementById(`tile-${boardIndex}-${currentAttempt}-${column}`)
    );
}

function handleKeyPress(key) {
    if (gameOver || !currentUser) return;

    if (key === 'ENTER') {
        checkWord(false);
        return;
    }

    if (key === '⌫') {
        if (currentTile === 0) return;
        currentTile--;
        targetWords.forEach((_, boardIndex) => {
            if (solvedBoards[boardIndex]) return;
            const tile = document.getElementById(`tile-${boardIndex}-${currentAttempt}-${currentTile}`);
            tile.innerText = '';
            tile.classList.remove('pop');
        });
        return;
    }

    if (currentTile >= 5) return;
    targetWords.forEach((_, boardIndex) => {
        if (solvedBoards[boardIndex]) return;
        const tile = document.getElementById(`tile-${boardIndex}-${currentAttempt}-${currentTile}`);
        tile.innerText = key;
        tile.classList.add('pop');
    });
    currentTile++;
}

function updateKeyboardColor(letter, state) {
    const button = document.getElementById(`key-${letter}`);
    if (!button) return;

    const currentState = ['correct', 'present', 'absent'].find(className => button.classList.contains(className));
    if (currentState && RESULT_STRENGTH[currentState] >= RESULT_STRENGTH[state]) return;

    button.classList.remove('correct', 'present', 'absent');
    button.classList.add(state);
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 900);
}

function saveGameState(guess) {
    let state = JSON.parse(localStorage.getItem(mode.stateKey)) || { dia: diffInDays, tentativas: [] };
    if (state.dia !== diffInDays) state = { dia: diffInDays, tentativas: [] };
    state.tentativas.push(guess);
    localStorage.setItem(mode.stateKey, JSON.stringify(state));
}

function resetRuntimeState() {
    solvedBoards = new Array(mode.boards).fill(false);
    boardScores = new Array(mode.boards).fill(null);
    currentAttempt = 0;
    currentTile = 0;
    gameOver = false;
}

async function loadGameState() {
    const state = JSON.parse(localStorage.getItem(mode.stateKey));
    if (!state || state.dia !== diffInDays || !Array.isArray(state.tentativas)) return;

    resetRuntimeState();
    for (let index = 0; index < state.tentativas.length; index++) {
        if (index >= mode.attempts || gameOver) break;
        currentAttempt = index;
        currentTile = 5;
        await applyGuess(state.tentativas[index], true);
    }

    if (!gameOver && state.tentativas.length < mode.attempts) {
        currentAttempt = state.tentativas.length;
        currentTile = 0;
    }
}

async function animateBoardResult(boardIndex, guess, evaluation, isRestoring) {
    const tiles = getCurrentInputTiles(boardIndex);
    const normalizedGuess = normalizar(guess);

    for (let i = 0; i < 5; i++) {
        const tile = tiles[i];
        if (!isRestoring) {
            tile.classList.add('flip');
            setTimeout(() => {
                tile.innerText = evaluation.displayGuess[i];
                tile.classList.add(evaluation.results[i]);
                updateKeyboardColor(normalizedGuess[i], evaluation.results[i]);
            }, 250);
            await new Promise(resolve => setTimeout(resolve, 90));
        } else {
            tile.innerText = evaluation.displayGuess[i];
            tile.classList.add(evaluation.results[i]);
            updateKeyboardColor(normalizedGuess[i], evaluation.results[i]);
        }
    }
}

function markBoardSolved(boardIndex) {
    solvedBoards[boardIndex] = true;
    const label = document.getElementById(`board-label-${boardIndex}`);
    if (label && mode.boards > 1) {
        label.innerText = `Tabuleiro ${boardIndex + 1} • Resolvido`;
        label.classList.add('solved');
    }
}

async function applyGuess(guess, isRestoring = false) {
    const activeBoards = targetWords
        .map((_, index) => index)
        .filter(index => !solvedBoards[index]);

    for (const boardIndex of activeBoards) {
        const evaluation = evaluateGuess(guess, targetWords[boardIndex]);
        await animateBoardResult(boardIndex, guess, evaluation, isRestoring);

        if (evaluation.correct === 5) {
            boardScores[boardIndex] = pointsForSolvedAttempt(currentAttempt + 1);
            markBoardSolved(boardIndex);
        }
    }

    const allSolved = solvedBoards.every(Boolean);
    const lastAttempt = currentAttempt === mode.attempts - 1;

    if (allSolved) {
        gameOver = true;
        if (!isRestoring) {
            const totalPoints = boardScores.reduce((sum, value) => sum + (value || 0), 0);
            await finalizeGame(totalPoints, true);
        }
        return;
    }

    if (lastAttempt) {
        gameOver = true;
        let totalPoints = 0;
        targetWords.forEach((target, boardIndex) => {
            totalPoints += boardScores[boardIndex] !== null
                ? boardScores[boardIndex]
                : calculateLossPoints(guess, target);
        });
        if (!isRestoring) await finalizeGame(totalPoints, false);
        return;
    }

    currentAttempt++;
    currentTile = 0;
}

async function checkWord(isRestoring = false) {
    if (currentTile !== 5) return;

    const firstActiveBoard = solvedBoards.findIndex(solved => !solved);
    if (firstActiveBoard === -1) return;

    const tiles = getCurrentInputTiles(firstActiveBoard);
    const guessRaw = tiles.map(tile => tile.innerText).join('').toUpperCase();
    const normalizedGuess = normalizar(guessRaw);

    if (!isRestoring && !validWords.includes(normalizedGuess)) {
        showToast('Palavra inválida!');
        return;
    }

    const guess = validWordsMap[normalizedGuess] || guessRaw;
    if (!isRestoring) saveGameState(guess);
    await applyGuess(guess, isRestoring);
}

function calculateTargetLine(boardIndex) {
    if (currentModeKey === 'uordoul') {
        return mode.startLine + diffInDays;
    }
    return mode.startLine + (diffInDays * mode.boards) + boardIndex;
}

function getTargetWordFromLine(lines, boardIndex) {
    const requestedLine = calculateTargetLine(boardIndex);
    const zeroBased = requestedLine - 1;
    const segmentStart = mode.startLine - 1;
    const segmentEndExclusive = currentModeKey === 'uordoul'
        ? Math.min(lines.length, 1999)
        : currentModeKey === 'duordoul'
            ? Math.min(lines.length, 3999)
            : lines.length;
    const segmentLength = Math.max(1, segmentEndExclusive - segmentStart);
    const wrappedIndex = segmentStart + (((zeroBased - segmentStart) % segmentLength) + segmentLength) % segmentLength;
    return (lines[wrappedIndex] || '').trim().toUpperCase();
}

async function initGame() {
    setupNavigation();
    diffInDays = Math.max(0, Math.floor((new Date() - mode.startDate) / (1000 * 60 * 60 * 24)));
    resetRuntimeState();

    try {
        const targetResponse = await fetch('PalavrasTermo.txt');
        const targetText = await targetResponse.text();
        const targetLines = targetText.replace(/\r/g, '').split('\n');
        targetWords = Array.from({ length: mode.boards }, (_, boardIndex) => getTargetWordFromLine(targetLines, boardIndex));

        if (targetWords.some(word => normalizar(word).length !== 5)) {
            throw new Error('Palavra-alvo inválida no arquivo PalavrasTermo.txt');
        }

        const validResponse = await fetch('BancoDePalavras.txt');
        const validText = await validResponse.text();
        const rawValidWords = validText.replace(/\r/g, '').split('\n').map(word => word.trim()).filter(word => normalizar(word).length === 5);

        validWordsMap = {};
        rawValidWords.forEach(word => {
            const normalized = normalizar(word);
            const upper = word.toUpperCase();
            if (!validWordsMap[normalized] || upper === normalized) validWordsMap[normalized] = upper;
        });
        targetWords.forEach(word => {
            const normalized = normalizar(word);
            if (!validWordsMap[normalized]) validWordsMap[normalized] = word;
        });
        validWords = Object.keys(validWordsMap);
    } catch (error) {
        console.error(error);
        const fallback = ['PLANO', 'TERMO', 'JOGAR', 'LIVRO'];
        targetWords = Array.from({ length: mode.boards }, (_, index) => fallback[index]);
        validWordsMap = Object.fromEntries(fallback.map(word => [normalizar(word), word]));
        validWords = Object.keys(validWordsMap);
    }

    createBoards();
    createKeyboard();
    await loadGameState();
    setupInputs();
}

function getShareRow(guess, target) {
    const evaluation = evaluateGuess(guess, target);
    return evaluation.results.map(result => result === 'correct' ? '🟩' : result === 'present' ? '🟨' : '⬛').join('');
}

document.getElementById('share-btn').onclick = () => {
    const state = JSON.parse(localStorage.getItem(mode.stateKey));
    const attemptsUsed = state && state.dia === diffInDays ? state.tentativas.length : 0;
    let text = `${mode.name} #${diffInDays} - ${gameOver && solvedBoards.every(Boolean) ? attemptsUsed : 'X'}/${mode.attempts}\n\n`;

    if (state && state.dia === diffInDays && Array.isArray(state.tentativas)) {
        state.tentativas.forEach((guess, attemptIndex) => {
            const rows = targetWords.map(target => {
                const solvedBefore = state.tentativas.slice(0, attemptIndex).some(previous => normalizar(previous) === normalizar(target));
                return solvedBefore ? '⬜⬜⬜⬜⬜' : getShareRow(guess, target);
            });
            text += rows.join('  ') + '\n';
        });
    }

    navigator.clipboard.writeText(text).then(() => {
        const button = document.getElementById('share-btn');
        button.innerText = '✅ Copiado!';
        setTimeout(() => button.innerText = '📋 Copiar Tentativas', 2000);
    });
};

function leaderboardModeConfig(key) {
    if (key === 'general') return { title: 'Geral' };
    const selected = MODES[key];
    return { title: selected.name, ...selected };
}

async function loadLeaderboard(selectedMode = currentLeaderboardMode) {
    currentLeaderboardMode = selectedMode;
    const config = leaderboardModeConfig(selectedMode);
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    document.getElementById('leaderboard-title').innerText = `🏆 Ranking: ${config.title}`;

    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.leaderboardMode === selectedMode);
    });

    const body = document.getElementById('leaderboard-body');
    body.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";

    const snap = await db.collection('usuarios').get();
    const users = [];

    snap.forEach(doc => {
        const user = doc.data();
        let points;
        let games;
        let wins;

        if (selectedMode === 'general') {
            points = (user.pontos || 0) + (user.pontosDuordoul || 0) + (user.pontosFourdoul || 0);
            games = (user.jogosJogados || 0) + (user.jogosJogadosDuordoul || 0) + (user.jogosJogadosFourdoul || 0);
            wins = (user.vitorias || 0) + (user.vitoriasDuordoul || 0) + (user.vitoriasFourdoul || 0);
        } else {
            points = user[config.pointsField] || 0;
            games = user[config.gamesField] || 0;
            wins = user[config.winsField] || 0;
        }

        users.push({
            ...user,
            rankingPoints: points,
            wr: games ? wins / games : 0,
            rankingElo: getRankDetails(points).name
        });
    });

    users.sort((a, b) => {
        if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
        return b.wr - a.wr;
    });

    body.innerHTML = '';
    users.slice(0, 50).forEach((user, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="lb-user">
                    <span class="lb-pos">${index + 1}º</span>
                    <img src="${user.avatar || ''}" class="lb-avatar" referrerpolicy="no-referrer" alt="">
                    <strong>${user.nome || 'Jogador'}</strong>
                </div>
            </td>
            <td class="center-cell"><span class="lb-pts">${user.rankingPoints}</span></td>
            <td class="center-cell"><img src="assets/${getRankImageName(user.rankingElo)}" class="lb-rank-img" title="${user.rankingElo}" alt="${user.rankingElo}"></td>
            <td class="center-cell">${Math.round(user.wr * 100)}%</td>
        `;
        body.appendChild(tr);
    });

    if (!users.length) body.innerHTML = "<tr><td colspan='4'>Nenhum jogador encontrado.</td></tr>";
}

document.getElementById('open-leaderboard-btn').onclick = () => loadLeaderboard('general');
document.getElementById('modal-leaderboard-btn').onclick = () => {
    document.getElementById('result-modal').classList.add('hidden');
    loadLeaderboard(currentModeKey);
};
document.getElementById('close-leaderboard-btn').onclick = () => document.getElementById('leaderboard-modal').classList.add('hidden');
document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.onclick = () => loadLeaderboard(tab.dataset.leaderboardMode);
});

initGame()
    .then(startAuthListener)
    .catch(error => {
        console.error(error);
        startAuthListener();
    });

/* Ajustes consolidados que antes estavam em arquivos auxiliares. */
(() => {
    const UORDOUL_DATE = { year: 2026, month: 3, day: 2 };
    const MULTI_DATE = { year: 2026, month: 8, day: 8 };
    const MODE_LABELS = { uordoul: 'Uordoul', duordoul: 'Duordoul', fourdoul: 'Fourdoul' };

    function setGeneralLeaderboardHeader() {
        const row = document.querySelector('#leaderboard-table thead tr');
        if (!row) return;
        row.innerHTML = `
            <th>Jogador</th>
            <th class="center-cell">Pontos</th>
            <th class="center-cell">Último dia jogado</th>
            <th class="center-cell">Dias jogados</th>
            <th class="center-cell">Win Rate</th>
        `;
    }

    function setStandardLeaderboardHeader(lastLabel = 'Win Rate') {
        const row = document.querySelector('#leaderboard-table thead tr');
        if (!row) return;
        row.innerHTML = `
            <th>Jogador</th>
            <th class="center-cell">Pontos</th>
            <th class="center-cell">Patente</th>
            <th id="leaderboard-last-header" class="center-cell">${lastLabel}</th>
        `;
    }

    function dateFromDayIndex(value, base) {
        const index = Number(value);
        if (!Number.isFinite(index) || index < 0) return null;
        const date = new Date(base.year, base.month, base.day);
        date.setDate(date.getDate() + index);
        return date;
    }

    function dateFromKey(value) {
        if (typeof value !== 'string') return null;
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function getLastPlayedDate(user) {
        const dates = [
            dateFromDayIndex(user.ultimoDiaJogado, UORDOUL_DATE),
            dateFromDayIndex(user.ultimoDiaJogadoDuordoul, MULTI_DATE),
            dateFromDayIndex(user.ultimoDiaJogadoFourdoul, MULTI_DATE),
            dateFromKey(user.ultimoDiaPalpitadaKey) || dateFromDayIndex(user.ultimoDiaJogadoPalpitada, MULTI_DATE)
        ].filter(Boolean);
        if (!dates.length) return '—';
        return new Date(Math.max(...dates.map(date => date.getTime()))).toLocaleDateString('pt-BR');
    }

    async function loadPalpitadaLeaderboard() {
        currentLeaderboardMode = 'palpitada';
        setStandardLeaderboardHeader('Partidas');
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        document.getElementById('leaderboard-title').innerText = '🏆 Ranking: Palpitada';
        document.querySelectorAll('.leaderboard-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.leaderboardMode === 'palpitada');
        });
        const body = document.getElementById('leaderboard-body');
        body.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";
        try {
            const snap = await db.collection('usuarios').get();
            const users = [];
            snap.forEach(doc => {
                const user = doc.data();
                const points = user.pontosPalpitada || 0;
                users.push({ ...user, rankingPoints: points, rankingGames: user.jogosJogadosPalpitada || 0, rankingElo: getRankDetails(points).name });
            });
            users.sort((a, b) => b.rankingPoints !== a.rankingPoints ? b.rankingPoints - a.rankingPoints : b.rankingGames - a.rankingGames);
            body.innerHTML = '';
            users.slice(0, 50).forEach((user, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><div class="lb-user"><span class="lb-pos">${index + 1}º</span><img src="${user.avatar || ''}" class="lb-avatar" referrerpolicy="no-referrer" alt=""><strong>${user.nome || 'Jogador'}</strong></div></td>
                    <td class="center-cell"><span class="lb-pts">${user.rankingPoints}</span></td>
                    <td class="center-cell"><img src="assets/${getRankImageName(user.rankingElo)}" class="lb-rank-img" title="${user.rankingElo}" alt="${user.rankingElo}"></td>
                    <td class="center-cell">${user.rankingGames}</td>`;
                body.appendChild(tr);
            });
            if (!users.length) body.innerHTML = "<tr><td colspan='4'>Nenhum jogador encontrado.</td></tr>";
        } catch (error) {
            console.error(error);
            body.innerHTML = "<tr><td colspan='4'>Não foi possível carregar o ranking.</td></tr>";
        }
    }

    const originalLoadLeaderboard = loadLeaderboard;
    loadLeaderboard = async function(selectedMode = 'general') {
        if (selectedMode === 'palpitada') return loadPalpitadaLeaderboard();
        if (selectedMode !== 'general') {
            setStandardLeaderboardHeader('Win Rate');
            return originalLoadLeaderboard(selectedMode);
        }

        currentLeaderboardMode = 'general';
        setGeneralLeaderboardHeader();
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        document.getElementById('leaderboard-title').innerText = '🏆 Ranking: Geral';
        document.querySelectorAll('.leaderboard-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.leaderboardMode === 'general');
        });
        const body = document.getElementById('leaderboard-body');
        body.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

        try {
            const snap = await db.collection('usuarios').get();
            const users = [];
            snap.forEach(doc => {
                const user = doc.data();
                const points = (user.pontos || 0) + (user.pontosDuordoul || 0) + (user.pontosFourdoul || 0);
                const games = (user.jogosJogados || 0) + (user.jogosJogadosDuordoul || 0) + (user.jogosJogadosFourdoul || 0);
                const wins = (user.vitorias || 0) + (user.vitoriasDuordoul || 0) + (user.vitoriasFourdoul || 0);
                users.push({
                    ...user,
                    rankingPoints: points,
                    rankingWinRate: games ? wins / games : 0,
                    lastPlayedDate: getLastPlayedDate(user),
                    daysPlayed: user.jogosJogados || 0
                });
            });
            users.sort((a, b) => b.rankingPoints !== a.rankingPoints ? b.rankingPoints - a.rankingPoints : b.rankingWinRate - a.rankingWinRate);
            body.innerHTML = '';
            users.slice(0, 50).forEach((user, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><div class="lb-user"><span class="lb-pos">${index + 1}º</span><img src="${user.avatar || ''}" class="lb-avatar" referrerpolicy="no-referrer" alt=""><strong>${user.nome || 'Jogador'}</strong></div></td>
                    <td class="center-cell"><span class="lb-pts">${user.rankingPoints}</span></td>
                    <td class="center-cell">${user.lastPlayedDate}</td>
                    <td class="center-cell">${user.daysPlayed}</td>
                    <td class="center-cell">${Math.round(user.rankingWinRate * 100)}%</td>`;
                body.appendChild(tr);
            });
            if (!users.length) body.innerHTML = "<tr><td colspan='5'>Nenhum jogador encontrado.</td></tr>";
        } catch (error) {
            console.error(error);
            body.innerHTML = "<tr><td colspan='5'>Não foi possível carregar o ranking.</td></tr>";
        }
    };

    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        tab.onclick = () => loadLeaderboard(tab.dataset.leaderboardMode);
    });

    let processingGuess = false;
    const originalCheckWord = checkWord;
    const originalHandleKeyPress = handleKeyPress;
    checkWord = async function(isRestoring = false) {
        if (!isRestoring && processingGuess) return;
        if (!isRestoring) processingGuess = true;
        try {
            return await originalCheckWord(isRestoring);
        } finally {
            if (!isRestoring) processingGuess = false;
        }
    };
    handleKeyPress = function(key) {
        if (processingGuess) return;
        return originalHandleKeyPress(key);
    };

    function ensureAnswerTextElement() {
        const title = document.getElementById('result-title');
        if (!title) return null;
        let answer = document.getElementById('result-answer-text');
        if (!answer) {
            answer = document.createElement('p');
            answer.id = 'result-answer-text';
            answer.className = 'result-answer-text hidden';
            title.insertAdjacentElement('afterend', answer);
        }
        return answer;
    }

    const originalShowResultModal = showResultModal;
    showResultModal = function(isWin, pointsChange, totalPoints, rankDetails, jogos, vitorias, alreadyPlayed = false, oldElo = null) {
        const result = originalShowResultModal.apply(this, arguments);
        const answer = ensureAnswerTextElement();
        if (answer) {
            answer.innerText = '';
            answer.classList.add('hidden');
        }
        if (alreadyPlayed) {
            const title = document.getElementById('result-title');
            const words = targetWords.map(word => String(word || '').trim().toUpperCase()).filter(Boolean);
            if (title) title.innerText = `${MODE_LABELS[currentModeKey] || 'Uordoul'} #${diffInDays} Realizado!`;
            if (answer && words.length) {
                answer.innerText = words.length === 1 ? `A palavra era ${words[0]}` : `As palavras eram ${words.join(', ')}`;
                answer.classList.remove('hidden');
            }
        }
        return result;
    };

    const gameNav = document.getElementById('game-nav');
    const menuToggle = document.getElementById('menu-toggle');
    function closeGameNav() {
        if (!gameNav || !menuToggle) return;
        gameNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
    }
    if (gameNav && menuToggle) {
        gameNav.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => setTimeout(closeGameNav, 0)));
        document.addEventListener('click', event => {
            if (!gameNav.classList.contains('open')) return;
            if (gameNav.contains(event.target) || menuToggle.contains(event.target)) return;
            closeGameNav();
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeGameNav(); });
    }
})();

/* Compartilhamento em imagem com todos os modos. */
(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WORD_MODES = {
        uordoul: { title: 'UORDOUL', stateKey: 'uordoulState', startDate: new Date('2026-04-02T00:00:00'), startLine: 1, boards: 1, attempts: 6 },
        duordoul: { title: 'DUORDOUL', stateKey: 'duordoulState', startDate: new Date('2026-09-08T00:00:00'), startLine: 2000, boards: 2, attempts: 7 },
        fourdoul: { title: 'FOURDOUL', stateKey: 'fourdoulState', startDate: new Date('2026-09-08T00:00:00'), startLine: 4000, boards: 4, attempts: 9 }
    };
    let currentObjectUrl = null;

    function normalizeWord(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    }
    function safeJson(value) { try { return JSON.parse(value); } catch (_) { return null; } }
    function getDayIndex(startDate) { return Math.max(0, Math.floor((new Date() - startDate) / DAY_MS)); }
    function getSaoPauloDateKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }
    function getTargetWordFromLines(lines, config, dayIndex, boardIndex) {
        const requestedLine = config.startLine + (config.boards === 1 ? dayIndex : dayIndex * config.boards + boardIndex);
        const zeroBased = requestedLine - 1;
        const segmentStart = config.startLine - 1;
        const segmentEndExclusive = config.startLine === 1 ? Math.min(lines.length, 1999) : config.startLine === 2000 ? Math.min(lines.length, 3999) : lines.length;
        const segmentLength = Math.max(1, segmentEndExclusive - segmentStart);
        const wrappedIndex = segmentStart + (((zeroBased - segmentStart) % segmentLength) + segmentLength) % segmentLength;
        return String(lines[wrappedIndex] || '').trim().toUpperCase();
    }
    function evaluateShareGuess(guess, target) {
        const guessLetters = normalizeWord(guess).split('');
        const targetLetters = normalizeWord(target).split('');
        const result = new Array(5).fill('absent');
        for (let index = 0; index < 5; index++) {
            if (guessLetters[index] === targetLetters[index]) {
                result[index] = 'correct';
                guessLetters[index] = null;
                targetLetters[index] = null;
            }
        }
        for (let index = 0; index < 5; index++) {
            if (guessLetters[index] !== null && targetLetters.includes(guessLetters[index])) {
                result[index] = 'present';
                targetLetters[targetLetters.indexOf(guessLetters[index])] = null;
            }
        }
        return result;
    }
    function buildBoardRows(guesses, target) {
        const rows = [];
        for (const guess of guesses) {
            rows.push(evaluateShareGuess(guess, target));
            if (normalizeWord(guess) === normalizeWord(target)) break;
        }
        return rows;
    }
    async function getWordModeData() {
        const response = await fetch('PalavrasTermo.txt', { cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar PalavrasTermo.txt');
        const lines = (await response.text()).replace(/\r/g, '').split('\n');
        const result = {};
        Object.entries(WORD_MODES).forEach(([key, config]) => {
            const dayIndex = getDayIndex(config.startDate);
            const state = safeJson(localStorage.getItem(config.stateKey));
            const played = !!(state && state.dia === dayIndex && Array.isArray(state.tentativas) && state.tentativas.length > 0);
            const targets = Array.from({ length: config.boards }, (_, boardIndex) => getTargetWordFromLines(lines, config, dayIndex, boardIndex));
            result[key] = { ...config, dayIndex, played, guesses: played ? state.tentativas.slice(0, config.attempts) : [], targets, boards: played ? targets.map(target => buildBoardRows(state.tentativas, target)) : [] };
        });
        return result;
    }
    async function getPalpitadaData() {
        const user = firebase.auth().currentUser;
        const todayKey = getSaoPauloDateKey();
        if (!user) return { played: false, dateKey: todayKey };
        try {
            const snapshot = await firebase.firestore().collection('usuarios').doc(user.uid).get();
            if (!snapshot.exists) return { played: false, dateKey: todayKey };
            const data = snapshot.data();
            const played = data.ultimoDiaPalpitadaKey === todayKey;
            return { played, dateKey: todayKey, distanceKm: played ? Number(data.ultimaDistanciaPalpitada || 0) : null, score: played ? Number(data.ultimaPontuacaoPalpitada || 0) : null };
        } catch (error) {
            console.warn('Não foi possível ler o resultado da Palpitada para compartilhamento.', error);
            return { played: false, dateKey: todayKey };
        }
    }
    function roundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + r);
        ctx.lineTo(x + width, y + height - r);
        ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        ctx.lineTo(x + r, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    function drawTrackedText(ctx, text, centerX, y, spacing) {
        const chars = String(text).split('');
        const widths = chars.map(char => ctx.measureText(char).width);
        const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * spacing;
        let x = centerX - totalWidth / 2;
        chars.forEach((char, index) => { ctx.fillText(char, x, y); x += widths[index] + spacing; });
    }
    function getPalette() {
        const styles = getComputedStyle(document.documentElement);
        return {
            bg: (styles.getPropertyValue('--bg') || '#121213').trim(),
            correct: (styles.getPropertyValue('--correct') || '#6aaa64').trim(),
            present: (styles.getPropertyValue('--present') || '#c9b458').trim(),
            absent: (styles.getPropertyValue('--absent') || '#4e4646').trim(),
            border: (styles.getPropertyValue('--border') || '#3a3a3c').trim(),
            key: (styles.getPropertyValue('--key-bg') || '#818384').trim(),
            text: '#ffffff', muted: '#bfc0c2', panel: '#181819'
        };
    }
    function drawPanel(ctx, panel, title, subtitle, palette) {
        ctx.fillStyle = palette.panel;
        roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 24); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = palette.key; ctx.stroke();
        ctx.fillStyle = palette.text; ctx.font = '700 29px Arial, sans-serif'; ctx.textAlign = 'left';
        drawTrackedText(ctx, title, panel.x + panel.w / 2, panel.y + 45, 2.1);
        if (subtitle) { ctx.fillStyle = palette.muted; ctx.font = '600 17px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(subtitle, panel.x + panel.w - 18, panel.y + 46); }
        ctx.fillStyle = palette.correct; roundedRect(ctx, panel.x + panel.w / 2 - 34, panel.y + 60, 68, 4, 2); ctx.fill();
    }
    function drawNotPlayed(ctx, panel, palette) { ctx.fillStyle = palette.muted; ctx.font = '700 27px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Ainda não jogado', panel.x + panel.w / 2, panel.y + panel.h / 2 + 8); }
    function tileColor(state, palette) { return state === 'correct' ? palette.correct : state === 'present' ? palette.present : palette.absent; }
    function drawBoard(ctx, rows, area, palette, options = {}) {
        const cols = 5, maxRows = Math.max(1, rows.length), gap = options.gap ?? 7, rowGap = options.rowGap ?? gap;
        const maxTileByWidth = (area.w - gap * (cols - 1)) / cols;
        const maxTileByHeight = (area.h - rowGap * (maxRows - 1)) / maxRows;
        const tile = Math.max(7, Math.min(options.maxTile || 54, maxTileByWidth, maxTileByHeight));
        const totalWidth = tile * cols + gap * (cols - 1), totalHeight = tile * maxRows + rowGap * (maxRows - 1);
        const startX = area.x + (area.w - totalWidth) / 2, startY = area.y + (area.h - totalHeight) / 2;
        rows.forEach((row, rowIndex) => row.forEach((state, colIndex) => {
            const x = startX + colIndex * (tile + gap), y = startY + rowIndex * (tile + rowGap);
            ctx.fillStyle = tileColor(state, palette); roundedRect(ctx, x, y, tile, tile, Math.max(3, tile * 0.08)); ctx.fill();
            ctx.lineWidth = Math.max(1, tile * 0.035); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
        }));
    }
    function drawUordoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'UORDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);
        drawBoard(ctx, data.boards[0], { x: panel.x + 72, y: panel.y + 88, w: panel.w - 144, h: panel.h - 120 }, palette, { maxTile: 52, gap: 9, rowGap: 9 });
    }
    function drawDuordoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'DUORDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);
        const innerY = panel.y + 92, innerH = panel.h - 128, halfW = (panel.w - 74) / 2;
        drawBoard(ctx, data.boards[0], { x: panel.x + 28, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 });
        drawBoard(ctx, data.boards[1], { x: panel.x + 46 + halfW, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 });
    }
    function drawFourdoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'FOURDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);
        const left = panel.x + 26, top = panel.y + 86, cellW = (panel.w - 68) / 2, cellH = (panel.h - 120) / 2;
        const areas = [
            { x: left, y: top, w: cellW, h: cellH }, { x: left + cellW + 16, y: top, w: cellW, h: cellH },
            { x: left, y: top + cellH + 12, w: cellW, h: cellH }, { x: left + cellW + 16, y: top + cellH + 12, w: cellW, h: cellH }
        ];
        data.boards.forEach((rows, index) => drawBoard(ctx, rows, areas[index], palette, { maxTile: 18, gap: 4, rowGap: 4 }));
    }
    function drawPalpitada(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'PALPITADA GEO', '', palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);
        const cx = panel.x + panel.w / 2, cy = panel.y + panel.h / 2 + 20, radius = 110;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = palette.correct; ctx.stroke();
        ctx.fillStyle = palette.text; ctx.font = '700 38px Arial, sans-serif'; ctx.textAlign = 'center';
        const distance = Number(data.distanceKm || 0); ctx.fillText(`${distance.toFixed(distance >= 100 ? 0 : 1)} km`, cx, cy - 4);
        ctx.fillStyle = palette.present; ctx.font = '700 24px Arial, sans-serif'; ctx.fillText(`${Number(data.score || 0)} pts`, cx, cy + 39);
    }
    async function buildImage() {
        const [wordModes, palpitada] = await Promise.all([getWordModeData(), getPalpitadaData()]);
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
        const palette = getPalette(), canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1200;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#151516'; roundedRect(ctx, 42, 42, 1116, 1116, 34); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = palette.key; ctx.stroke();
        ctx.fillStyle = palette.text; ctx.font = '700 33px Arial, sans-serif'; ctx.textAlign = 'left'; drawTrackedText(ctx, 'RESULTADO DO DIA', canvas.width / 2, 92, 2.2);
        const panels = { uordoul: { x: 78, y: 126, w: 504, h: 472 }, duordoul: { x: 618, y: 126, w: 504, h: 472 }, fourdoul: { x: 78, y: 628, w: 504, h: 472 }, palpitada: { x: 618, y: 628, w: 504, h: 472 } };
        drawUordoul(ctx, panels.uordoul, wordModes.uordoul, palette); drawDuordoul(ctx, panels.duordoul, wordModes.duordoul, palette); drawFourdoul(ctx, panels.fourdoul, wordModes.fourdoul, palette); drawPalpitada(ctx, panels.palpitada, palpitada, palette);
        ctx.fillStyle = palette.muted; ctx.font = '600 17px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('UORDOUL', canvas.width / 2, 1137);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
        if (!blob) throw new Error('Não foi possível gerar a imagem.');
        return { blob, dateKey: getSaoPauloDateKey() };
    }
    function ensureShareSheet() {
        let overlay = document.getElementById('uordoul-share-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div'); overlay.id = 'uordoul-share-overlay'; overlay.className = 'uordoul-share-overlay hidden';
        overlay.innerHTML = `<section class="uordoul-share-sheet" role="dialog" aria-modal="true" aria-labelledby="uordoul-share-title"><div class="uordoul-share-header"><h2 id="uordoul-share-title">Compartilhar Resultado</h2><button type="button" class="uordoul-share-close" aria-label="Fechar">×</button></div><img class="uordoul-share-preview" alt="Imagem com os resultados de hoje"><div class="uordoul-share-actions"><button type="button" class="uordoul-share-action primary" data-share-action="native">Compartilhar</button><button type="button" class="uordoul-share-action" data-share-action="copy">Copiar imagem</button><button type="button" class="uordoul-share-action" data-share-action="download">Baixar imagem</button></div><div class="uordoul-share-status" aria-live="polite"></div></section>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.uordoul-share-close').addEventListener('click', closeShareSheet);
        overlay.addEventListener('click', event => { if (event.target === overlay) closeShareSheet(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.classList.contains('hidden')) closeShareSheet(); });
        return overlay;
    }
    function setShareStatus(message) { const status = document.querySelector('.uordoul-share-status'); if (status) status.textContent = message || ''; }
    function closeShareSheet() {
        const overlay = document.getElementById('uordoul-share-overlay'); if (overlay) overlay.classList.add('hidden');
        if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
    }
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function openShareSheet(triggerButton) {
        const originalText = triggerButton ? triggerButton.textContent : '';
        if (triggerButton) { triggerButton.disabled = true; triggerButton.textContent = 'Gerando imagem...'; }
        try {
            const { blob, dateKey } = await buildImage(), overlay = ensureShareSheet(), preview = overlay.querySelector('.uordoul-share-preview');
            const filename = `uordoul-resultado-${dateKey}.png`, file = new File([blob], filename, { type: 'image/png' });
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = URL.createObjectURL(blob); preview.src = currentObjectUrl; setShareStatus('');
            const nativeButton = overlay.querySelector('[data-share-action="native"]'), copyButton = overlay.querySelector('[data-share-action="copy"]'), downloadButton = overlay.querySelector('[data-share-action="download"]');
            nativeButton.onclick = async () => {
                if (!navigator.share) return setShareStatus('O compartilhamento nativo não está disponível neste navegador.');
                if (navigator.canShare && !navigator.canShare({ files: [file] })) return setShareStatus('Este navegador não permite compartilhar a imagem como arquivo. Use Copiar imagem ou Baixar imagem.');
                try { await navigator.share({ title: 'Resultado do Uordoul', text: 'Meu resultado de hoje no Uordoul', files: [file] }); }
                catch (error) { if (error && error.name !== 'AbortError') { console.error(error); setShareStatus('Não foi possível abrir o compartilhamento do sistema.'); } }
            };
            copyButton.onclick = async () => {
                if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return setShareStatus('Seu navegador não permite copiar imagens. Use Baixar imagem.');
                try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setShareStatus('Imagem copiada para a área de transferência.'); }
                catch (error) { console.error(error); setShareStatus('Não foi possível copiar a imagem. Use Baixar imagem.'); }
            };
            downloadButton.onclick = () => { downloadBlob(blob, filename); setShareStatus('Imagem baixada.'); };
            overlay.classList.remove('hidden');
        } catch (error) {
            console.error(error); showToast('Não foi possível gerar o resultado para compartilhar.');
        } finally {
            if (triggerButton) { triggerButton.disabled = false; triggerButton.textContent = originalText || 'Compartilhar Resultado'; }
        }
    }
    document.addEventListener('click', event => {
        const button = event.target.closest && event.target.closest('#share-btn');
        if (!button) return;
        event.preventDefault(); event.stopImmediatePropagation(); openShareSheet(button);
    }, true);
    window.UordoulShare = { open: () => { const button = document.getElementById('share-btn'); if (button) openShareSheet(button); } };
})();
