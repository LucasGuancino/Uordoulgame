(() => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WORD_MODES = {
        uordoul: {
            title: 'UORDOUL',
            stateKey: 'uordoulState',
            startDate: new Date('2026-04-02T00:00:00'),
            startLine: 1,
            boards: 1,
            attempts: 6
        },
        duordoul: {
            title: 'DUORDOUL',
            stateKey: 'duordoulState',
            startDate: new Date('2026-09-08T00:00:00'),
            startLine: 2000,
            boards: 2,
            attempts: 7
        },
        fourdoul: {
            title: 'FOURDOUL',
            stateKey: 'fourdoulState',
            startDate: new Date('2026-09-08T00:00:00'),
            startLine: 4000,
            boards: 4,
            attempts: 9
        }
    };

    let currentObjectUrl = null;

    function normalizeWord(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase();
    }

    function safeJson(value) {
        try {
            return JSON.parse(value);
        } catch (_) {
            return null;
        }
    }

    function getDayIndex(startDate) {
        return Math.max(0, Math.floor((new Date() - startDate) / DAY_MS));
    }

    function getSaoPauloDateKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function getTargetWordFromLines(lines, config, dayIndex, boardIndex) {
        const requestedLine = config.startLine + (config.boards === 1 ? dayIndex : dayIndex * config.boards + boardIndex);
        const zeroBased = requestedLine - 1;
        const segmentStart = config.startLine - 1;
        const segmentEndExclusive = config.startLine === 1
            ? Math.min(lines.length, 1999)
            : config.startLine === 2000
                ? Math.min(lines.length, 3999)
                : lines.length;
        const segmentLength = Math.max(1, segmentEndExclusive - segmentStart);
        const wrappedIndex = segmentStart + (((zeroBased - segmentStart) % segmentLength) + segmentLength) % segmentLength;
        return String(lines[wrappedIndex] || '').trim().toUpperCase();
    }

    function evaluateGuess(guess, target) {
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
            rows.push(evaluateGuess(guess, target));
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
            const played = !!(
                state &&
                state.dia === dayIndex &&
                Array.isArray(state.tentativas) &&
                state.tentativas.length > 0
            );

            const targets = Array.from({ length: config.boards }, (_, boardIndex) =>
                getTargetWordFromLines(lines, config, dayIndex, boardIndex)
            );

            result[key] = {
                ...config,
                dayIndex,
                played,
                guesses: played ? state.tentativas.slice(0, config.attempts) : [],
                targets,
                boards: played ? targets.map(target => buildBoardRows(state.tentativas, target)) : []
            };
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
            return {
                played,
                dateKey: todayKey,
                distanceKm: played ? Number(data.ultimaDistanciaPalpitada || 0) : null,
                score: played ? Number(data.ultimaPontuacaoPalpitada || 0) : null
            };
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
        chars.forEach((char, index) => {
            ctx.fillText(char, x, y);
            x += widths[index] + spacing;
        });
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
            text: '#ffffff',
            muted: '#bfc0c2',
            panel: '#181819'
        };
    }

    function drawPanel(ctx, panel, title, subtitle, palette) {
        ctx.fillStyle = palette.panel;
        roundedRect(ctx, panel.x, panel.y, panel.w, panel.h, 24);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = palette.key;
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.font = '700 29px Arial, sans-serif';
        ctx.textAlign = 'left';
        drawTrackedText(ctx, title, panel.x + panel.w / 2, panel.y + 45, 2.1);

        if (subtitle) {
            ctx.fillStyle = palette.muted;
            ctx.font = '600 17px Arial, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(subtitle, panel.x + panel.w - 18, panel.y + 46);
        }

        ctx.fillStyle = palette.correct;
        roundedRect(ctx, panel.x + panel.w / 2 - 34, panel.y + 60, 68, 4, 2);
        ctx.fill();
    }

    function drawNotPlayed(ctx, panel, palette) {
        ctx.fillStyle = palette.muted;
        ctx.font = '700 27px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Ainda não jogado', panel.x + panel.w / 2, panel.y + panel.h / 2 + 8);
    }

    function tileColor(state, palette) {
        if (state === 'correct') return palette.correct;
        if (state === 'present') return palette.present;
        return palette.absent;
    }

    function drawBoard(ctx, rows, area, palette, options = {}) {
        const cols = 5;
        const maxRows = Math.max(1, rows.length);
        const gap = options.gap ?? 7;
        const rowGap = options.rowGap ?? gap;
        const maxTileByWidth = (area.w - gap * (cols - 1)) / cols;
        const maxTileByHeight = (area.h - rowGap * (maxRows - 1)) / maxRows;
        const tile = Math.max(7, Math.min(options.maxTile || 54, maxTileByWidth, maxTileByHeight));
        const totalWidth = tile * cols + gap * (cols - 1);
        const totalHeight = tile * maxRows + rowGap * (maxRows - 1);
        const startX = area.x + (area.w - totalWidth) / 2;
        const startY = area.y + (area.h - totalHeight) / 2;

        rows.forEach((row, rowIndex) => {
            row.forEach((state, colIndex) => {
                const x = startX + colIndex * (tile + gap);
                const y = startY + rowIndex * (tile + rowGap);
                ctx.fillStyle = tileColor(state, palette);
                roundedRect(ctx, x, y, tile, tile, Math.max(3, tile * 0.08));
                ctx.fill();
                ctx.lineWidth = Math.max(1, tile * 0.035);
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.stroke();
            });
        });
    }

    function drawUordoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'UORDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);
        drawBoard(ctx, data.boards[0], {
            x: panel.x + 72,
            y: panel.y + 88,
            w: panel.w - 144,
            h: panel.h - 120
        }, palette, { maxTile: 52, gap: 9, rowGap: 9 });
    }

    function drawDuordoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'DUORDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);

        const innerY = panel.y + 92;
        const innerH = panel.h - 128;
        const halfW = (panel.w - 74) / 2;
        drawBoard(ctx, data.boards[0], { x: panel.x + 28, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 });
        drawBoard(ctx, data.boards[1], { x: panel.x + 46 + halfW, y: innerY, w: halfW, h: innerH }, palette, { maxTile: 26, gap: 5, rowGap: 6 });
    }

    function drawFourdoul(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'FOURDOUL', `#${data.dayIndex}`, palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);

        const left = panel.x + 26;
        const top = panel.y + 86;
        const cellW = (panel.w - 68) / 2;
        const cellH = (panel.h - 120) / 2;
        const areas = [
            { x: left, y: top, w: cellW, h: cellH },
            { x: left + cellW + 16, y: top, w: cellW, h: cellH },
            { x: left, y: top + cellH + 12, w: cellW, h: cellH },
            { x: left + cellW + 16, y: top + cellH + 12, w: cellW, h: cellH }
        ];

        data.boards.forEach((rows, index) => {
            drawBoard(ctx, rows, areas[index], palette, { maxTile: 18, gap: 4, rowGap: 4 });
        });
    }

    function drawPalpitada(ctx, panel, data, palette) {
        drawPanel(ctx, panel, 'PALPITADA GEO', '', palette);
        if (!data.played) return drawNotPlayed(ctx, panel, palette);

        const cx = panel.x + panel.w / 2;
        const cy = panel.y + panel.h / 2 + 20;
        const radius = 110;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = palette.correct;
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.font = '700 38px Arial, sans-serif';
        ctx.textAlign = 'center';
        const distance = Number(data.distanceKm || 0);
        ctx.fillText(`${distance.toFixed(distance >= 100 ? 0 : 1)} km`, cx, cy - 4);

        ctx.fillStyle = palette.present;
        ctx.font = '700 24px Arial, sans-serif';
        ctx.fillText(`${Number(data.score || 0)} pts`, cx, cy + 39);
    }

    async function buildImage() {
        const [wordModes, palpitada] = await Promise.all([
            getWordModeData(),
            getPalpitadaData()
        ]);

        if (document.fonts && document.fonts.ready) {
            try { await document.fonts.ready; } catch (_) {}
        }

        const palette = getPalette();
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#151516';
        roundedRect(ctx, 42, 42, 1116, 1116, 34);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = palette.key;
        ctx.stroke();

        ctx.fillStyle = palette.text;
        ctx.font = '700 33px Arial, sans-serif';
        ctx.textAlign = 'left';
        drawTrackedText(ctx, 'RESULTADO DO DIA', canvas.width / 2, 92, 2.2);

        const panels = {
            uordoul: { x: 78, y: 126, w: 504, h: 472 },
            duordoul: { x: 618, y: 126, w: 504, h: 472 },
            fourdoul: { x: 78, y: 628, w: 504, h: 472 },
            palpitada: { x: 618, y: 628, w: 504, h: 472 }
        };

        drawUordoul(ctx, panels.uordoul, wordModes.uordoul, palette);
        drawDuordoul(ctx, panels.duordoul, wordModes.duordoul, palette);
        drawFourdoul(ctx, panels.fourdoul, wordModes.fourdoul, palette);
        drawPalpitada(ctx, panels.palpitada, palpitada, palette);

        ctx.fillStyle = palette.muted;
        ctx.font = '600 17px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('UORDOUL', canvas.width / 2, 1137);

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1));
        if (!blob) throw new Error('Não foi possível gerar a imagem.');
        return { blob, dateKey: getSaoPauloDateKey() };
    }

    function ensureShareSheet() {
        let overlay = document.getElementById('uordoul-share-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'uordoul-share-overlay';
        overlay.className = 'uordoul-share-overlay hidden';
        overlay.innerHTML = `
            <section class="uordoul-share-sheet" role="dialog" aria-modal="true" aria-labelledby="uordoul-share-title">
                <div class="uordoul-share-header">
                    <h2 id="uordoul-share-title">Compartilhar Resultado</h2>
                    <button type="button" class="uordoul-share-close" aria-label="Fechar">×</button>
                </div>
                <img class="uordoul-share-preview" alt="Imagem com os resultados de hoje">
                <div class="uordoul-share-actions">
                    <button type="button" class="uordoul-share-action primary" data-share-action="native">Compartilhar</button>
                    <button type="button" class="uordoul-share-action" data-share-action="copy">Copiar imagem</button>
                    <button type="button" class="uordoul-share-action" data-share-action="download">Baixar imagem</button>
                </div>
                <div class="uordoul-share-status" aria-live="polite"></div>
            </section>
        `;
        document.body.appendChild(overlay);

        const close = () => closeShareSheet();
        overlay.querySelector('.uordoul-share-close').addEventListener('click', close);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !overlay.classList.contains('hidden')) close();
        });

        return overlay;
    }

    function setShareStatus(message) {
        const status = document.querySelector('.uordoul-share-status');
        if (status) status.textContent = message || '';
    }

    function closeShareSheet() {
        const overlay = document.getElementById('uordoul-share-overlay');
        if (overlay) overlay.classList.add('hidden');
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function openShareSheet(triggerButton) {
        const originalText = triggerButton ? triggerButton.textContent : '';
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.textContent = 'Gerando imagem...';
        }

        try {
            const { blob, dateKey } = await buildImage();
            const overlay = ensureShareSheet();
            const preview = overlay.querySelector('.uordoul-share-preview');
            const filename = `uordoul-resultado-${dateKey}.png`;
            const file = new File([blob], filename, { type: 'image/png' });

            if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = URL.createObjectURL(blob);
            preview.src = currentObjectUrl;
            setShareStatus('');

            const nativeButton = overlay.querySelector('[data-share-action="native"]');
            const copyButton = overlay.querySelector('[data-share-action="copy"]');
            const downloadButton = overlay.querySelector('[data-share-action="download"]');

            nativeButton.onclick = async () => {
                if (!navigator.share) {
                    setShareStatus('O compartilhamento nativo não está disponível neste navegador.');
                    return;
                }
                if (navigator.canShare && !navigator.canShare({ files: [file] })) {
                    setShareStatus('Este navegador não permite compartilhar a imagem como arquivo. Use Copiar imagem ou Baixar imagem.');
                    return;
                }
                try {
                    await navigator.share({
                        title: 'Resultado do Uordoul',
                        text: 'Meu resultado de hoje no Uordoul',
                        files: [file]
                    });
                } catch (error) {
                    if (error && error.name !== 'AbortError') {
                        console.error(error);
                        setShareStatus('Não foi possível abrir o compartilhamento do sistema.');
                    }
                }
            };

            copyButton.onclick = async () => {
                if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
                    setShareStatus('Seu navegador não permite copiar imagens. Use Baixar imagem.');
                    return;
                }
                try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    setShareStatus('Imagem copiada para a área de transferência.');
                } catch (error) {
                    console.error(error);
                    setShareStatus('Não foi possível copiar a imagem. Use Baixar imagem.');
                }
            };

            downloadButton.onclick = () => {
                downloadBlob(blob, filename);
                setShareStatus('Imagem baixada.');
            };

            overlay.classList.remove('hidden');
        } catch (error) {
            console.error(error);
            if (typeof showToast === 'function') showToast('Não foi possível gerar o resultado para compartilhar.');
            else alert('Não foi possível gerar o resultado para compartilhar.');
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                triggerButton.textContent = originalText || 'Compartilhar Resultado';
            }
        }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest && event.target.closest('#share-btn');
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openShareSheet(button);
    }, true);

    window.UordoulShare = {
        open: () => {
            const button = document.getElementById('share-btn');
            if (button) openShareSheet(button);
        }
    };
})();
