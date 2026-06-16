/* app-land.jsx — ЛУПА, горизонтальный плеер на iPhone (reuses pieces/data/mobile styles) */
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "motion": 55,
  "referenceLine": true,
  "curves": true,
  "radius": 20,
  "snakes": true,
  "snakeWeight": 3,
  "snakeWiggle": 4,
  "snakeDensity": 13,
  "wordsAlways": true
}/*EDITMODE-END*/;

function lfmt(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + String(sec).padStart(2, "0");
}

// subtitle line over video — tappable words, transform-only entrance
function LandSubs({ cue, refOn, activeClean, onWord }) {
  const lineRef = useRef(null);
  useEffect(() => {
    const root = lineRef.current;
    if (!root) return;
    const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--motion")) || 0.55;
    root.querySelectorAll("button.word").forEach((b, i) => {
      b.animate(
        [{ transform: `translateY(${12 * m}px)` }, { transform: "translateY(0)" }],
        { duration: 420, delay: i * 40 * m, easing: "cubic-bezier(0.16,1.1,0.3,1)", fill: "backwards" }
      );
    });
  }, [cue.id]);
  const tokens = tokenizeLine(cue.en);
  return (
    <div className="pl-subs">
      <div className="sub-card">
        <div className="sub-line" ref={lineRef} key={cue.id}>
          {tokens.map((tk, i) => {
            if (tk.type === "space") return <span key={i}> </span>;
            if (tk.type === "punct") return <span key={i} className="word punct">{tk.text}</span>;
            const isActive = activeClean === tk.clean;
            return <button key={i} className={"word" + (isActive ? " active" : "")} onClick={() => onWord(tk.clean, tk.text)}>{tk.text}</button>;
          })}
        </div>
      </div>
      {refOn ? <div className="ref-line" key={cue.id + "r"}>{cue.ru}</div> : null}
    </div>
  );
}

// right slide-in panel: word lookup
function WordPanel({ clean, display, saved, onSave, onClose }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    setState({ status: "loading" });
    const t = setTimeout(() => {
      const e = DICT[clean];
      setState(e ? { status: "ready", entry: e } : { status: "not-found" });
    }, 460);
    return () => clearTimeout(t);
  }, [clean]);
  const entry = state.status === "ready" ? state.entry : null;
  const doSave = () => {
    if (saved) { onSave(false); return; }
    onSave(true, { word: entry ? entry.hw : display, lang: "EN", meaning: entry ? entry.meanings[0] : "—" });
  };
  return (
    <React.Fragment>
      <div className="pl-back" onClick={onClose}></div>
      <div className="pl-panel" role="dialog" aria-label={"Слово: " + display}>
        <div className="m-sheet-scroll">
          <div className="m-wl-head">
            <div className="m-wl-word">
              <span className="m-wl-hw">{entry ? entry.hw : display}</span>
              {entry && entry.ipa ? <span className="m-wl-ipa">/{entry.ipa}/</span> : null}
            </div>
            <div className="m-wl-src"><a href={DICT_URL} target="_blank" rel="noreferrer">{DICT_SOURCE} ↗</a></div>
          </div>
          <div className="m-wl-body">
            {state.status === "loading" ? (
              <div className="m-wl-loading"><span className="sp"></span>ИЩУ В СЛОВАРЕ…</div>
            ) : state.status === "not-found" ? (
              <div className="m-wl-sec"><div className="val" style={{ color: "var(--ink-2)" }}>Слово не найдено в словаре. Его всё равно можно сохранить.</div></div>
            ) : (
              <React.Fragment>
                <div className="m-wl-sec">
                  <div className="lab">Значение</div>
                  <div className="val">{entry.meanings.map((m, i) => <div className="m" key={i}>{m}</div>)}</div>
                </div>
                <div className="m-wl-sec">
                  <div className="lab">Грамматика</div>
                  <div className="val m-wl-grammar">{entry.grammar}</div>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
        <div className="m-wl-foot">
          <button className={"m-save snake-host" + (saved ? " saved" : "")} onClick={doSave} disabled={state.status === "loading"}>
            {saved ? <React.Fragment><span className="chk"></span>Сохранено</React.Fragment> : "Сохранить слово"}
            <SnakeBorder shape="pill" />
          </button>
        </div>
      </div>
    </React.Fragment>
  );
}

function SavedPanel({ words, freshId, onRemove, onClose }) {
  return (
    <React.Fragment>
      <div className="pl-back" onClick={onClose}></div>
      <div className="pl-panel" role="dialog" aria-label="Сохранённые слова">
        <div className="m-sw-head">
          <h3>Слова</h3>
          <span className="cnt">{String(words.length).padStart(2, "0")}</span>
        </div>
        <div className="m-sheet-scroll">
          {words.length === 0 ? (
            <div className="m-sw-empty">Список пуст.<br />Нажми на слово в субтитрах,<br />чтобы сохранить его сюда.</div>
          ) : (
            <div className="m-sw-list">
              {words.map((w) => (
                <div className={"m-sw-card" + (w.id === freshId ? " fresh" : "")} key={w.id}>
                  <div className="m-sw-top"><span className="m-sw-w">{w.word}</span><span className="m-sw-lang">{w.lang}</span></div>
                  <div className="m-sw-mean">{w.meaning}</div>
                  <button className="m-sw-x" onClick={() => onRemove(w.id)} aria-label={"Удалить " + w.word}><Ic.x /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}

function TrackPanel({ primary, reference, onPrimary, onReference, onClose }) {
  return (
    <React.Fragment>
      <div className="pl-back" onClick={onClose}></div>
      <div className="pl-panel" role="dialog" aria-label="Субтитры и перевод">
        <div className="m-sw-head"><h3>Дорожки</h3></div>
        <div className="m-sheet-scroll">
          <div className="m-tr-list">
            <div className="m-tr-group">
              <div className="m-tr-glabel">Субтитры</div>
              {TRACKS_PRIMARY.map((t) => (
                <div key={t} className={"m-tr-opt" + (t === primary ? " sel" : "")} onClick={() => onPrimary(t)}>{t}<span className="tick"></span></div>
              ))}
            </div>
            <div className="m-tr-group">
              <div className="m-tr-glabel">Перевод</div>
              {TRACKS_REFERENCE.map((t) => (
                <div key={t} className={"m-tr-opt" + (t === reference ? " sel" : "")} onClick={() => onReference(t)}>{t}<span className="tick"></span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}

function App({ t }) {
  const video = RECENTS_SEED[0];
  const [saved, setSaved] = useState(SAVED_SEED);
  const [freshId, setFreshId] = useState(null);
  const [playing, setPlaying] = useState(true);
  const [cueIndex, setCueIndex] = useState(0);
  const [primaryTrack, setPrimaryTrack] = useState("English");
  const [refTrack, setRefTrack] = useState("Русский");
  const [panel, setPanel] = useState(null); // {type:'word',...} | 'saved' | 'tracks'

  const currentRef = useRef(0);
  const fillRef = useRef(null);
  const knobRef = useRef(null);
  const timeRef = useRef(null);

  const refOn = t.referenceLine && refTrack !== "Нет";

  const paint = useCallback((c) => {
    const pct = (c / DEMO_DURATION) * 100;
    if (fillRef.current) fillRef.current.style.width = pct + "%";
    if (knobRef.current) knobRef.current.style.left = pct + "%";
    if (timeRef.current) timeRef.current.textContent = lfmt(c);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      let c = currentRef.current + dt;
      if (c >= DEMO_DURATION) c = 0;
      currentRef.current = c;
      paint(c);
      const idx = CUES.findIndex((cu) => c >= cu.start && c < cu.end);
      const useIdx = idx === -1 ? CUES.length - 1 : idx;
      setCueIndex((p) => (p === useIdx ? p : useIdx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint]);

  const cue = CUES[cueIndex] || CUES[0];

  const onWord = (clean, display) => { setPlaying(false); setPanel({ type: "word", clean, display }); };
  const isSaved = (clean, display) => { const hw = (DICT[clean] && DICT[clean].hw || display).toLowerCase(); return saved.some((w) => w.word.toLowerCase() === hw); };
  const handleSave = (add, payload) => {
    if (add) { const id = "sv" + Date.now(); setSaved((s) => [{ id, ...payload }, ...s]); setFreshId(id); setTimeout(() => setFreshId(null), 750); }
    else if (panel && panel.type === "word") { const hw = (DICT[panel.clean] && DICT[panel.clean].hw || panel.display).toLowerCase(); setSaved((s) => s.filter((w) => w.word.toLowerCase() !== hw)); }
  };

  const seek = (e) => {
    const host = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - host.left) / host.width));
    currentRef.current = p * DEMO_DURATION; paint(currentRef.current);
    const idx = CUES.findIndex((cu) => currentRef.current >= cu.start && currentRef.current < cu.end);
    setCueIndex(idx === -1 ? CUES.length - 1 : idx);
  };

  const activeClean = panel && panel.type === "word" ? panel.clean : null;

  return (
    <div className={"phone-land stitch" + (t.snakes ? " snakes" : "") + (t.curves ? " curves" : "")}>
      <div className="pl-video"></div>
      <div className="pl-vcenter">
        <span className="m-vmark"><span className="ring"></span><span className="handle"></span></span>
        <span className="m-vlabel">VK · VIDEO STREAM</span>
      </div>

      {/* top chrome */}
      <div className="pl-top">
        <button className="pl-btn snake-host" onClick={() => { window.location.href = "ЛУПА — Смартфон.html"; }} aria-label="Назад (вертикальный вид)">←<SnakeBorder shape="circle" /></button>
        <div className="pl-title">{video.title}</div>
        <div className="pl-spacer"></div>
        <button className="pl-btn snake-host" onClick={() => setPanel("tracks")} aria-label="Дорожки"><Ic.captions /><SnakeBorder shape="circle" /></button>
        <button className="pl-words snake-host" onClick={() => setPanel("saved")}>
          Мои слова <span className="n">{saved.length}</span>
          <SnakeBorder shape="pill" always={t.wordsAlways} key={t.wordsAlways ? "a" : "p"} />
        </button>
      </div>

      <LandSubs cue={cue} refOn={refOn} activeClean={activeClean} onWord={onWord} />

      {/* floating controls */}
      <div className="pl-ctrl">
        <button className="ctrl-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Пауза" : "Играть"}>
          {playing ? <Ic.pause /> : <Ic.play />}
        </button>
        <div className="timecode"><span ref={timeRef}>0:00</span><span className="sep">/</span>{lfmt(DEMO_DURATION)}</div>
        <div className="seek" onClick={seek}><div className="track"></div><div className="fill" ref={fillRef}></div><div className="knob" ref={knobRef}></div></div>
      </div>

      <div className="pl-island"></div>
      <div className="pl-home"></div>

      {/* panels */}
      {panel && panel.type === "word" ? (
        <WordPanel clean={panel.clean} display={panel.display} saved={isSaved(panel.clean, panel.display)} onSave={handleSave} onClose={() => setPanel(null)} />
      ) : null}
      {panel === "saved" ? (
        <SavedPanel words={saved} freshId={freshId} onRemove={(id) => setSaved((s) => s.filter((w) => w.id !== id))} onClose={() => setPanel(null)} />
      ) : null}
      {panel === "tracks" ? (
        <TrackPanel primary={primaryTrack} reference={refTrack} onPrimary={setPrimaryTrack} onReference={setRefTrack} onClose={() => setPanel(null)} />
      ) : null}
    </div>
  );
}

function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 48) / 874));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--motion", (t.motion / 100).toFixed(2));
    r.style.setProperty("--radius", t.radius + "px");
    r.style.setProperty("--snake-sw", t.snakeWeight + "px");
    r.style.setProperty("--snake-amp", t.snakeWiggle + "px");
    r.style.setProperty("--snake-wavelen", t.snakeDensity + "px");
  }, [t.motion, t.radius, t.snakeWeight, t.snakeWiggle, t.snakeDensity]);

  return (
    <div className="land-stage">
      <div style={{ transform: "scale(" + scale + ")", transformOrigin: "center center", flexShrink: 0 }}>
        <App t={t} />
      </div>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Строчка-кольцо" />
        <TweakToggle label="Включить" value={t.snakes} onChange={(v) => setTweak("snakes", v)} />
        <TweakToggle label="Кольцо у «Мои слова» всегда" value={t.wordsAlways} onChange={(v) => setTweak("wordsAlways", v)} />
        <TweakSlider label="Шаг волны" value={t.snakeDensity} min={8} max={28} step={1} unit="px"
          onChange={(v) => setTweak("snakeDensity", v)} />
        <TweakSlider label="Глубина петель" value={t.snakeWiggle} min={1} max={9} step={1} unit="px"
          onChange={(v) => setTweak("snakeWiggle", v)} />
        <TweakSlider label="Толщина" value={t.snakeWeight} min={2} max={6} step={0.5} unit="px"
          onChange={(v) => setTweak("snakeWeight", v)} />
        <TweakSection label="Движение" />
        <TweakSlider label="Интенсивность" value={t.motion} min={0} max={100} step={5} unit="%"
          onChange={(v) => setTweak("motion", v)} />
        <TweakSection label="Субтитры" />
        <TweakToggle label="Русская строка-перевод" value={t.referenceLine} onChange={(v) => setTweak("referenceLine", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
