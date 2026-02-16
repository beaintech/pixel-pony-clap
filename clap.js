// clap.js
// 纯 WebAudio 拍手检测：能量/RMS + 上升沿 + 冷却
export class ClapDetector {
  constructor(opts = {}) {
    this.onClap = opts.onClap || (() => {});
    this.sensitivity = typeof opts.sensitivity === "number" ? opts.sensitivity : 1.0; // 越大越敏感
    this.cooldownMs = typeof opts.cooldownMs === "number" ? opts.cooldownMs : 320;
    this.minClapGapMs = typeof opts.minClapGapMs === "number" ? opts.minClapGapMs : 80; // 防止一个拍手被拆成多次峰值
    this.floor = typeof opts.floor === "number" ? opts.floor : 0.012; // 噪声地板
    this.threshold = typeof opts.threshold === "number" ? opts.threshold : 0.06; // 基础阈值，后续会乘以 sensitivity

    this._ctx = null;
    this._stream = null;
    this._src = null;
    this._analyser = null;
    this._buf = null;

    this._armed = true;
    this._lastClapAt = 0;
    this._lastPeakAt = 0;
    this._running = false;

    this.stateText = opts.stateText || (() => {});
  }

  async start() {
    if (this._running) return;
    this._running = true;

    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._src = this._ctx.createMediaStreamSource(this._stream);

    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 2048;
    this._analyser.smoothingTimeConstant = 0.1;

    this._src.connect(this._analyser);
    this._buf = new Float32Array(this._analyser.fftSize);

    this.stateText(`Mic enabled. Clap to jump. Sensitivity=${this.sensitivity.toFixed(2)}`);
    this._tick();
  }

  stop() {
    this._running = false;
    try { this._src && this._src.disconnect(); } catch {}
    try { this._ctx && this._ctx.close(); } catch {}
    if (this._stream) {
      for (const t of this._stream.getTracks()) t.stop();
    }
    this._ctx = null;
    this._stream = null;
    this._src = null;
    this._analyser = null;
    this._buf = null;
    this.stateText(`Mic disabled.`);
  }

  setSensitivity(v) {
    this.sensitivity = Math.max(0.2, Math.min(3.0, v));
  }

  _tick() {
    if (!this._running) return;

    this._analyser.getFloatTimeDomainData(this._buf);

    let sum = 0;
    let peak = 0;
    for (let i = 0; i < this._buf.length; i++) {
      const x = this._buf[i];
      const ax = Math.abs(x);
      sum += x * x;
      if (ax > peak) peak = ax;
    }
    const rms = Math.sqrt(sum / this._buf.length);

    const now = performance.now();
    const thr = this.threshold * this.sensitivity;

    // 拍手特征：短时峰值大，且 RMS 超过噪声地板很多
    const isLoud = peak > thr && rms > (this.floor + thr * 0.25);

    // 只用上升沿触发一次
    if (isLoud && this._armed) {
      const sinceLast = now - this._lastClapAt;
      const sincePeak = now - this._lastPeakAt;

      if (sinceLast >= this.cooldownMs && sincePeak >= this.minClapGapMs) {
        this._lastClapAt = now;
        this._lastPeakAt = now;
        this._armed = false;
        this.onClap({ rms, peak, thr });
      }
    }

    // 回到安静区才重新武装
    if (!isLoud && peak < thr * 0.55) {
      this._armed = true;
    }

    requestAnimationFrame(() => this._tick());
  }
}
