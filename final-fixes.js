(() => {
    const UORDOUL_DATE = { year: 2026, month: 3, day: 2 };
    const MULTI_DATE = { year: 2026, month: 8, day: 8 };
    const MODE_LABELS = {
        uordoul: 'Uordoul',
        duordoul: 'Duordoul',
        fourdoul: 'Fourdoul'
    };

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
        const latest = new Date(Math.max(...dates.map(date => date.getTime())));
        return latest.toLocaleDateString('pt-BR');
    }

    if (typeof loadLeaderboard === 'function') {
        const originalLoadLeaderboard = loadLeaderboard;

        loadLeaderboard = async function(selectedMode = 'general') {
            if (selectedMode !== 'general') {
                setStandardLeaderboardHeader(selectedMode === 'palpitada' ? 'Partidas' : 'Win Rate');
                return originalLoadLeaderboard(selectedMode);
            }

            if (typeof currentLeaderboardMode !== 'undefined') currentLeaderboardMode = 'general';
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

                users.sort((a, b) => {
                    if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
                    return b.rankingWinRate - a.rankingWinRate;
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
                        <td class="center-cell">${user.lastPlayedDate}</td>
                        <td class="center-cell">${user.daysPlayed}</td>
                        <td class="center-cell">${Math.round(user.rankingWinRate * 100)}%</td>
                    `;
                    body.appendChild(tr);
                });

                if (!users.length) body.innerHTML = "<tr><td colspan='5'>Nenhum jogador encontrado.</td></tr>";
            } catch (error) {
                console.error(error);
                body.innerHTML = "<tr><td colspan='5'>Não foi possível carregar o ranking.</td></tr>";
            }
        };

        const palpitadaTab = document.querySelector('.leaderboard-tab[data-leaderboard-mode="palpitada"]');
        if (palpitadaTab) {
            const originalPalpitadaHandler = palpitadaTab.onclick;
            palpitadaTab.onclick = event => {
                setStandardLeaderboardHeader('Partidas');
                if (originalPalpitadaHandler) return originalPalpitadaHandler.call(palpitadaTab, event);
                return loadLeaderboard('palpitada');
            };
        }
    }

    // Impede uma segunda entrada enquanto a palavra ainda está sendo corrigida.
    // Sem essa trava, um segundo ENTER podia iniciar checkWord/applyGuess em paralelo,
    // avançando tentativas e também dessincronizando o estado usado no compartilhamento.
    if (typeof checkWord === 'function' && typeof handleKeyPress === 'function') {
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
    }

    // Ao voltar a um modo já realizado hoje, exibe o número do desafio diário.
    if (typeof showResultModal === 'function') {
        const originalShowResultModal = showResultModal;

        showResultModal = function(isWin, pointsChange, totalPoints, rankDetails, jogos, vitorias, alreadyPlayed = false, oldElo = null) {
            const result = originalShowResultModal.apply(this, arguments);

            if (alreadyPlayed) {
                const title = document.getElementById('result-title');
                const modeKey = typeof currentModeKey !== 'undefined' ? currentModeKey : 'uordoul';
                const gameNumber = typeof diffInDays !== 'undefined' ? diffInDays : null;
                if (title && gameNumber !== null) {
                    title.innerText = `${MODE_LABELS[modeKey] || 'Uordoul'} #${gameNumber} Realizado`;
                }
            }

            return result;
        };
    }

    if (typeof showGeoResultModal === 'function') {
        const originalShowGeoResultModal = showGeoResultModal;

        showGeoResultModal = function(result, alreadyPlayed) {
            const returnValue = originalShowGeoResultModal.apply(this, arguments);

            if (alreadyPlayed) {
                const title = document.getElementById('result-title');
                const gameNumber = typeof geoDayIndex !== 'undefined' ? geoDayIndex : null;
                if (title && gameNumber !== null) {
                    title.innerText = `Palpitada Geográfica #${gameNumber} Realizado`;
                }
            }

            return returnValue;
        };
    }

    // Comportamento de combo: fecha ao escolher um modo, clicar fora ou pressionar Esc.
    const gameNav = document.getElementById('game-nav');
    const menuToggle = document.getElementById('menu-toggle');

    function closeGameNav() {
        if (!gameNav || !menuToggle) return;
        gameNav.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
    }

    if (gameNav && menuToggle) {
        gameNav.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => setTimeout(closeGameNav, 0));
        });

        document.addEventListener('click', event => {
            if (!gameNav.classList.contains('open')) return;
            if (gameNav.contains(event.target) || menuToggle.contains(event.target)) return;
            closeGameNav();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeGameNav();
        });
    }
})();
