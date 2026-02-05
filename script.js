/**
 * RPG Token Animator V2
 * Engine Otimizada para Efeitos Locais (Canvas Composition)
 */
class TokenEngine {
    constructor() {
        // Inicialização do Contexto
        this.canvas = document.getElementById('tokenCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: true }); // Suporte a transparência
        
        // Elementos de UI
        this.markerEl = document.getElementById('target-marker');
        this.placeholder = document.getElementById('placeholder-text');
        this.statusEl = document.getElementById('status-bar');
        
        // Estado da Aplicação
        this.image = new Image();
        this.isLoaded = false;
        this.isPlaying = true;
        this.isPickingPoint = false;
        this.animationId = null;

        // Configuração (Model)
        this.config = {
            speed: 1.5,
            radius: 150,    // Raio da área de efeito (px)
            amp: 0.10,      // Amplitude (0.0 a 0.3)
            glow: 0,
            duration: 3     // Segundos para exportação
        };

        // Estado do Pivô (Ponto de respiração)
        // Inicialmente 0,0, será setado para o centro da imagem ao carregar
        this.pivot = { x: 0, y: 0, set: false };

        // Buffer Offscreen (Performance crítica para composição)
        this.memCanvas = document.createElement('canvas');
        this.memCtx = this.memCanvas.getContext('2d');

        this.initListeners();
        this.loop();
    }

    initListeners() {
        // 1. Upload de Imagem
        const imgInput = document.getElementById('imageInput');
        imgInput.addEventListener('change', (e) => this.handleImageUpload(e));

        // Drag & Drop
        const dropZone = document.querySelector('.viewport');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = '#27272a'; });
        dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.background = ''; });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = '';
            if(e.dataTransfer.files.length) this.handleImageUpload({ target: { files: e.dataTransfer.files } });
        });

        // 2. Sliders
        this.bindSlider('ctrl-speed', 'val-speed', v => this.config.speed = parseFloat(v));
        this.bindSlider('ctrl-radius', 'val-radius', v => this.config.radius = parseInt(v));
        this.bindSlider('ctrl-amp', 'val-amp', v => this.config.amp = parseInt(v) / 100);
        this.bindSlider('ctrl-glow', 'val-glow', v => this.config.glow = parseInt(v));
        this.bindSlider('ctrl-dur', 'val-dur', v => this.config.duration = parseInt(v));

        // 3. Sistema de Marcação de Ponto (Targeting)
        const btnSetPoint = document.getElementById('btn-set-point');
        btnSetPoint.addEventListener('click', () => {
            if(!this.isLoaded) return alert("Carregue uma imagem primeiro!");
            
            this.isPickingPoint = !this.isPickingPoint;
            
            if(this.isPickingPoint) {
                btnSetPoint.classList.add('active');
                btnSetPoint.innerText = "Clique na Imagem...";
                this.canvas.classList.add('picking');
                this.statusEl.innerText = "MODO DE MIRA: Clique no peito do personagem";
            } else {
                this.cancelPickingMode();
            }
        });

        // Clique no Canvas (Matemática de Coordenadas)
        this.canvas.addEventListener('mousedown', (e) => {
            if(!this.isPickingPoint || !this.isLoaded) return;
            
            // Retângulo do Canvas na tela (CSS Pixels)
            const rect = this.canvas.getBoundingClientRect();
            
            // Fatores de escala (Internal Resolution / CSS Resolution)
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;

            // Coordenada do clique convertida para Pixel Real da imagem
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            this.pivot = { x, y, set: true };
            
            // Atualiza Visual
            this.updateMarkerVisual(e.clientX - rect.left, e.clientY - rect.top); 
            document.getElementById('point-coords').innerText = `X:${Math.round(x)} Y:${Math.round(y)}`;
            
            this.cancelPickingMode();
        });

        // 4. Controles de Playback
        document.getElementById('btn-toggle').addEventListener('click', (e) => {
            this.isPlaying = !this.isPlaying;
            e.target.innerText = this.isPlaying ? "⏸ Pausar" : "▶ Continuar";
            if(this.isPlaying) this.loop();
            else this.draw(); // Renderiza um frame estático
        });

        document.getElementById('btn-reset').addEventListener('click', () => this.resetSettings());

        // 5. Exportação
        document.getElementById('btn-snap').addEventListener('click', () => this.exportImage());
        document.getElementById('btn-rec').addEventListener('click', () => this.exportVideo());
    }

    cancelPickingMode() {
        this.isPickingPoint = false;
        const btn = document.getElementById('btn-set-point');
        btn.classList.remove('active');
        btn.innerText = "🎯 Definir Ponto (Peito)";
        this.canvas.classList.remove('picking');
        this.statusEl.innerText = "Pronto";
    }

    updateMarkerVisual(cssX, cssY) {
        // Posiciona o elemento HTML sobre o canvas
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
                
                // Define tamanho do Canvas igual à imagem (Qualidade Máxima)
                // Limitamos a 2048px para evitar crash em mobile
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
                
                // Buffer precisa ter o mesmo tamanho
                this.memCanvas.width = w;
                this.memCanvas.height = h;

                // Reseta pivô para o centro
                this.pivot = { x: w / 2, y: h / 2, set: false };
                this.markerEl.style.display = 'none';
                this.statusEl.innerText = `Imagem carregada: ${w}x${h}px`;
                
                this.draw();
            };
        };
        reader.readAsDataURL(file);
    }

    resetSettings() {
        this.config = { speed: 1.5, radius: 150, amp: 0.10, glow: 0, duration: 3 };
        // Reset Inputs visualmente
        document.getElementById('ctrl-speed').value = 1.5; document.getElementById('val-speed').innerText = 1.5;
        document.getElementById('ctrl-radius').value = 150; document.getElementById('val-radius').innerText = 150;
        document.getElementById('ctrl-amp').value = 10; document.getElementById('val-amp').innerText = 10;
        document.getElementById('ctrl-glow').value = 0; document.getElementById('val-glow').innerText = 0;
        document.getElementById('ctrl-dur').value = 3; document.getElementById('val-dur').innerText = 3;
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
     * CORE: Lógica de Renderização
     * Usa composição para criar efeito de "lente" no peito
     */
    draw() {
        if (!this.isLoaded) return;

        // 1. Limpa Tela Principal
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Calcula Ciclo (Senoide normalizada 0..1)
        const time = Date.now() / 1000;
        const cycle = (Math.sin(time * this.config.speed) + 1) / 2; 

        // 3. Desenha Imagem Base (Fundo Estático)
        this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);

        // Se amplitude for 0, não gasta processamento com efeito
        if (this.config.amp > 0) {
            const r = this.config.radius;
            const cx = this.pivot.x;
            const cy = this.pivot.y;

            // Fator de escala atual (ex: 1.0 a 1.10)
            const currentScale = 1 + (cycle * this.config.amp);
            
            // --- INÍCIO DO PROCESSO DE COMPOSIÇÃO ---
            
            // Limpa o buffer apenas na área que vamos usar
            // (Otimização: não limpar buffer inteiro em 4k)
            this.memCtx.clearRect(0, 0, this.memCanvas.width, this.memCanvas.height);
            this.memCtx.save();

            // A. Cria Máscara Radial no Buffer
            // Um gradiente que vai de branco (opaco) para transparente
            const g = this.memCtx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
            g.addColorStop(0, "rgba(255,255,255, 1)");
            g.addColorStop(1, "rgba(255,255,255, 0)"); // Fade suave nas bordas
            
            this.memCtx.fillStyle = g;
            this.memCtx.beginPath();
            this.memCtx.arc(cx, cy, r, 0, Math.PI * 2);
            this.memCtx.fill();

            // B. Aplica "Source-In"
            // Mantém pixels da próxima operação apenas onde a máscara existe
            this.memCtx.globalCompositeOperation = 'source-in';

            // C. Desenha a Imagem com "Zoom" no Buffer
            // "Recortamos" uma área menor da imagem original (srcR) e desenhamos no tamanho do raio (r)
            const srcR = r / currentScale; 

            this.memCtx.drawImage(
                this.image, 
                cx - srcR, cy - srcR, srcR * 2, srcR * 2, // Source (área menor = zoom in)
                cx - r, cy - r, r * 2, r * 2              // Destino (tamanho fixo na tela)
            );

            this.memCtx.restore(); // Restaura modo de mistura

            // D. Copia o Buffer (apenas a parte inchada e suave) para a Tela Principal
            this.ctx.drawImage(this.memCanvas, 0, 0);

            // 4. Efeito Glow (Opcional)
            if (this.config.glow > 0) {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'lighter'; // Modo Additivo
                const glowOpacity = cycle * (this.config.glow / 50); 
                
                const gGlow = this.ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
                gGlow.addColorStop(0, `rgba(139, 92, 246, ${glowOpacity * 0.5})`);
                gGlow.addColorStop(1, "rgba(139, 92, 246, 0)");
                
                this.ctx.fillStyle = gGlow;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        }
    }

    loop() {
        if (!this.isPlaying) return;
        this.draw();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    // --- Exportação ---

    exportImage() {
        this.draw();
        const link = document.createElement('a');
        link.download = `token-${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }

    exportVideo() {
        const btn = document.getElementById('btn-rec');
        const originalText = btn.innerText;
        const progressBar = document.getElementById('progress-bar');
        const progressContainer = document.getElementById('progress-container');
        
        btn.disabled = true;
        btn.innerText = "Gravando...";
        progressContainer.style.display = 'block';

        const stream = this.canvas.captureStream(60);
        const recorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 5000000 // 5Mbps = Alta Qualidade
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
            
            // Reset UI
            btn.disabled = false;
            btn.innerText = originalText;
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
        };

        recorder.start();

        // Lógica de Timer Visual
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

        // Para a gravação automaticamente
        setTimeout(() => recorder.stop(), duration);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => new TokenEngine());
