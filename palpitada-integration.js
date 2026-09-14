(() => {
    const palpitadaTab = document.querySelector('.leaderboard-tab[data-leaderboard-mode="palpitada"]');
    if (!palpitadaTab) return;

    const lastHeader = document.getElementById('leaderboard-last-header');
    const originalOpenLeaderboard = document.getElementById('open-leaderboard-btn').onclick;
    const originalModalLeaderboard = document.getElementById('modal-leaderboard-btn').onclick;

    document.querySelectorAll('.leaderboard-tab:not([data-leaderboard-mode="palpitada"])').forEach(tab => {
        const originalHandler = tab.onclick;
        tab.onclick = event => {
            if (lastHeader) lastHeader.innerText = 'Win Rate';
            if (originalHandler) return originalHandler.call(tab, event);
        };
    });

    document.getElementById('open-leaderboard-btn').onclick = event => {
        if (lastHeader) lastHeader.innerText = 'Win Rate';
        if (originalOpenLeaderboard) return originalOpenLeaderboard.call(document.getElementById('open-leaderboard-btn'), event);
    };

    document.getElementById('modal-leaderboard-btn').onclick = event => {
        if (lastHeader) lastHeader.innerText = 'Win Rate';
        if (originalModalLeaderboard) return originalModalLeaderboard.call(document.getElementById('modal-leaderboard-btn'), event);
    };

    palpitadaTab.onclick = async () => {
        document.getElementById('leaderboard-modal').classList.remove('hidden');
        document.getElementById('leaderboard-title').innerText = '🏆 Ranking: Palpitada';
        document.querySelectorAll('.leaderboard-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.leaderboardMode === 'palpitada');
        });
        if (lastHeader) lastHeader.innerText = 'Partidas';

        const body = document.getElementById('leaderboard-body');
        body.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";
        const snap = await db.collection('usuarios').get();
        const users = [];

        snap.forEach(doc => {
            const user = doc.data();
            const points = user.pontosPalpitada || 0;
            users.push({
                ...user,
                rankingPoints: points,
                rankingGames: user.jogosJogadosPalpitada || 0,
                rankingElo: getRankDetails(points).name
            });
        });

        users.sort((a, b) => {
            if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
            return b.rankingGames - a.rankingGames;
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
                <td class="center-cell">${user.rankingGames}</td>`;
            body.appendChild(tr);
        });
    };
})();
