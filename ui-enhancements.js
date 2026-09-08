(() => {
    const WORD_MODE_LABELS = {
        uordoul: 'Uordoul',
        duordoul: 'Duordoul',
        fourdoul: 'Fourdoul'
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

    function getWordAnswersText() {
        try {
            if (typeof targetWords === 'undefined' || !Array.isArray(targetWords)) return '';
            const words = targetWords.map(word => String(word || '').trim().toUpperCase()).filter(Boolean);
            if (!words.length) return '';
            if (words.length === 1) return `A palavra era ${words[0]}`;
            return `As palavras eram ${words.join(', ')}`;
        } catch (_) {
            return '';
        }
    }

    if (typeof showResultModal === 'function') {
        const previousShowResultModal = showResultModal;

        showResultModal = function(isWin, pointsChange, totalPoints, rankDetails, jogos, vitorias, alreadyPlayed = false, oldElo = null) {
            const returnValue = previousShowResultModal.apply(this, arguments);
            const answer = ensureAnswerTextElement();

            if (answer) {
                answer.innerText = '';
                answer.classList.add('hidden');
            }

            if (alreadyPlayed) {
                const title = document.getElementById('result-title');
                const modeKey = typeof currentModeKey !== 'undefined' ? currentModeKey : 'uordoul';
                const gameNumber = typeof diffInDays !== 'undefined' ? diffInDays : null;
                const answerText = getWordAnswersText();

                if (title && gameNumber !== null && WORD_MODE_LABELS[modeKey]) {
                    title.innerText = `${WORD_MODE_LABELS[modeKey]} #${gameNumber} Realizado!`;
                }

                if (answer && answerText) {
                    answer.innerText = answerText;
                    answer.classList.remove('hidden');
                }
            }

            return returnValue;
        };
    }

    function setupResizableMapPanel() {
        const panel = document.getElementById('map-panel');
        if (!panel || document.getElementById('map-resize-handle')) return;

        const handle = document.createElement('div');
        handle.id = 'map-resize-handle';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'horizontal');
        handle.setAttribute('aria-label', 'Arraste para aumentar ou diminuir o mapa');
        handle.title = 'Arraste para ajustar o tamanho do mapa';
        panel.prepend(handle);

        let resizing = false;
        let startY = 0;
        let startHeight = 0;
        let activePointerId = null;

        const getLimits = () => {
            const game = document.getElementById('geo-game');
            const availableHeight = game ? game.clientHeight : window.innerHeight;
            const maxHeight = Math.max(260, availableHeight - (window.innerWidth <= 760 ? 12 : 20));
            const preferredMin = window.innerWidth <= 760 ? 200 : 220;
            const minHeight = Math.min(preferredMin, Math.max(140, maxHeight - 80));
            return { minHeight, maxHeight };
        };

        const resizeGoogleMap = () => {
            try {
                if (typeof google !== 'undefined' && google.maps && google.maps.event && typeof map !== 'undefined' && map) {
                    google.maps.event.trigger(map, 'resize');
                }
            } catch (_) {}
        };

        const onPointerMove = event => {
            if (!resizing || event.pointerId !== activePointerId) return;
            const { minHeight, maxHeight } = getLimits();
            const delta = startY - event.clientY;
            const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + delta));
            panel.style.height = `${Math.round(nextHeight)}px`;
            resizeGoogleMap();
            event.preventDefault();
        };

        const stopResize = event => {
            if (!resizing) return;
            if (event && activePointerId !== null && event.pointerId !== activePointerId) return;
            resizing = false;
            document.body.classList.remove('map-panel-resizing');
            if (activePointerId !== null && handle.hasPointerCapture && handle.hasPointerCapture(activePointerId)) {
                handle.releasePointerCapture(activePointerId);
            }
            activePointerId = null;
            resizeGoogleMap();
        };

        handle.addEventListener('pointerdown', event => {
            if (!panel.classList.contains('open')) return;
            resizing = true;
            activePointerId = event.pointerId;
            startY = event.clientY;
            startHeight = panel.getBoundingClientRect().height;
            document.body.classList.add('map-panel-resizing');
            if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', stopResize);
        handle.addEventListener('pointercancel', stopResize);
        handle.addEventListener('dblclick', () => {
            panel.style.height = '';
            setTimeout(resizeGoogleMap, 0);
        });

        window.addEventListener('resize', () => {
            if (!panel.style.height) return;
            const { minHeight, maxHeight } = getLimits();
            const currentHeight = panel.getBoundingClientRect().height;
            const adjustedHeight = Math.min(maxHeight, Math.max(minHeight, currentHeight));
            panel.style.height = `${Math.round(adjustedHeight)}px`;
            resizeGoogleMap();
        });
    }

    setupResizableMapPanel();
})();
