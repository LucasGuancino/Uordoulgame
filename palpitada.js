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

const GEO_START_DATE = '2026-09-08';
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

const LEADERBOARD_MODES = {
    uordoul: { name: 'Uordoul', pointsField: 'pontos', gamesField: 'jogosJogados', winsField: 'vitorias' },
    duordoul: { name: 'Duordoul', pointsField: 'pontosDuordoul', gamesField: 'jogosJogadosDuordoul', winsField: 'vitoriasDuordoul' },
    fourdoul: { name: 'Fourdoul', pointsField: 'pontosFourdoul', gamesField: 'jogosJogadosFourdoul', winsField: 'vitoriasFourdoul' },
    palpitada: { name: 'Palpitada', pointsField: 'pontosPalpitada', gamesField: 'jogosJogadosPalpitada' }
};

let currentUser = null;
let gameOver = false;
let geoDayKey = '';
let geoDayIndex = 0;
let actualLocation = null;
let panorama = null;
let svService = null;
let map = null;
let guessMarker = null;
let actualMarker = null;
let flightPath = null;
let geoSeedState = 1;
let geoLastResult = null;
let mapsReadyResolver;
let mapUiInitialized = false;
const mapsReady = new Promise(resolve => { mapsReadyResolver = resolve; });

function initGoogleMaps() {
    mapsReadyResolver();
}

function getSaoPauloDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function dayIndexFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    const [startYear, startMonth, startDay] = GEO_START_DATE.split('-').map(Number);
    return Math.max(0, Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000));
}

function hashDateKey(key) {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
        hash ^= key.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
}

function seededRandom() {
    const x = Math.sin(geoSeedState++) * 10000;
    return x - Math.floor(x);
}

function getRandomLatLng() {
    return new google.maps.LatLng((seededRandom() * 130) - 60, (seededRandom() * 360) - 180);
}

function getRankDetails(points) {
    return RANKS.find(rank => points >= rank.min && points < rank.max) || RANKS[RANKS.length - 1];
}

function getRankImageName(name) {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '') + '.png';
}

function setupNavigation() {
    const menu = document.getElementById('game-nav');
    const toggle = document.getElementById('menu-toggle');
    toggle.onclick = () => {
        const isOpen = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    };
    document.querySelectorAll('.nav-item[data-href]').forEach(button => {
        button.onclick = () => { window.location.href = button.dataset.href; };
    });
}

function setupUserProfile(elo = 'Carregando...') {
    if (!currentUser) return;
    document.getElementById('user-avatar').src = currentUser.photoURL || '';
    document.getElementById('user-name').innerText = currentUser.displayName || 'Jogador';
    document.getElementById('user-rank').innerText = elo;
}

async function ensureGeoUserDocument() {
    const ref = db.collection('usuarios').doc(currentUser.uid);
    const doc = await ref.get();
    const defaults = {
        pontos: 0, elo: 'Sem Rank Ativo', ultimoDiaJogado: -1, jogosJogados: 0, vitorias: 0,
        pontosDuordoul: 0, eloDuordoul: 'Sem Rank Ativo', ultimoDiaJogadoDuordoul: -1, jogosJogadosDuordoul: 0, vitoriasDuordoul: 0,
        pontosFourdoul: 0, eloFourdoul: 'Sem Rank Ativo', ultimoDiaJogadoFourdoul: -1, jogosJogadosFourdoul: 0, vitoriasFourdoul: 0,
        pontosPalpitada: 0, eloPalpitada: 'Sem Rank Ativo', ultimoDiaJogadoPalpitada: -1, ultimoDiaPalpitadaKey: '',
        jogosJogadosPalpitada: 0, ultimaDistanciaPalpitada: null, ultimaPontuacaoPalpitada: 0
    };

    if (!doc.exists) {
        const data = { nome: currentUser.displayName || 'Jogador', avatar: currentUser.photoURL || '', ...defaults };
        await ref.set(data);
        return data;
    }

    const data = doc.data();
    const missing = {};
    Object.entries(defaults).forEach(([key, value]) => {
        if (data[key] === undefined) missing[key] = value;
    });
    if (Object.keys(missing).length) await ref.update(missing);
    return { ...defaults, ...data };
}

function initializeMapUI() {
    if (mapUiInitialized) return;
    mapUiInitialized = true;
    svService = new google.maps.StreetViewService();
    panorama = new google.maps.StreetViewPanorama(document.getElementById('street-view'), {
        pov: { heading: 34, pitch: 10 }, addressControl: false, showRoadLabels: false,
        zoomControl: true, fullscreenControl: false
    });
    map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: 0, lng: 0 }, zoom: 2, streetViewControl: false,
        mapTypeControl: false, fullscreenControl: false
    });

    map.addListener('click', event => {
        if (gameOver) return;
        if (guessMarker) guessMarker.setPosition(event.latLng);
        else guessMarker = new google.maps.Marker({ position: event.latLng, map, title: 'Seu Palpite' });
        document.getElementById('btn-guess').disabled = false;
    });

    document.getElementById('btn-open-map').onclick = () => {
        if (gameOver) return;
        document.getElementById('map-panel').classList.add('open');
        document.getElementById('btn-open-map').classList.add('hidden');
        setTimeout(() => google.maps.event.trigger(map, 'resize'), 250);
    };
    document.getElementById('btn-close-map').onclick = () => {
        document.getElementById('map-panel').classList.remove('open');
        if (!gameOver) document.getElementById('btn-open-map').classList.remove('hidden');
    };
    document.getElementById('btn-guess').onclick = submitGeoGuess;
}

function findDeterministicPanorama(attempt = 0) {
    if (attempt >= 120) return Promise.reject(new Error('Não foi possível encontrar um Street View válido para hoje.'));
    const request = { location: getRandomLatLng(), radius: 50000, source: google.maps.StreetViewSource.GOOGLE };
    return new Promise((resolve, reject) => {
        svService.getPanorama(request, (data, status) => {
            const copyright = (data && data.copyright ? data.copyright : '').toLowerCase();
            const valid = status === 'OK' && data && data.location && data.location.latLng &&
                data.links && data.links.length > 0 && copyright.includes('google');
            if (valid) {
                resolve({ lat: data.location.latLng.lat(), lng: data.location.latLng.lng() });
                return;
            }
            findDeterministicPanorama(attempt + 1).then(resolve).catch(reject);
        });
    });
}

async function loadDailyLocation() {
    const loading = document.getElementById('geo-loading');
    const loadingText = document.getElementById('geo-loading-text');
    loading.classList.remove('hidden');
    loadingText.innerText = 'Preparando a Palpitada Geográfica de hoje...';
    geoSeedState = hashDateKey(geoDayKey);
    const dailyRef = db.collection('palpitadaDiaria').doc(geoDayKey);

    try {
        const dailyDoc = await dailyRef.get();
        if (dailyDoc.exists) {
            const data = dailyDoc.data();
            if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) actualLocation = { lat: data.lat, lng: data.lng };
        }

        if (!actualLocation) {
            actualLocation = await findDeterministicPanorama();
            try {
                await dailyRef.set({
                    data: geoDayKey, indice: geoDayIndex, lat: actualLocation.lat, lng: actualLocation.lng,
                    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: false });
            } catch (writeError) {
                console.warn('Não foi possível persistir o local diário, usando a seed determinística.', writeError);
            }
        }

        panorama.setPosition(actualLocation);
        document.getElementById('btn-open-map').classList.toggle('hidden', gameOver);
        loading.classList.add('hidden');
    } catch (error) {
        console.error(error);
        loadingText.innerText = 'Não foi possível carregar o local de hoje. Recarregue a página.';
    }
}

function calculateGeoScore(lat, lng) {
    const guessLL = new google.maps.LatLng(lat, lng);
    const actualLL = new google.maps.LatLng(actualLocation.lat, actualLocation.lng);
    const distanceKm = google.maps.geometry.spherical.computeDistanceBetween(guessLL, actualLL) / 1000;
    let rawScore = Math.floor(5000 * Math.exp(-distanceKm / 2000));
    if (distanceKm < 0.1) rawScore = 5000;
    return { distanceKm, rawScore, adjustedScore: Math.round(rawScore / 100), guessLL, actualLL };
}

function revealGuessOnMap(calculation) {
    if (actualMarker) actualMarker.setMap(null);
    if (flightPath) flightPath.setMap(null);
    actualMarker = new google.maps.Marker({
        position: calculation.actualLL, map,
        icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png', title: 'Local correto'
    });
    flightPath = new google.maps.Polyline({
        path: [calculation.guessLL, calculation.actualLL], map,
        strokeColor: '#6aaa64', strokeOpacity: 1, strokeWeight: 3
    });
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(calculation.guessLL);
    bounds.extend(calculation.actualLL);
    map.fitBounds(bounds);
    document.getElementById('btn-close-map').classList.add('hidden');
    document.getElementById('btn-guess').classList.add('hidden');
    document.getElementById('geo-map-result').innerHTML =
        `Distância: <strong>${calculation.distanceKm.toFixed(2)} km</strong> &nbsp;•&nbsp; Pontuação: <strong>${calculation.adjustedScore}</strong>`;
}

async function submitGeoGuess() {
    if (gameOver || !currentUser || !guessMarker || !actualLocation) return;
    const button = document.getElementById('btn-guess');
    button.disabled = true;
    const lat = guessMarker.getPosition().lat();
    const lng = guessMarker.getPosition().lng();
    const calculation = calculateGeoScore(lat, lng);
    const userRef = db.collection('usuarios').doc(currentUser.uid);
    let result = null;

    try {
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(userRef);
            if (!snapshot.exists) throw new Error('Usuário não encontrado.');
            const data = snapshot.data();
            if (data.ultimoDiaJogadoPalpitada === geoDayIndex && data.ultimoDiaPalpitadaKey === geoDayKey) {
                result = {
                    alreadyPlayed: true, score: data.ultimaPontuacaoPalpitada || 0,
                    distanceKm: Number(data.ultimaDistanciaPalpitada || 0), totalPoints: data.pontosPalpitada || 0,
                    oldElo: data.eloPalpitada || getRankDetails(data.pontosPalpitada || 0).name,
                    games: data.jogosJogadosPalpitada || 0
                };
                return;
            }

            const oldPoints = data.pontosPalpitada || 0;
            const newPoints = Math.max(0, oldPoints + calculation.adjustedScore);
            const oldElo = data.eloPalpitada || getRankDetails(oldPoints).name;
            const rank = getRankDetails(newPoints);
            const games = (data.jogosJogadosPalpitada || 0) + 1;
            transaction.update(userRef, {
                pontosPalpitada: newPoints, eloPalpitada: rank.name,
                ultimoDiaJogadoPalpitada: geoDayIndex, ultimoDiaPalpitadaKey: geoDayKey,
                jogosJogadosPalpitada: games, ultimaDistanciaPalpitada: Number(calculation.distanceKm.toFixed(2)),
                ultimaPontuacaoPalpitada: calculation.adjustedScore,
                nome: currentUser.displayName || data.nome || 'Jogador', avatar: currentUser.photoURL || data.avatar || ''
            });
            result = {
                alreadyPlayed: false, score: calculation.adjustedScore, distanceKm: calculation.distanceKm,
                totalPoints: newPoints, oldElo, games
            };
        });
    } catch (error) {
        console.error(error);
        showToast('Não foi possível salvar sua palpitada. Tente novamente.');
        button.disabled = false;
        return;
    }

    if (result.alreadyPlayed) {
        gameOver = true;
        geoLastResult = result;
        showGeoResultModal(result, true);
        return;
    }

    gameOver = true;
    geoLastResult = result;
    revealGuessOnMap(calculation);
    setupUserProfile(getRankDetails(result.totalPoints).name);
    setTimeout(() => showGeoResultModal(result, false), 650);
}

function showGeoResultModal(result, alreadyPlayed) {
    const modal = document.getElementById('result-modal');
    const rank = getRankDetails(result.totalPoints);
    const oldElo = result.oldElo || rank.name;
    const oldIndex = RANKS.findIndex(item => item.name === oldElo);
    const newIndex = RANKS.findIndex(item => item.name === rank.name);
    const rankIcon = document.getElementById('result-rank-icon');
    document.getElementById('result-title').innerText = alreadyPlayed
        ? 'Palpitada Geográfica de hoje concluída' : 'Palpitada Geográfica';

    if (!alreadyPlayed && oldElo && newIndex > oldIndex) {
        rankIcon.src = `assets/${getRankImageName(oldElo)}`;
        setTimeout(() => {
            const sound = new Audio('assets/xpsound.mp3');
            sound.volume = 0.6;
            sound.play().catch(() => {});
            rankIcon.classList.add('rank-up-anim');
            setTimeout(() => { rankIcon.src = `assets/${getRankImageName(rank.name)}`; }, 750);
        }, 800);
    } else rankIcon.src = `assets/${getRankImageName(rank.name)}`;

    const changeText = document.getElementById('result-points-change');
    changeText.innerText = `+${result.score} pts`;
    changeText.className = 'positive-text';
    const nextRank = RANKS[newIndex + 1];
    document.getElementById('result-points-total').innerText = nextRank
        ? `Faltam ${Math.max(0, nextRank.min - result.totalPoints)} pts para ${nextRank.name}`
        : `Total: ${result.totalPoints} pts (Rank Máximo)`;

    const baseFill = document.getElementById('progress-bar-fill');
    const changeFill = document.getElementById('progress-change-fill');
    const range = Math.max(1, rank.max - rank.min);
    const previousPoints = alreadyPlayed ? result.totalPoints : Math.max(rank.min, result.totalPoints - result.score);
    const startPos = Math.max(0, Math.min(100, ((previousPoints - rank.min) / range) * 100));
    const endPos = Math.max(0, Math.min(100, ((result.totalPoints - rank.min) / range) * 100));
    baseFill.style.transition = 'none';
    changeFill.style.transition = 'none';
    baseFill.style.width = `${startPos}%`;
    changeFill.className = 'progress-change-fill positive';
    changeFill.style.left = `${startPos}%`;
    changeFill.style.width = '0%';
    changeFill.style.opacity = '1';
    if (!alreadyPlayed) {
        setTimeout(() => {
            changeFill.style.transition = 'width 1.5s ease-in-out';
            changeFill.style.width = `${Math.max(0, endPos - startPos)}%`;
        }, 1000);
    } else baseFill.style.width = `${endPos}%`;

    document.getElementById('result-stat-label').innerText = 'Distância do alvo:';
    document.getElementById('result-winrate').innerText = `${Number(result.distanceKm).toFixed(2)} km`;
    document.getElementById('share-btn').onclick = shareGeoResult;
    document.getElementById('modal-leaderboard-btn').onclick = () => {
        modal.classList.add('hidden');
        loadLeaderboard('palpitada');
    };
    document.getElementById('close-result-btn').onclick = () => {
        modal.classList.add('hidden');
        rankIcon.classList.remove('rank-up-anim');
    };
    modal.classList.remove('hidden');
}

function shareGeoResult() {
    if (!geoLastResult) return;
    const text = `A minha palpitada geografica de hoje foi de: ${Number(geoLastResult.distanceKm).toFixed(2)} km perto do alvo! Pontuação: ${geoLastResult.score}`;
    navigator.clipboard.writeText(text).then(() => {
        const button = document.getElementById('share-btn');
        button.innerText = '✅ Copiado!';
        setTimeout(() => { button.innerText = '📋 Copiar Resultado'; }, 2000);
    });
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 1200);
}

async function checkIfAlreadyPlayed() {
    const data = await ensureGeoUserDocument();
    const points = data.pontosPalpitada || 0;
    setupUserProfile(data.eloPalpitada || getRankDetails(points).name);
    if (data.ultimoDiaJogadoPalpitada === geoDayIndex && data.ultimoDiaPalpitadaKey === geoDayKey) {
        gameOver = true;
        geoLastResult = {
            alreadyPlayed: true, score: data.ultimaPontuacaoPalpitada || 0,
            distanceKm: Number(data.ultimaDistanciaPalpitada || 0), totalPoints: points,
            oldElo: data.eloPalpitada || getRankDetails(points).name,
            games: data.jogosJogadosPalpitada || 0
        };
        showGeoResultModal(geoLastResult, true);
    }
}

async function loadLeaderboard(selectedMode = 'general') {
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    const title = selectedMode === 'general' ? 'Geral' : LEADERBOARD_MODES[selectedMode].name;
    document.getElementById('leaderboard-title').innerText = `🏆 Ranking: ${title}`;
    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.leaderboardMode === selectedMode);
    });
    document.getElementById('leaderboard-last-header').innerText = selectedMode === 'palpitada' ? 'Partidas' : 'Win Rate';
    const body = document.getElementById('leaderboard-body');
    body.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";

    const snapshot = await db.collection('usuarios').get();
    const users = [];
    snapshot.forEach(doc => {
        const user = doc.data();
        let points = 0, games = 0, wins = 0;
        if (selectedMode === 'general') {
            points = (user.pontos || 0) + (user.pontosDuordoul || 0) + (user.pontosFourdoul || 0);
            games = (user.jogosJogados || 0) + (user.jogosJogadosDuordoul || 0) + (user.jogosJogadosFourdoul || 0);
            wins = (user.vitorias || 0) + (user.vitoriasDuordoul || 0) + (user.vitoriasFourdoul || 0);
        } else {
            const config = LEADERBOARD_MODES[selectedMode];
            points = user[config.pointsField] || 0;
            games = user[config.gamesField] || 0;
            wins = config.winsField ? (user[config.winsField] || 0) : 0;
        }
        users.push({
            ...user, rankingPoints: points, rankingGames: games,
            rankingElo: getRankDetails(points).name,
            wr: games && selectedMode !== 'palpitada' ? wins / games : 0
        });
    });

    users.sort((a, b) => {
        if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
        return selectedMode === 'palpitada' ? b.rankingGames - a.rankingGames : b.wr - a.wr;
    });

    body.innerHTML = '';
    users.slice(0, 50).forEach((user, index) => {
        const lastCell = selectedMode === 'palpitada' ? user.rankingGames : `${Math.round(user.wr * 100)}%`;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><div class="lb-user"><span class="lb-pos">${index + 1}º</span><img src="${user.avatar || ''}" class="lb-avatar" referrerpolicy="no-referrer" alt=""><strong>${user.nome || 'Jogador'}</strong></div></td>
            <td class="center-cell"><span class="lb-pts">${user.rankingPoints}</span></td>
            <td class="center-cell"><img src="assets/${getRankImageName(user.rankingElo)}" class="lb-rank-img" title="${user.rankingElo}" alt="${user.rankingElo}"></td>
            <td class="center-cell">${lastCell}</td>`;
        body.appendChild(row);
    });
}

async function startAuthenticatedGeoMode() {
    await mapsReady;
    initializeMapUI();
    await checkIfAlreadyPlayed();
    await loadDailyLocation();
}

setupNavigation();
geoDayKey = getSaoPauloDateKey();
geoDayIndex = dayIndexFromKey(geoDayKey);

document.getElementById('open-leaderboard-btn').onclick = () => loadLeaderboard('general');
document.getElementById('close-leaderboard-btn').onclick = () => document.getElementById('leaderboard-modal').classList.add('hidden');
document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    tab.onclick = () => loadLeaderboard(tab.dataset.leaderboardMode);
});
document.getElementById('logout-btn').onclick = () => auth.signOut();
document.getElementById('google-login-btn').onclick = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => console.error(error));
};

auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('profile').classList.remove('hidden');
        try {
            await startAuthenticatedGeoMode();
        } catch (error) {
            console.error(error);
            showToast('Não foi possível iniciar a Palpitada Geográfica.');
        }
    } else {
        currentUser = null;
        document.getElementById('login-modal').classList.remove('hidden');
        document.getElementById('profile').classList.add('hidden');
    }
});
