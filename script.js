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

const START_DATE = new Date('2026-04-02T00:00:00');
const POINTS_TABLE = { 1: 700, 2: 500, 3: 400, 4: 300, 5: 200, 6: 100 };
let validWordsMap = {};

function normalizar(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

const RANKS = [
    { name: "Prata 1", min: 0, max: 400 }, { name: "Prata 2", min: 400, max: 800 },
    { name: "Prata 3", min: 800, max: 1100 }, { name: "Prata Elite", min: 1100, max: 1700 },
    { name: "Prata Elite Mestre", min: 1700, max: 2200 }, { name: "Ouro 1", min: 2200, max: 2800 },
    { name: "Ouro 2", min: 2800, max: 3300 }, { name: "Ouro 3", min: 3300, max: 3800 },
    { name: "Ouro Master", min: 3800, max: 4400 }, { name: "Guardião Master 1", min: 4400, max: 5100 },
    { name: "Guardião Master 2", min: 5100, max: 5900 }, { name: "Guardião Master Elite", min: 5900, max: 6700 },
    { name: "Xerife", min: 6700, max: 7400 }, { name: "Águia Lendária 1", min: 7400, max: 8100 },
    { name: "Águia Lendária 2", min: 8100, max: 9000 }, { name: "Supremo Master Primeira Classe", min: 9000, max: 10000 },
    { name: "The Global Elite", min: 10000, max: 999999 } 
];

let targetWord = "", validWords = [], currentAttempt = 0, currentTile = 0, gameOver = false, diffInDays = 0, currentUser = null;

auth.onAuthStateChanged((user) => {
    if (user) { currentUser = user; document.getElementById('login-modal').classList.add('hidden'); document.getElementById('profile').classList.remove('hidden'); checkIfAlreadyPlayed(); }
    else { currentUser = null; document.getElementById('login-modal').classList.remove('hidden'); document.getElementById('profile').classList.add('hidden'); }
});

document.getElementById('google-login-btn').onclick = () => { const provider = new firebase.auth.GoogleAuthProvider(); auth.signInWithPopup(provider).catch(e => console.error(e)); };
document.getElementById('logout-btn').onclick = () => auth.signOut();

function setupUserProfile(elo = "Carregando...") {
    document.getElementById('user-avatar').src = currentUser.photoURL;
    document.getElementById('user-name').innerText = currentUser.displayName;
    document.getElementById('user-rank').innerText = elo;
}

async function checkIfAlreadyPlayed() {
    const userDoc = await db.collection('usuarios').doc(currentUser.uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data(); setupUserProfile(userData.elo);
        if (userData.ultimoDiaJogado === diffInDays) { gameOver = true; showResultModal(false, 0, userData.pontos, getRankDetails(userData.pontos), userData.jogosJogados, userData.vitorias, true); }
    } else {
        await db.collection('usuarios').doc(currentUser.uid).set({ nome: currentUser.displayName, avatar: currentUser.photoURL, pontos: 0, elo: "Prata 1", ultimoDiaJogado: -1, jogosJogados: 0, vitorias: 0 });
        setupUserProfile("Prata 1");
    }
}

function getRankDetails(p) { return RANKS.find(r => p >= r.min && p < r.max) || RANKS[RANKS.length - 1]; }

function finalizeGame(pointsChange, isWin) {
    if (!currentUser) return;
    const userRef = db.collection('usuarios').doc(currentUser.uid);
    userRef.get().then(doc => {
        if (doc.exists) {
            let d = doc.data();
            
            let oldElo = d.elo; 
            
            let newP = Math.max(0, (d.pontos || 0) + pointsChange);
            let rd = getRankDetails(newP);
            let j = (d.jogosJogados || 0) + 1, v = (d.vitorias || 0) + (isWin ? 1 : 0);
            
            userRef.update({ 
                pontos: newP, 
                elo: rd.name, 
                ultimoDiaJogado: diffInDays, 
                jogosJogados: j, 
                vitorias: v 
            });
            
            setupUserProfile(rd.name);
            
            showResultModal(isWin, pointsChange, newP, rd, j, v, false, oldElo);
        }
    });
}

function showResultModal(isWin, pointsChange, totalPoints, rankDetails, jogos, vitorias, alreadyPlayed = false, oldElo = null) {
    const modal = document.getElementById('result-modal');
    document.getElementById('result-title').innerText = isWin ? "Vitória!" : `A palavra era: ${targetWord}`;
    
    const rankIconEl = document.getElementById('result-rank-icon');
    const oldIndex = RANKS.findIndex(r => r.name === oldElo);
    const newIndex = RANKS.findIndex(r => r.name === rankDetails.name);

    if (oldElo && newIndex > oldIndex) {
        rankIconEl.src = `assets/${getRankImageName(oldElo)}`;
        setTimeout(() => {
            const xpSound = new Audio('assets/xpsound.mp3');
            xpSound.volume = 0.6;
            xpSound.play().catch(e => {});
            rankIconEl.classList.add('rank-up-anim');
            setTimeout(() => { rankIconEl.src = `assets/${getRankImageName(rankDetails.name)}`; }, 750);
        }, 800); 
    } else {
        rankIconEl.src = `assets/${getRankImageName(rankDetails.name)}`;
    }

    document.getElementById('result-points-change').innerText = (pointsChange > 0 ? "+" : "") + pointsChange + " pts";
    document.getElementById('result-points-change').className = pointsChange > 0 ? "positive-text" : "negative-text";
    
    const nextRank = RANKS[newIndex + 1];
    const totalPointsEl = document.getElementById('result-points-total');
    if (nextRank) {
        totalPointsEl.innerText = `Faltam ${nextRank.min - totalPoints} pts para ${nextRank.name}`;
    } else {
        totalPointsEl.innerText = `Total: ${totalPoints} pts (Rank Máximo)`;
    }

    const baseFill = document.getElementById('progress-bar-fill');
    const changeFill = document.getElementById('progress-change-fill');
    const range = rankDetails.max - rankDetails.min;
    
    const previousPoints = Math.max(rankDetails.min, totalPoints - pointsChange);
    const startPos = ((previousPoints - rankDetails.min) / range) * 100;
    const endPos = ((totalPoints - rankDetails.min) / range) * 100;

    baseFill.style.transition = "none";
    changeFill.style.transition = "none";
    
    if (pointsChange >= 0) {
        baseFill.style.width = `${startPos}%`;
        changeFill.className = "progress-change-fill positive";
        changeFill.style.left = `${startPos}%`;
        changeFill.style.width = "0%";
    } else {
        baseFill.style.width = `${startPos}%`;
        changeFill.className = "progress-change-fill negative";
        changeFill.style.left = `${endPos}%`;
        changeFill.style.width = `${Math.abs(startPos - endPos)}%`;
        changeFill.style.opacity = "0";
    }

    setTimeout(() => {
        changeFill.style.transition = "width 1.5s ease-in-out, opacity 0.5s";
        if (pointsChange >= 0) {
            changeFill.style.width = `${endPos - startPos}%`;
        } else {
            changeFill.style.opacity = "1";
            baseFill.style.transition = "width 1.5s ease-in-out";
            baseFill.style.width = `${endPos}%`;
        }
    }, 1000);

    document.getElementById('result-winrate').innerText = `${jogos === 0 ? 0 : Math.round((vitorias / jogos) * 100)}%`;
    document.getElementById('close-result-btn').onclick = () => {
        modal.classList.add('hidden');
        rankIconEl.classList.remove('rank-up-anim');
    };
    
    setTimeout(() => modal.classList.remove('hidden'), alreadyPlayed ? 0 : 600);
}
document.getElementById('share-btn').onclick = () => {
    let text = `Uordoul #${diffInDays} - ${gameOver ? currentAttempt + 1 : 'X'}/6\n\n`;
    const state = JSON.parse(localStorage.getItem('uordoulState'));
    if (state && state.tentativas) {
        state.tentativas.forEach(guess => {
            let t = targetWord.split(''), g = guess.split(''), res = new Array(5).fill('⬛ ');
            for(let i=0; i<5; i++){ if(g[i] === t[i]){ res[i] = '🟩 '; t[i] = null; g[i] = null; } }
            for(let i=0; i<5; i++){ if(g[i] !== null && t.includes(g[i])){ res[i] = '🟨 '; t[t.indexOf(g[i])] = null; } }
            text += res.join('') + "\n";
        });
    }
    navigator.clipboard.writeText(text).then(() => {
        document.getElementById('share-btn').innerText = "✅ Copiado!";
        setTimeout(() => document.getElementById('share-btn').innerText = "📋 Copiar Tentativas", 2000);
    });
};

function getRankImageName(n) { return n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '') + '.png'; }

document.getElementById('open-leaderboard-btn').onclick = loadLeaderboard;
document.getElementById('modal-leaderboard-btn').onclick = () => { document.getElementById('result-modal').classList.add('hidden'); loadLeaderboard(); };

async function loadLeaderboard() {
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    const b = document.getElementById('leaderboard-body');
    b.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";
    const snap = await db.collection('usuarios')
        .orderBy('pontos', 'desc')
        .limit(50)
        .get();

    let users = [];
    snap.forEach(doc => {
        const u = doc.data();
        const wr = u.jogosJogados
            ? (u.vitorias / u.jogosJogados)
            : 0;

        users.push({ ...u, wr });
    });
    users.sort((a, b) => {
        if (b.pontos !== a.pontos) return b.pontos - a.pontos;
        return b.wr - a.wr;
    });
    b.innerHTML = "";
    let p = 1;
    users.forEach(u => {
        const wrPercent = Math.round(u.wr * 100);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="lb-user">
                    <span class="lb-pos">${p}º</span>
                    <img src="${u.avatar}" class="lb-avatar" referrerpolicy="no-referrer">
                    <strong>${u.nome}</strong>
                </div>
            </td>
            <td style="text-align: center;">
                <span class="lb-pts">${u.pontos}</span>
            </td>
            <td style="text-align: center;">
                <img src="assets/${getRankImageName(u.elo)}" class="lb-rank-img" title="${u.elo}">
            </td>
            <td style="text-align: center;">
                ${wrPercent}%
            </td>
        `;
        b.appendChild(tr);
        p++;
    });
}

document.getElementById('close-leaderboard-btn').onclick = () => document.getElementById('leaderboard-modal').classList.add('hidden');

function saveGameState(g) {
    let s = JSON.parse(localStorage.getItem('uordoulState')) || { dia: diffInDays, tentativas: [] };
    if (s.dia !== diffInDays) s = { dia: diffInDays, tentativas: [] };
    s.tentativas.push(g); localStorage.setItem('uordoulState', JSON.stringify(s));
}

function loadGameState() {
    const s = JSON.parse(localStorage.getItem('uordoulState'));
    if (s && s.dia === diffInDays) {
        s.tentativas.forEach((g, i) => {
            currentAttempt = i;
            g.split('').forEach((c, ci) => { document.getElementById(`tile-${currentAttempt}-${ci}`).innerText = c; });
            currentTile = 5; checkWord(true); 
        });
    }
}

async function initGame() {
    diffInDays = Math.max(0, Math.floor((new Date() - START_DATE) / (1000 * 60 * 60 * 24)));
    try {
        const rt = await fetch('PalavrasTermo.txt'); 
        const tt = await rt.text();
        const rawTargetWords = tt.split('\n').map(w => w.trim()).filter(w => w.length === 5);
        
        targetWord = rawTargetWords[diffInDays % rawTargetWords.length].toUpperCase();

        const rv = await fetch('BancoDePalavras.txt'); 
        const tv = await rv.text();
        const rawValidWords = tv.split('\n').map(w => w.trim()).filter(w => w.length === 5);

        validWordsMap = {}; 
        rawValidWords.forEach(word => {
            const limpa = normalizar(word);
            const wordUpper = word.toUpperCase();
    
            if (!validWordsMap[limpa] || wordUpper === limpa) {
                validWordsMap[limpa] = wordUpper;
            }
        });
        
        validWords = Object.keys(validWordsMap);
    } catch (e) { 
        targetWord = "PLANO"; 
        validWords = ["PLANO"]; 
        validWordsMap["PLANO"] = "PLANO";
    }
    createBoard(); createKeyboard(); loadGameState(); setupInputs();
}

function createBoard() {
    const b = document.getElementById('board');
    for (let i = 0; i < 6; i++) {
        const r = document.createElement('div'); r.className = 'row';
        for (let j = 0; j < 5; j++) { const t = document.createElement('div'); t.className = 'tile'; t.id = `tile-${i}-${j}`; r.appendChild(t); }
        b.appendChild(r);
    }
}

function createKeyboard() {
    const k = document.getElementById('keyboard');
    const l = [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['ENTER','Z','X','C','V','B','N','M','⌫']];
    l.forEach(rk => {
        const r = document.createElement('div'); r.className = 'keyboard-row';
        rk.forEach(key => {
            const b = document.createElement('button'); b.className = 'key'; b.innerText = key; b.id = `key-${key}`;
            if (key === 'ENTER' || key === '⌫') b.classList.add('large');
            b.onclick = () => handleKeyPress(key); r.appendChild(b);
        });
        k.appendChild(r);
    });
}

function setupInputs() {
    document.onkeydown = (e) => {
        if (gameOver || !currentUser) return;
        if (e.key === 'Enter') handleKeyPress('ENTER');
        else if (e.key === 'Backspace') handleKeyPress('⌫');
        else if (/^[a-zA-Z]$/.test(e.key)) handleKeyPress(e.key.toUpperCase());
    };
}

function handleKeyPress(k) {
    if (gameOver || !currentUser) return;
    if (k === 'ENTER') checkWord(false);
    else if (k === '⌫') { if (currentTile > 0) { currentTile--; const t = document.getElementById(`tile-${currentAttempt}-${currentTile}`); t.innerText = ""; t.classList.remove('pop'); } }
    else { 
        if (currentTile < 5) { 
            const t = document.getElementById(`tile-${currentAttempt}-${currentTile}`); 
            t.innerText = k; t.classList.add('pop'); currentTile++; 
        } 
    }
}

function updateKeyboardColor(l, s) {
    const b = document.getElementById(`key-${l}`); if (!b || b.classList.contains('correct')) return;
    if (b.classList.contains('present') && s === 'absent') return;
    b.classList.remove('present', 'absent'); b.classList.add(s);
}

function calculateLossPoints(guess, target) {
    let g = 0, y = 0;
    let gu = guess.split(''), ta = target.split('');
    for (let i = 0; i < 5; i++) { if (gu[i] === ta[i]) { g++; ta[i] = null; gu[i] = null; } }
    for (let i = 0; i < 5; i++) { if (gu[i] !== null && ta.includes(gu[i])) { y++; ta[ta.indexOf(gu[i])] = null; } }
    if (g === 4) return -100; if (g === 3) return -150; if (g === 2) return -200; if (g === 1) return -300;
    if (y === 5 && g === 0) return -500; if (g === 0 && y === 0) return -800;
    return -400; 
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 800);
}

async function checkWord(isRestoring = false) {
    if (currentTile !== 5) return;
    const tiles = Array.from({length: 5}, (_, i) => document.getElementById(`tile-${currentAttempt}-${i}`));
    
    const guessRaw = tiles.map(t => t.innerText).join('').toUpperCase();
    
    if (!isRestoring && !validWords.includes(guessRaw)) { 
        showToast("Palavra inválida!"); 
        return; 
    }

    const guess = validWordsMap[guessRaw];
    const guessArray = guess.split('');
    
    let targetLimpa = normalizar(targetWord).split('');
    let guessLimpa = normalizar(guess).split('');
    let correct = 0;
    const results = new Array(5).fill('absent');

    for (let i = 0; i < 5; i++) {
        if (guessLimpa[i] === targetLimpa[i]) {
            results[i] = 'correct';
            correct++;
            targetLimpa[i] = null;
            guessLimpa[i] = null;
        }
    }

    for (let i = 0; i < 5; i++) {
        if (guessLimpa[i] !== null && targetLimpa.includes(guessLimpa[i])) {
            results[i] = 'present';
            targetLimpa[targetLimpa.indexOf(guessLimpa[i])] = null;
        }
    }

    for(let i=0; i<5; i++) {
        const tile = tiles[i];
        if (!isRestoring) {
            tile.classList.add('flip');
            
            setTimeout(() => {
                tile.innerText = guessArray[i]; 
                tile.classList.add(results[i]);
                updateKeyboardColor(guessRaw[i], results[i]); 
            }, 250);
            
            await new Promise(r => setTimeout(r, 150));
        } else {
            tile.innerText = guessArray[i];
            tile.classList.add(results[i]);
            updateKeyboardColor(guessRaw[i], results[i]);
        }
    }

    if (!isRestoring) saveGameState(guess);
    
    if (correct === 5) { 
        gameOver = true; 
        if (!isRestoring) finalizeGame(POINTS_TABLE[currentAttempt + 1], true); 
    }
    else if (currentAttempt === 5) { 
        gameOver = true; 
        if (!isRestoring) finalizeGame(calculateLossPoints(guess, targetWord), false); 
    }
    else { currentAttempt++; currentTile = 0; }
}
initGame();