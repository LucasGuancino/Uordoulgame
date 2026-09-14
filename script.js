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
