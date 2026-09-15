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
    return { distanceKm, rawScore, adjustedScore: Math.round(rawScore / 10), guessLL, actualLL };
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

/* Ajustes consolidados que antes estavam em arquivos auxiliares. */
(() => {
    const UORDOUL_DATE = { year: 2026, month: 3, day: 2 };
    const MULTI_DATE = { year: 2026, month: 8, day: 8 };

    function setGeneralLeaderboardHeader() {
        const row = document.querySelector('#leaderboard-table thead tr');
        if (!row) return;
        row.innerHTML = `<th>Jogador</th><th class="center-cell">Pontos</th><th class="center-cell">Último dia jogado</th><th class="center-cell">Dias jogados</th><th class="center-cell">Win Rate</th>`;
    }
    function setStandardLeaderboardHeader(lastLabel = 'Win Rate') {
        const row = document.querySelector('#leaderboard-table thead tr');
        if (!row) return;
        row.innerHTML = `<th>Jogador</th><th class="center-cell">Pontos</th><th class="center-cell">Patente</th><th id="leaderboard-last-header" class="center-cell">${lastLabel}</th>`;
    }
    function dateFromDayIndex(value, base) {
        const index = Number(value); if (!Number.isFinite(index) || index < 0) return null;
        const date = new Date(base.year, base.month, base.day); date.setDate(date.getDate() + index); return date;
    }
    function dateFromKey(value) {
        if (typeof value !== 'string') return null;
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!match) return null;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])); return Number.isNaN(date.getTime()) ? null : date;
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

    const originalLoadLeaderboard = loadLeaderboard;
    loadLeaderboard = async function(selectedMode = 'general') {
        if (selectedMode !== 'general') {
            setStandardLeaderboardHeader(selectedMode === 'palpitada' ? 'Partidas' : 'Win Rate');
            return originalLoadLeaderboard(selectedMode);
        }
        setGeneralLeaderboardHeader();
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        document.getElementById('leaderboard-title').innerText = '🏆 Ranking: Geral';
        document.querySelectorAll('.leaderboard-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.leaderboardMode === 'general'));
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
                users.push({ ...user, rankingPoints: points, rankingWinRate: games ? wins / games : 0, lastPlayedDate: getLastPlayedDate(user), daysPlayed: user.jogosJogados || 0 });
            });
            users.sort((a, b) => b.rankingPoints !== a.rankingPoints ? b.rankingPoints - a.rankingPoints : b.rankingWinRate - a.rankingWinRate);
            body.innerHTML = '';
            users.slice(0, 50).forEach((user, index) => {
                const row = document.createElement('tr');
                row.innerHTML = `<td><div class="lb-user"><span class="lb-pos">${index + 1}º</span><img src="${user.avatar || ''}" class="lb-avatar" referrerpolicy="no-referrer" alt=""><strong>${user.nome || 'Jogador'}</strong></div></td><td class="center-cell"><span class="lb-pts">${user.rankingPoints}</span></td><td class="center-cell">${user.lastPlayedDate}</td><td class="center-cell">${user.daysPlayed}</td><td class="center-cell">${Math.round(user.rankingWinRate * 100)}%</td>`;
                body.appendChild(row);
            });
            if (!users.length) body.innerHTML = "<tr><td colspan='5'>Nenhum jogador encontrado.</td></tr>";
        } catch (error) {
            console.error(error); body.innerHTML = "<tr><td colspan='5'>Não foi possível carregar o ranking.</td></tr>";
        }
    };
    document.querySelectorAll('.leaderboard-tab').forEach(tab => { tab.onclick = () => loadLeaderboard(tab.dataset.leaderboardMode); });

    const originalShowGeoResultModal = showGeoResultModal;
    showGeoResultModal = function(result, alreadyPlayed) {
        const returnValue = originalShowGeoResultModal.apply(this, arguments);
        if (alreadyPlayed) {
            const title = document.getElementById('result-title');
            if (title) title.innerText = `Palpitada Geográfica #${geoDayIndex} Realizado`;
        }
        return returnValue;
    };

    const gameNav = document.getElementById('game-nav');
    const menuToggle = document.getElementById('menu-toggle');
    function closeGameNav() {
        if (!gameNav || !menuToggle) return;
        gameNav.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false');
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

    const panel = document.getElementById('map-panel');
    if (panel && !document.getElementById('map-resize-handle')) {
        const handle = document.createElement('div');
        handle.id = 'map-resize-handle';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'horizontal');
        handle.setAttribute('aria-label', 'Arraste para aumentar ou diminuir o mapa');
        handle.title = 'Arraste para ajustar o tamanho do mapa';
        panel.prepend(handle);
        let resizing = false, startY = 0, startHeight = 0, activePointerId = null;
        const getLimits = () => {
            const game = document.getElementById('geo-game');
            const availableHeight = game ? game.clientHeight : window.innerHeight;
            const maxHeight = Math.max(260, availableHeight - (window.innerWidth <= 760 ? 12 : 20));
            const preferredMin = window.innerWidth <= 760 ? 200 : 220;
            return { minHeight: Math.min(preferredMin, Math.max(140, maxHeight - 80)), maxHeight };
        };
        const resizeGoogleMap = () => { try { if (google.maps && google.maps.event && map) google.maps.event.trigger(map, 'resize'); } catch (_) {} };
        handle.addEventListener('pointerdown', event => {
            if (!panel.classList.contains('open')) return;
            resizing = true; activePointerId = event.pointerId; startY = event.clientY; startHeight = panel.getBoundingClientRect().height;
            document.body.classList.add('map-panel-resizing'); if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId); event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!resizing || event.pointerId !== activePointerId) return;
            const { minHeight, maxHeight } = getLimits();
            const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + startY - event.clientY));
            panel.style.height = `${Math.round(nextHeight)}px`; resizeGoogleMap(); event.preventDefault();
        });
        const stopResize = event => {
            if (!resizing || (event && activePointerId !== null && event.pointerId !== activePointerId)) return;
            resizing = false; document.body.classList.remove('map-panel-resizing');
            if (activePointerId !== null && handle.hasPointerCapture && handle.hasPointerCapture(activePointerId)) handle.releasePointerCapture(activePointerId);
            activePointerId = null; resizeGoogleMap();
        };
        handle.addEventListener('pointerup', stopResize); handle.addEventListener('pointercancel', stopResize);
        handle.addEventListener('dblclick', () => { panel.style.height = ''; setTimeout(resizeGoogleMap, 0); });
        window.addEventListener('resize', () => {
            if (!panel.style.height) return;
            const { minHeight, maxHeight } = getLimits();
            panel.style.height = `${Math.round(Math.min(maxHeight, Math.max(minHeight, panel.getBoundingClientRect().height)))}px`; resizeGoogleMap();
        });
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
    function normalizeWord(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); }
    function safeJson(value) { try { return JSON.parse(value); } catch (_) { return null; } }
    function getDayIndex(startDate) { return Math.max(0, Math.floor((new Date() - startDate) / DAY_MS)); }
    function shareDateKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`;
    }
    function getTargetWordFromLines(lines, config, dayIndex, boardIndex) {
        const requestedLine = config.startLine + (config.boards === 1 ? dayIndex : dayIndex * config.boards + boardIndex), zeroBased = requestedLine - 1, segmentStart = config.startLine - 1;
        const segmentEndExclusive = config.startLine === 1 ? Math.min(lines.length, 1999) : config.startLine === 2000 ? Math.min(lines.length, 3999) : lines.length;
        const segmentLength = Math.max(1, segmentEndExclusive - segmentStart), wrappedIndex = segmentStart + (((zeroBased - segmentStart) % segmentLength) + segmentLength) % segmentLength;
        return String(lines[wrappedIndex] || '').trim().toUpperCase();
    }
    function evaluateShareGuess(guess, target) {
        const guessLetters = normalizeWord(guess).split(''), targetLetters = normalizeWord(target).split(''), result = new Array(5).fill('absent');
        for (let i = 0; i < 5; i++) if (guessLetters[i] === targetLetters[i]) { result[i] = 'correct'; guessLetters[i] = null; targetLetters[i] = null; }
        for (let i = 0; i < 5; i++) if (guessLetters[i] !== null && targetLetters.includes(guessLetters[i])) { result[i] = 'present'; targetLetters[targetLetters.indexOf(guessLetters[i])] = null; }
        return result;
    }
    function buildBoardRows(guesses, target) { const rows = []; for (const guess of guesses) { rows.push(evaluateShareGuess(guess, target)); if (normalizeWord(guess) === normalizeWord(target)) break; } return rows; }
    async function getWordModeData() {
        const response = await fetch('PalavrasTermo.txt', { cache: 'no-store' }); if (!response.ok) throw new Error('Não foi possível carregar PalavrasTermo.txt');
        const lines = (await response.text()).replace(/\r/g, '').split('\n'), result = {};
        Object.entries(WORD_MODES).forEach(([key, config]) => {
            const dayIndex = getDayIndex(config.startDate), state = safeJson(localStorage.getItem(config.stateKey));
            const played = !!(state && state.dia === dayIndex && Array.isArray(state.tentativas) && state.tentativas.length > 0);
            const targets = Array.from({ length: config.boards }, (_, boardIndex) => getTargetWordFromLines(lines, config, dayIndex, boardIndex));
            result[key] = { ...config, dayIndex, played, guesses: played ? state.tentativas.slice(0, config.attempts) : [], targets, boards: played ? targets.map(target => buildBoardRows(state.tentativas, target)) : [] };
        });
        return result;
    }
    async function getPalpitadaData() {
        const user = firebase.auth().currentUser, todayKey = shareDateKey(); if (!user) return { played: false, dateKey: todayKey };
        try {
            const snapshot = await firebase.firestore().collection('usuarios').doc(user.uid).get(); if (!snapshot.exists) return { played: false, dateKey: todayKey };
            const data = snapshot.data(), played = data.ultimoDiaPalpitadaKey === todayKey;
            return { played, dateKey: todayKey, distanceKm: played ? Number(data.ultimaDistanciaPalpitada || 0) : null, score: played ? Number(data.ultimaPontuacaoPalpitada || 0) : null };
        } catch (error) { console.warn('Não foi possível ler o resultado da Palpitada para compartilhamento.', error); return { played: false, dateKey: todayKey }; }
    }
    function roundedRect(ctx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r); ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height); ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
    }
    function drawTrackedText(ctx, text, centerX, y, spacing) {
        const chars = String(text).split(''), widths = chars.map(char => ctx.measureText(char).width), totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, chars.length - 1) * spacing; let x = centerX - totalWidth / 2;
        chars.forEach((char, index) => { ctx.fillText(char, x, y); x += widths[index] + spacing; });
    }
    function getPalette() {
        const styles = getComputedStyle(document.documentElement); return { bg: (styles.getPropertyValue('--bg') || '#121213').trim(), correct: (styles.getPropertyValue('--correct') || '#6aaa64').trim(), present: (styles.getPropertyValue('--present') || '#c9b458').trim(), absent: (styles.getPropertyValue('--absent') || '#4e4646').trim(), border: (styles.getPropertyValue('--border') || '#3a3a3c').trim(), key: (styles.getPropertyValue('--key-bg') || '#818384').trim(), text: '#ffffff', muted: '#bfc0c2', panel: '#181819' };
    }
    function drawPanel(ctx, panel, title, subtitle, palette) {
        ctx.fillStyle = palette.panel; roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 24); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = palette.key; ctx.stroke();
        ctx.fillStyle = palette.text; ctx.font = '700 29px Arial, sans-serif'; ctx.textAlign = 'left'; drawTrackedText(ctx, title, panel.x + panel.w / 2, panel.y + 45, 2.1);
        if (subtitle) { ctx.fillStyle = palette.muted; ctx.font = '600 17px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(subtitle, panel.x + panel.w - 18, panel.y + 46); }
        ctx.fillStyle = palette.correct; roundedRect(ctx, panel.x + panel.w / 2 - 34, panel.y + 60, 68, 4, 2); ctx.fill();
    }
    function drawNotPlayed(ctx, panel, palette) { ctx.fillStyle = palette.muted; ctx.font = '700 27px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Ainda não jogado', panel.x + panel.w / 2, panel.y + panel.h / 2 + 8); }
    function tileColor(state, palette) { return state === 'correct' ? palette.correct : state === 'present' ? palette.present : palette.absent; }
    function drawBoard(ctx, rows, area, palette, options = {}) {
        const cols = 5, maxRows = Math.max(1, rows.length), gap = options.gap ?? 7, rowGap = options.rowGap ?? gap, maxTileByWidth = (area.w - gap * (cols - 1)) / cols, maxTileByHeight = (area.h - rowGap * (maxRows - 1)) / maxRows;
        const tile = Math.max(7, Math.min(options.maxTile || 54, maxTileByWidth, maxTileByHeight)), totalWidth = tile * cols + gap * (cols - 1), totalHeight = tile * maxRows + rowGap * (maxRows - 1), startX = area.x + (area.w - totalWidth) / 2, startY = area.y + (area.h - totalHeight) / 2;
        rows.forEach((row, rowIndex) => row.forEach((state, colIndex) => { const x = startX + colIndex * (tile + gap), y = startY + rowIndex * (tile + rowGap); ctx.fillStyle = tileColor(state, palette); roundedRect(ctx, x, y, tile, tile, Math.max(3, tile * 0.08)); ctx.fill(); ctx.lineWidth = Math.max(1, tile * 0.035); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke(); }));
    }
    function drawUordoul(ctx, panel, data, palette) { drawPanel(ctx, panel, 'UORDOUL', `#${data.dayIndex}`, palette); if (!data.played) return drawNotPlayed(ctx, panel, palette); drawBoard(ctx, data.boards[0], { x: panel.x + 72, y: panel.y + 88, w: panel.w - 144, h: panel.h - 120 }, palette, { maxTile: 52, gap: 9, rowGap: 9 }); }
    function drawDuordoul(ctx, panel, data, palette) { drawPanel(ctx, panel, 'DUORDOUL', `#${data.dayIndex}`, palette); if (!data.played) return drawNotPlayed(ctx, panel, palette); const innerY = panel.y + 92, innerH = panel.h - 128, halfW = (panel.w - 74) / 2; drawBoard(ctx, data.boards[0], { x: panel.x + 28, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 }); drawBoard(ctx, data.boards[1], { x: panel.x + 46 + halfW, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 }); }
    function drawFourdoul(ctx, panel, data, palette) { drawPanel(ctx, panel, 'FOURDOUL', `#${data.dayIndex}`, palette); if (!data.played) return drawNotPlayed(ctx, panel, palette); const left = panel.x + 26, top = panel.y + 86, cellW = (panel.w - 68) / 2, cellH = (panel.h - 120) / 2; const areas = [{ x: left, y: top, w: cellW, h: cellH }, { x: left + cellW + 16, y: top, w: cellW, h: cellH }, { x: left, y: top + cellH + 12, w: cellW, h: cellH }, { x: left + cellW + 16, y: top + cellH + 12, w: cellW, h: cellH }]; data.boards.forEach((rows, index) => drawBoard(ctx, rows, areas[index], palette, { maxTile: 18, gap: 4, rowGap: 4 })); }
    function drawPalpitada(ctx, panel, data, palette) { drawPanel(ctx, panel, 'PALPITADA GEO', '', palette); if (!data.played) return drawNotPlayed(ctx, panel, palette); const cx = panel.x + panel.w / 2, cy = panel.y + panel.h / 2 + 20, radius = 110; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = palette.correct; ctx.stroke(); ctx.fillStyle = palette.text; ctx.font = '700 38px Arial, sans-serif'; ctx.textAlign = 'center'; const distance = Number(data.distanceKm || 0); ctx.fillText(`${distance.toFixed(distance >= 100 ? 0 : 1)} km`, cx, cy - 4); ctx.fillStyle = palette.present; ctx.font = '700 24px Arial, sans-serif'; ctx.fillText(`${Number(data.score || 0)} pts`, cx, cy + 39); }
    async function buildImage() {
        const [wordModes, palpitada] = await Promise.all([getWordModeData(), getPalpitadaData()]); if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
        const palette = getPalette(), canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1200; const ctx = canvas.getContext('2d');
        ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 1200, 1200); ctx.fillStyle = '#151516'; roundedRect(ctx, 42, 42, 1116, 1116, 34); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = palette.key; ctx.stroke();
        ctx.fillStyle = palette.text; ctx.font = '700 33px Arial, sans-serif'; ctx.textAlign = 'left'; drawTrackedText(ctx, 'RESULTADO DO DIA', 600, 92, 2.2);
        const panels = { uordoul: { x: 78, y: 126, w: 504, h: 472 }, duordoul: { x: 618, y: 126, w: 504, h: 472 }, fourdoul: { x: 78, y: 628, w: 504, h: 472 }, palpitada: { x: 618, y: 628, w: 504, h: 472 } };
        drawUordoul(ctx, panels.uordoul, wordModes.uordoul, palette); drawDuordoul(ctx, panels.duordoul, wordModes.duordoul, palette); drawFourdoul(ctx, panels.fourdoul, wordModes.fourdoul, palette); drawPalpitada(ctx, panels.palpitada, palpitada, palette);
        ctx.fillStyle = palette.muted; ctx.font = '600 17px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('UORDOUL', 600, 1137);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1)); if (!blob) throw new Error('Não foi possível gerar a imagem.'); return { blob, dateKey: shareDateKey() };
    }
    function ensureShareSheet() {
        let overlay = document.getElementById('uordoul-share-overlay'); if (overlay) return overlay;
        overlay = document.createElement('div'); overlay.id = 'uordoul-share-overlay'; overlay.className = 'uordoul-share-overlay hidden'; overlay.innerHTML = `<section class="uordoul-share-sheet" role="dialog" aria-modal="true" aria-labelledby="uordoul-share-title"><div class="uordoul-share-header"><h2 id="uordoul-share-title">Compartilhar Resultado</h2><button type="button" class="uordoul-share-close" aria-label="Fechar">×</button></div><img class="uordoul-share-preview" alt="Imagem com os resultados de hoje"><div class="uordoul-share-actions"><button type="button" class="uordoul-share-action primary" data-share-action="native">Compartilhar</button><button type="button" class="uordoul-share-action" data-share-action="copy">Copiar imagem</button><button type="button" class="uordoul-share-action" data-share-action="download">Baixar imagem</button></div><div class="uordoul-share-status" aria-live="polite"></div></section>`; document.body.appendChild(overlay);
        overlay.querySelector('.uordoul-share-close').addEventListener('click', closeShareSheet); overlay.addEventListener('click', event => { if (event.target === overlay) closeShareSheet(); }); document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.classList.contains('hidden')) closeShareSheet(); }); return overlay;
    }
    function setShareStatus(message) { const status = document.querySelector('.uordoul-share-status'); if (status) status.textContent = message || ''; }
    function closeShareSheet() { const overlay = document.getElementById('uordoul-share-overlay'); if (overlay) overlay.classList.add('hidden'); if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; } }
    function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    async function openShareSheet(triggerButton) {
        const originalText = triggerButton ? triggerButton.textContent : ''; if (triggerButton) { triggerButton.disabled = true; triggerButton.textContent = 'Gerando imagem...'; }
        try {
            const { blob, dateKey } = await buildImage(), overlay = ensureShareSheet(), preview = overlay.querySelector('.uordoul-share-preview'), filename = `uordoul-resultado-${dateKey}.png`, file = new File([blob], filename, { type: 'image/png' });
            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = URL.createObjectURL(blob); preview.src = currentObjectUrl; setShareStatus('');
            const nativeButton = overlay.querySelector('[data-share-action="native"]'), copyButton = overlay.querySelector('[data-share-action="copy"]'), downloadButton = overlay.querySelector('[data-share-action="download"]');
            nativeButton.onclick = async () => { if (!navigator.share) return setShareStatus('O compartilhamento nativo não está disponível neste navegador.'); if (navigator.canShare && !navigator.canShare({ files: [file] })) return setShareStatus('Este navegador não permite compartilhar a imagem como arquivo. Use Copiar imagem ou Baixar imagem.'); try { await navigator.share({ title: 'Resultado do Uordoul', text: 'Meu resultado de hoje no Uordoul', files: [file] }); } catch (error) { if (error && error.name !== 'AbortError') { console.error(error); setShareStatus('Não foi possível abrir o compartilhamento do sistema.'); } } };
            copyButton.onclick = async () => { if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return setShareStatus('Seu navegador não permite copiar imagens. Use Baixar imagem.'); try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setShareStatus('Imagem copiada para a área de transferência.'); } catch (error) { console.error(error); setShareStatus('Não foi possível copiar a imagem. Use Baixar imagem.'); } };
            downloadButton.onclick = () => { downloadBlob(blob, filename); setShareStatus('Imagem baixada.'); }; overlay.classList.remove('hidden');
        } catch (error) { console.error(error); showToast('Não foi possível gerar o resultado para compartilhar.'); }
        finally { if (triggerButton) { triggerButton.disabled = false; triggerButton.textContent = originalText || 'Compartilhar Resultado'; } }
    }
    document.addEventListener('click', event => { const button = event.target.closest && event.target.closest('#share-btn'); if (!button) return; event.preventDefault(); event.stopImmediatePropagation(); openShareSheet(button); }, true);
    window.UordoulShare = { open: () => { const button = document.getElementById('share-btn'); if (button) openShareSheet(button); } };
})();
