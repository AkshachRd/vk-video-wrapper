/* pieces.jsx — LUPA player + panel components */
const { useState, useRef, useEffect, useCallback } = React;

// tokenize a subtitle line into clickable words + inert punctuation/space
function tokenizeLine(text) {
  const chunks = text.split(/(\s+)/);
  const tokens = [];
  chunks.forEach((chunk) => {
    if (chunk === "") return;
    if (/^\s+$/.test(chunk)) { tokens.push({ type: "space", text: chunk }); return; }
    const m = chunk.match(/^([^\p{L}]*)([\p{L}’'’-]*)([^\p{L}]*)$/u);
    if (m && m[2]) {
      if (m[1]) tokens.push({ type: "punct", text: m[1] });
      tokens.push({ type: "word", text: m[2], clean: m[2].toLowerCase().replace(/[’'’-]/g, "") });
      if (m[3]) tokens.push({ type: "punct", text: m[3] });
    } else {
      tokens.push({ type: "punct", text: chunk });
    }
  });
  return tokens;
}

// ---------- Subtitle stack (primary clickable + ru reference) ----------
function CueWords({ cue, activeClean, onWord }) {
  const lineRef = useRef(null);
  useEffect(() => {
    const root = lineRef.current;
    if (!root) return;
    const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion")) || 0.6;
    const btns = root.querySelectorAll("button.word");
    btns.forEach((b, idx) => {
      b.animate(
        [
          { transform: `translateY(${12 * m}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 430, delay: idx * 42 * m, easing: "cubic-bezier(0.16,1.18,0.4,1)", fill: "backwards" }
      );
    });
  }, [cue.id]);

  const tokens = tokenizeLine(cue.en);
  return (
    <div className="sub-line" ref={lineRef}>
      {tokens.map((tk, i) => {
        if (tk.type === "space") return <span key={i}> </span>;
        if (tk.type === "punct") return <span key={i} className="word punct">{tk.text}</span>;
        const isActive = activeClean === tk.clean;
        return (
          <button
            key={i}
            className={"word" + (isActive ? " active" : "")}
            onClick={(e) => onWord(e, tk.clean, tk.text)}
          >{tk.text}</button>
        );
      })}
    </div>
  );
}

function SubtitleStack({ cue, refOn, activeClean, onWord }) {
  if (!cue) return null;
  return (
    <div className="sub-stack">
      <div className="sub-card">
        <CueWords key={cue.id} cue={cue} activeClean={activeClean} onWord={onWord} />
      </div>
      {refOn ? <div className="ref-line" key={cue.id + "-ru"}>{cue.ru}</div> : null}
    </div>
  );
}

// A bold serpent that hugs its host: a wavy rounded-rect path whose body
// undulates in real sine curves and slithers around on hover.
function SnakeBorder({ shape }) {
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const raf = useRef(0);
  const phase = useRef(Math.random() * 6.28);

  useEffect(() => {
    const svg = svgRef.current;
    const path = pathRef.current;
    const host = svg && svg.parentElement;
    if (!svg || !path || !host) return;

    let W = 0, H = 0, base = [], cum = [], total = 0, amp = 4, K = 0;

    const num = (el, prop, fb) => {
      const v = parseFloat(getComputedStyle(el).getPropertyValue(prop));
      return isNaN(v) ? fb : v;
    };

    function measure() {
      const root = document.documentElement;
      const gap = num(svg, "--snake-gap", 7);
      const sw = num(root, "--snake-sw", 3);
      amp = num(root, "--snake-amp", 4);
      const r = host.getBoundingClientRect();
      W = Math.round(r.width) + gap * 2;
      H = Math.round(r.height) + gap * 2;
      let rad;
      if (shape === "round") rad = num(root, "--radius", 20) + gap;
      else rad = Math.min(W, H) / 2;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("width", W);
      svg.setAttribute("height", H);

      // sample the rounded-rect perimeter (clockwise from top-left corner end)
      const inset = sw / 2 + amp + 0.5;
      const x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
      const rr = Math.max(0, Math.min(rad, (Math.min(x1 - x0, y1 - y0)) / 2));
      const step = 5;
      const pts = [];
      const line = (ax, ay, bx, by) => {
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.ceil(len / step));
        for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
      };
      const arc = (cx, cy, a0, a1) => {
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * rr / step));
        for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      };
      line(x0 + rr, y0, x1 - rr, y0);
      arc(x1 - rr, y0 + rr, -Math.PI / 2, 0);
      line(x1, y0 + rr, x1, y1 - rr);
      arc(x1 - rr, y1 - rr, 0, Math.PI / 2);
      line(x1 - rr, y1, x0 + rr, y1);
      arc(x0 + rr, y1 - rr, Math.PI / 2, Math.PI);
      line(x0, y1 - rr, x0, y0 + rr);
      arc(x0 + rr, y0 + rr, Math.PI, Math.PI * 1.5);
      base = pts;

      cum = [0];
      for (let i = 1; i < base.length; i++) cum[i] = cum[i - 1] + Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]);
      const seg = Math.hypot(base[0][0] - base[base.length - 1][0], base[0][1] - base[base.length - 1][1]);
      total = cum[cum.length - 1] + seg;
      const wl = num(document.documentElement, "--snake-wavelen", 40);
      const waves = Math.max(4, Math.round(total / wl)); // wavelength from CSS var
      K = waves * 2 * Math.PI / total;
    }

    function build(ph) {
      // displace each sample along its normal by a sine wave
      const P = new Array(base.length);
      for (let i = 0; i < base.length; i++) {
        const p = base[i];
        const a = base[(i - 1 + base.length) % base.length];
        const b = base[(i + 1) % base.length];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const off = amp * Math.sin(K * cum[i] + ph);
        P[i] = [p[0] - ty * off, p[1] + tx * off];
      }
      // smooth closed curve via midpoint quadratics
      const n = P.length;
      const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
      const m0 = mid(P[n - 1], P[0]);
      let d = "M" + m0[0].toFixed(1) + " " + m0[1].toFixed(1);
      for (let i = 0; i < n; i++) {
        const cur = P[i], nx = P[(i + 1) % n];
        const m = mid(cur, nx);
        d += " Q" + cur[0].toFixed(1) + " " + cur[1].toFixed(1) + " " + m[0].toFixed(1) + " " + m[1].toFixed(1);
      }
      return d + "Z";
    }

    function draw() { path.setAttribute("d", build(phase.current)); }

    let running = false;
    function loop() { phase.current += 0.1; draw(); raf.current = requestAnimationFrame(loop); }
    function start() { if (running) return; running = true; measure(); draw(); raf.current = requestAnimationFrame(loop); }
    function stop() { running = false; cancelAnimationFrame(raf.current); }

    measure(); draw();
    host.addEventListener("mouseenter", start);
    host.addEventListener("mouseleave", stop);
    host.addEventListener("focusin", start);
    host.addEventListener("focusout", stop);
    const ro = new ResizeObserver(() => { measure(); if (!running) draw(); });
    ro.observe(host);

    return () => {
      stop(); ro.disconnect();
      host.removeEventListener("mouseenter", start);
      host.removeEventListener("mouseleave", stop);
      host.removeEventListener("focusin", start);
      host.removeEventListener("focusout", stop);
    };
  }, [shape]);

  return (
    <svg ref={svgRef} className="snake-svg" data-shape={shape || "pill"} aria-hidden="true" preserveAspectRatio="none">
      <path ref={pathRef} className="snake-path" pathLength="100"></path>
    </svg>
  );
}

// ---------- Word lookup popover ----------
function WordPopover({ anchor, clean, display, saved, onSave, onClose, snake }) {
  const [state, setState] = useState({ status: "loading" });
  const [flashing, setFlashing] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setState({ status: "loading" });
    const t = setTimeout(() => {
      const entry = DICT[clean];
      setState(entry ? { status: "ready", entry } : { status: "not-found" });
    }, 480);
    return () => clearTimeout(t);
  }, [clean]);

  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  const handleSave = () => {
    if (saved) { onSave(false); return; }
    setFlashing(true);
    setTimeout(() => setFlashing(false), 520);
    const entry = state.status === "ready" ? state.entry : null;
    onSave(true, {
      word: entry ? entry.hw : display,
      lang: "EN",
      meaning: entry ? entry.meanings[0] : "—",
    });
  };

  // position: above anchor, clamped within well
  const style = {
    left: Math.max(8, Math.min(anchor.x - 140, anchor.wellW - 288)),
    bottom: anchor.wellH - anchor.y + 12,
  };

  return (
    <div className="pop" ref={ref} style={style} role="dialog" aria-label={"Слово: " + display}>
      <div className="pop-head">
        <div className="pop-word">
          <span className="hw">{state.status === "ready" ? state.entry.hw : display}</span>
          {state.status === "ready" && state.entry.ipa ? <span className="ipa">/{state.entry.ipa}/</span> : null}
        </div>
        <div className="pop-src"><a href={DICT_URL} target="_blank" rel="noreferrer">{DICT_SOURCE} ↗</a></div>
      </div>
      <div className="pop-body">
        {state.status === "loading" ? (
          <div className="pop-loading"><span className="spinner"></span>ИЩУ В СЛОВАРЕ…</div>
        ) : state.status === "not-found" ? (
          <div className="pop-section">
            <div className="ps-val" style={{ color: "var(--ink-2)" }}>Слово не найдено в словаре. Его всё равно можно сохранить.</div>
          </div>
        ) : (
          <React.Fragment>
            <div className="pop-section">
              <div className="mono ps-label">Значение</div>
              <div className="ps-val">{state.entry.meanings.map((m, i) => <div className="m" key={i}>{m}</div>)}</div>
            </div>
            <div className="pop-section">
              <div className="mono ps-label">Грамматика</div>
              <div className="ps-val" style={{ fontFamily: "var(--fs-mono)", fontSize: 13 }}>{state.entry.grammar}</div>
            </div>
          </React.Fragment>
        )}
      </div>
      <div className="pop-foot">
        <button className={"btn-save" + (saved ? " saved" : "") + (flashing ? " flashing" : "") + (snake ? " snake-host" : "")} onClick={handleSave} disabled={state.status === "loading"}>
          <span className="saveflash"></span>
          {saved ? <React.Fragment><span className="chk"></span>Сохранено</React.Fragment> : "Сохранить слово"}
          {snake ? <SnakeBorder shape="pill" /> : null}
        </button>
      </div>
    </div>
  );
}

// ---------- Track / translation menu ----------
function TrackMenu({ primary, reference, onPrimary, onReference, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  return (
    <div className="menu" ref={ref} role="dialog" aria-label="Субтитры и перевод">
      <div className="field">
        <label className="mono ink">Субтитры</label>
        <div className="swiss-select">
          <select value={primary} onChange={(e) => onPrimary(e.target.value)} aria-label="Субтитры">
            {TRACKS_PRIMARY.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="mono ink">Перевод</label>
        <div className="swiss-select">
          <select value={reference} onChange={(e) => onReference(e.target.value)} aria-label="Перевод">
            {TRACKS_REFERENCE.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

// ---------- Control bar ----------
function ControlBar({ playing, duration, volume, muted, hidden, onPlayPause, onSeek, onToggleMute, onSetVolume, captionsBtnRef, onToggleMenu, fillRef, knobRef, timeRef }) {
  const seekRef = useRef(null);
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60); const sec = s % 60;
    return m + ":" + String(sec).padStart(2, "0");
  };
  const seek = (e) => {
    const r = seekRef.current.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onSeek(p * duration);
  };
  return (
    <div className={"controls" + (hidden ? " hidden" : "")}>
      <button className="ctrl-btn" onClick={onPlayPause} aria-label={playing ? "Пауза" : "Воспроизвести"}>
        {playing ? <Ic.pause /> : <Ic.play />}
      </button>
      <div className="timecode"><span ref={timeRef}>0:00</span><span className="sep">/</span>{fmt(duration)}</div>
      <div className="seek" ref={seekRef} onClick={seek}>
        <div className="track"></div>
        <div className="fill" ref={fillRef}></div>
        <div className="knob" ref={knobRef}></div>
      </div>
      <button className="ctrl-btn" onClick={onToggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"}>
        {muted ? <Ic.mute /> : <Ic.vol />}
      </button>
      <div className="vol">
        <div className="vtrack" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSetVolume(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); }}>
          <div className="vfill" style={{ width: (muted ? 0 : volume * 100) + "%" }}></div>
        </div>
      </div>
      <div className="divider"></div>
      <button className="ctrl-btn" ref={captionsBtnRef} onClick={onToggleMenu} aria-label="Субтитры и перевод">
        <Ic.captions />
      </button>
    </div>
  );
}

// ---------- Saved words panel ----------
function SavedWordsPanel({ words, freshId, onRemove }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="side-head">
        <h3>Слова</h3>
        <span className="scount">{String(words.length).padStart(2, "0")}</span>
      </div>
      {words.length === 0 ? (
        <div className="side-empty">СПИСОК ПУСТ<br />Нажмите на слово в субтитрах,<br />чтобы сохранить его</div>
      ) : (
        <div className="words-list">
          {words.map((w) => (
            <div className={"wcard" + (w.id === freshId ? " fresh" : "")} key={w.id}>
              <div className="wtop">
                <span className="ww">{w.word}</span>
                <span className="wlang">{w.lang}</span>
              </div>
              <div className="wmean">{w.meaning}</div>
              <button className="wx" onClick={() => onRemove(w.id)} aria-label={"Удалить " + w.word}><Ic.x /></button>
            </div>
          ))}
        </div>
      )}
      <div className="side-foot">
        <span className="mono">Сохранённые слова</span>
      </div>
    </div>
  );
}

// ---------- Recent videos grid ----------
function RecentGrid({ videos, onSelect, onRemove, snake }) {
  if (videos.length === 0) {
    return <div className="empty">ИСТОРИЯ ПУСТА — ВСТАВЬТЕ ССЫЛКУ ВЫШЕ</div>;
  }
  return (
    <div className="recent-grid">
      {videos.map((v, i) => (
        <button className={"rcard" + (snake ? " snake-host" : "")} key={v.id} style={{ animationDelay: (i * 0.06) + "s" }} onClick={() => onSelect(v)}>
          <div className="rthumb">
            <span className="lang-chip">{v.lang}</span>
            <span className="thumb-label mono">VK · VIDEO</span>
            <span className="dur">{v.dur}</span>
            <span className="play-ghost"><span className="tri"></span></span>
          </div>
          <div className="rbody">
            <span className="idx rnum">{String(i + 1).padStart(2, "0")}</span>
            <div style={{ minWidth: 0 }}>
              <div className="rtitle">{v.title}</div>
              <div className="rmeta">
                <span className="mono">{v.when}</span>
                <span className="dotsep"></span>
                <span className="mono">{v.lang === "RU" ? "РУС" : "АНГЛ"}</span>
              </div>
            </div>
          </div>
          <span className="rremove" onClick={(e) => { e.stopPropagation(); onRemove(v.id); }} role="button" aria-label={"Удалить " + v.title}><Ic.x /></span>
          {snake ? <SnakeBorder shape="round" /> : null}
        </button>
      ))}
    </div>
  );
}

Object.assign(window, { SubtitleStack, WordPopover, TrackMenu, ControlBar, SavedWordsPanel, RecentGrid, SnakeBorder, tokenizeLine });
