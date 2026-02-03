/**
 * RPG Token Animator V2
 * Engine Otimizada para Efeitos Locais (Canvas 2D Composite)
 */
class TokenEngine {
    constructor() {
        this.canvas = document.getElementById('tokenCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true }); // Suporte a transparência
        
        // Elementos de UI auxiliares
        this.markerEl = document.getElementById('target-marker');
        this.placeholder = document.getElementById('placeholder-text');
        this.statusEl = document.getElementById('status-bar');
        
        // Estado da Aplicação
        this.image = new Image();
        this.isLoaded = false;
        this.isPlaying = true;
        this.isPickingPoint = false;
        this.animationId = null;

        // Configuração Padrão
        this.config = {
            speed: 1.5,
            radius: 150,    // Raio da área de efeito em pixels
            amp: 0.10,      // Amplitude (0.0 a 0.3)
            glow: 0,
            duration: 3     // Segundos para gravação
        };

        // Estado do Pivô (Centro da respiração)
        this.pivot = { x: 0, y: 0, set: false };

        // Canvas Offscreen para performance (buffer de composição)
        this.memCanvas = document.createElement('canvas');
        this.memCtx = this.memCanvas.getContext('2d');

        this.initListeners();
        this.loop();
    }

    initListeners() {
        // 1. Upload
        const imgInput = document.getElementById('imageInput');
        imgInput.addEventListener('change', (e) => this.handleImageUpload(e));

        // Drag & Drop na área do canvas
        const dropZone = document.querySelector('.viewport');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = '#27272a'; });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.background = ''; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = '';
            if(e.dataTransfer.files.length) this.handleImageUpload({ target: { files: e.dataTransfer.files } });
        });

        // 2. Controles Deslizantes
        this.bindSlider('ctrl-speed', 'val-speed', v => this.config.speed = parseFloat(v));
        this.bindSlider('ctrl-radius', 'val-radius', v => this.config.radius = parseInt(v));
        this.bindSlider('ctrl-amp', 'val-amp', v => this.config.amp = parseInt(v) / 100);
        this.bindSlider('ctrl-glow', 'val-glow', v => this.config.glow = parseInt(v));
        this.bindSlider('ctrl-dur', 'val-dur', v => this.config.duration = parseInt(v));

        // 3. Sistema de Pivô
        const btnSetPoint = document.getElementById('btn-set-point');
        btnSetPoint.addEventListener('click', () => {
            if(!this.isLoaded) return alert("Carregue uma imagem primeiro!");
            this.isPickingPoint = !this.isPickingPoint;
            
            if(this.isPickingPoint) {
                btnSetPoint.classList.add('active');
                btnSetPoint.innerText = "Clique no Peito/Centro";
                this.canvas.classList.add('picking-mode');
                this.statusEl.innerText = "Modo de Seleção: Clique na imagem";
            } else {
                this.cancelPickingMode();
            }
        });

        // Clique no Canvas para definir ponto
        this.canvas.addEventListener('mousedown', (e) => {
            if(!this.isPickingPoint || !this.isLoaded) return;
            
            // Matemática para converter clique na tela -> pixel interno da imagem
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            this.pivot = { x, y, set: true };
            this.updateMarkerVisual(e.clientX - rect.left, e.clientY - rect.top); // Posição visual CSS
            
            document.getElementById('point-status').innerText = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
            this.cancelPickingMode();
        });

        // Botões de Ação
        document.getElementById('btn-toggle').addEventListener('click', (e) => {
            this.isPlaying = !this.isPlaying;
            e.target.innerText = this.isPlaying ? "⏸ Pausar Animação" : "▶ Continuar";
            if(this.isPlaying) this.loop();
            else this.draw(); // Desenha um frame estático
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            // Reset lógica
            this.config = { speed: 1.5, radius: 150, amp: 0.10, glow: 0, duration: 3 };
            this.pivot = { x: this.canvas.width/2, y: this.canvas.height/2, set: false };
            this.markerEl.style.display = 'none';
            document.getElementById('point-status').innerText = "Centro da Imagem";
            
            // Reset UI inputs
            ['speed', 'radius', 'amp', 'glow', 'dur'].forEach(k => {
                // Atualiza sliders visualmente (necessário mapeamento manual simples aqui)
                // Simplificação para brevidade
            });
            // Recarrega valores padrão nos inputs (idealmente funções auxiliares)
            document.getElementById('ctrl-speed').value = 1.5; document.getElementById('val-speed').innerText = 1.5;
            document.getElementById('ctrl-radius').value = 150; document.getElementById('val-radius').innerText = 150;
            // ... outros resets ...
        });

        // Exportação
        document.getElementById('btn-snap').addEventListener('click', () => this.exportImage());
        document.getElementById('btn-rec').addEventListener('click', () => this.exportVideo());
    }

    cancelPickingMode() {
        this.isPickingPoint = false;
        document.getElementById('btn-set-point').classList.remove('active');
        document.getElementById('btn-set-point').innerText = "🎯 Definir Ponto Central";
        this.canvas.classList.remove('picking-mode');
        this.statusEl.innerText = "Pronto";
    }

    updateMarkerVisual(cssX, cssY) {
        // Ajusta o marcador HTML sobre o canvas
        this.markerEl.style.display = 'block';
        this.markerEl.style.left = cssX + 'px';
        this.markerEl.style.top = cssY + 'px';
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.image.src = event.target.result;
            this.image.onload = () => {
                this.isLoaded = true;
                this.placeholder.style.display = 'none';
                
                // Define tamanho interno igual à imagem (Qualidade Máxima)
                // Limitamos a 2048px para evitar crash em mobile se for imagem 8k
                const maxDim = 2048;
                let w = this.image.width;
                let h = this.image.height;
                
                if (w > maxDim || h > maxDim) {
                    const ratio = w / h;
                    if (w > h) { w = maxDim; h = maxDim / ratio; }
                    else { h = maxDim; w = maxDim * ratio; }
                }

                this.canvas.width = w;
                this.canvas.height = h;
                
                // Pivô inicial no centro
                this.pivot = { x: w / 2, y: h / 2, set: false };
                this.markerEl.style.display = 'none';
                
                // Prepara buffer offscreen (mesmo tamanho para evitar resize constante)
                this.memCanvas.width = w;
                this.memCanvas.height = h;

                this.statusEl.innerText = `Imagem carregada: ${w}x${h}px`;
                this.draw();
            };
        };
        reader.readAsDataURL(file);
    }

    bindSlider(id, displayId, callback) {
        const el = document.getElementById(id);
        const disp = document.getElementById(displayId);
        el.addEventListener('input', (e) => {
            disp.innerText = e.target.value;
            callback(e.target.value);
        });
    }

    /**
     * Lógica de Renderização
     * Usa composição para criar efeito de "lente" no peito
     */
    draw() {
        if (!this.isLoaded) return;

        // 1. Limpa
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Calcula ciclo de respiração (Senoide)
        const time = Date.now() / 1000;
        // Normaliza de -1..1 para 0..1 para facilitar
        const cycle = (Math.sin(time * this.config.speed) + 1) / 2; 
        
        // 3. Desenha imagem BASE (fundo estático)
        this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

        if (this.config.amp > 0) {
            // 4. Efeito de "Bulge" (Inchaço) Localizado
            // Estratégia: Recortar a área do peito, escalar ela e desenhar por cima com bordas suaves
            
            const r = this.config.radius;
            const cx = this.pivot.x;
            const cy = this.pivot.y;

            // Fator de escala atual (ex: 1.0 a 1.10)
            const currentScale = 1 + (cycle * this.config.amp);
            
            // Tamanho da área de origem (source) vs destino (dest)
            // Para dar "zoom", pegamos uma área menor da imagem original e desenhamos no tamanho do raio
            // sourceRadius = r / currentScale -> Se scale aumenta, source diminui (zoom in)
            const srcR = r / currentScale;

            // CONFIGURAÇÃO DO BUFFER OFFSCREEN
            // Limpa apenas a área necessária do buffer
            this.memCtx.clearRect(0, 0, this.memCanvas.width, this.memCanvas.height);
            
            // Salva estado do buffer
            this.memCtx.save();
            
            // A. Cria a máscara circular (Gradient Alpha) no Buffer
            // Isso garante que o efeito desapareça suavemente nas bordas
            const g = this.memCtx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
            g.addColorStop(0, "rgba(255,255,255, 1)");   // Centro totalmente opaco
            g.addColorStop(1, "rgba(255,255,255, 0)");   // Borda transparente
            
            this.memCtx.fillStyle = g;
            this.memCtx.beginPath();
            this.memCtx.arc(cx, cy, r, 0, Math.PI * 2);
            this.memCtx.fill();

            // B. Mantém apenas o que está dentro do gradiente (Source-In ou Source-Atop)
            // 'source-in': Mantém a NOVA imagem (que desenharemos a seguir) onde a MÁSCARA existe
            this.memCtx.globalCompositeOperation = 'source-in';

            // C. Desenha a imagem com Zoom (Centralizada no pivô)
            // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
            this.memCtx.drawImage(
                this.image, 
                cx - srcR, cy - srcR, srcR * 2, srcR * 2, // Source (área menor = zoom)
                cx - r, cy - r, r * 2, r * 2              // Destino (tamanho fixo na tela)
            );

            this.memCtx.restore(); // Restaura composite default

            // 5. Compõe o Buffer na Tela Principal
            this.ctx.drawImage(this.memCanvas, 0, 0);
            
            // 6. Glow Sincronizado (Opcional)
            if (this.config.glow > 0) {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'lighter'; // Modo de mistura para brilho
                const glowOpacity = cycle * (this.config.glow / 50); // 0.0 a 1.0
                
                const gGlow = this.ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
                gGlow.addColorStop(0, `rgba(139, 92, 246, ${glowOpacity * 0.6})`);
                gGlow.addColorStop(1, "rgba(139, 92, 246, 0)");
                
                this.ctx.fillStyle = gGlow;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
        
        // Desenha mira auxiliar se estiver escolhendo ponto (apenas visual debug)
        if (this.isPickingPoint) {
            // Lógica UI gerida fora do loop de draw para performance, 
            // mas poderíamos desenhar no canvas aqui se quiséssemos.
        }
    }

    loop() {
        if (!this.isPlaying) return;
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    // --- Exportação ---

    exportImage() {
        // Renderiza um frame limpo
        this.draw();
        const link = document.createElement('a');
        link.download = `token-snapshot-${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    exportVideo() {
        const btn = document.getElementById('btn-rec');
        const originalText = btn.innerText;
        const progressBar = document.getElementById('progress-bar');
        const progressContainer = document.getElementById('progress-bar-container');
        
        btn.disabled = true;
        btn.classList.add('recording');
        btn.innerText = "Gravando...";
        progressContainer.style.display = 'block';

        const stream = this.canvas.captureStream(60);
        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 5000000 // 5Mbps qualidade alta
        });

        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `token-animado-${Date.now()}.webm`;
            a.click();
            
            // Cleanup UI
            btn.disabled = false;
            btn.classList.remove('recording');
            btn.innerText = originalText;
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        };

        recorder.start();

        // Timer visual
        const duration = this.config.duration * 1000;
        const startTime = Date.now();
        
        const updateProgress = () => {
            if(recorder.state === 'inactive') return;
            const elapsed = Date.now() - startTime;
            const pct = Math.min((elapsed / duration) * 100, 100);
            progressBar.style.width = `${pct}%`;
            
            if (elapsed < duration) requestAnimationFrame(updateProgress);
        };
        updateProgress();

        setTimeout(() => recorder.stop(), duration);
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => new TokenEngine());