/* app-mobile.jsx — ЛУПА on iPhone (reuses pieces.jsx + data.jsx + ios-frame.jsx) */
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
  "ctaAlways": true
}/*EDITMODE-END*/;

function mfmt(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ":" + String(sec).padStart(2, "0");
}

// ---- subtitle reading area: tappable words + RU line ----
function ReadBox({ cue, refOn, activeClean, onWord }) {
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
    <div className="m-read">
      <div className="m-read-label">
        <span>Субтитры · EN</span>
        <span className="live"><span className="d"></span>нажми слово</span>
      </div>
      <div className="m-subline" ref={lineRef} key={cue.id}>
        {tokens.map((tk, i) => {
          if (tk.type === "space") return <span key={i}> </span>;
          if (tk.type === "punct") return <span key={i} className="word punct">{tk.text}</span>;
          const isActive = activeClean === tk.clean;
          return <button key={i} className={"word" + (isActive ? " active" : "")} onClick={() => onWord(tk.clean, tk.text)}>{tk.text}</button>;
        })}
      </div>
      {refOn ? <div className="m-refline" key={cue.id + "r"}>{cue.ru}</div> : null}
    </div>
  );
}

// ---- word lookup bottom sheet ----
function WordSheet({ clean, display, saved, onSave, onClose }) {
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
      <div className="m-sheet-back" onClick={onClose}></div>
      <div className="m-sheet" role="dialog" aria-label={"Слово: " + display}>
        <div className="m-grab"></div>
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

// ---- saved words bottom sheet ----
function SavedSheet({ words, freshId, onRemove, onClose }) {
  return (
    <React.Fragment>
      <div className="m-sheet-back" onClick={onClose}></div>
      <div className="m-sheet" role="dialog" aria-label="Сохранённые слова">
        <div className="m-grab"></div>
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

// ---- track / translation bottom sheet ----
function TrackSheet({ primary, reference, onPrimary, onReference, onClose }) {
  return (
    <React.Fragment>
      <div className="m-sheet-back" onClick={onClose}></div>
      <div className="m-sheet" role="dialog" aria-label="Субтитры и перевод">
        <div className="m-grab"></div>
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
  const [screen, setScreen] = useState("start");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recents, setRecents] = useState(RECENTS_SEED);
  const [activeVideo, setActiveVideo] = useState(null);

  const [saved, setSaved] = useState(SAVED_SEED);
  const [freshId, setFreshId] = useState(null);

  const [playing, setPlaying] = useState(false);
  const [cueIndex, setCueIndex] = useState(0);
  const [primaryTrack, setPrimaryTrack] = useState("English");
  const [refTrack, setRefTrack] = useState("Русский");

  const [sheet, setSheet] = useState(null); // {type:'word', clean, display} | 'saved' | 'tracks'

  const currentRef = useRef(0);
  const fillRef = useRef(null);
  const knobRef = useRef(null);
  const timeRef = useRef(null);

  const refOn = t.referenceLine && refTrack !== "Нет";

  const paint = useCallback((c) => {
    const pct = (c / DEMO_DURATION) * 100;
    if (fillRef.current) fillRef.current.style.width = pct + "%";
    if (knobRef.current) knobRef.current.style.left = pct + "%";
    if (timeRef.current) timeRef.current.textContent = mfmt(c);
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

  const loadVideo = useCallback((video) => {
    setLoading(true); setSheet(null);
    setTimeout(() => {
      setActiveVideo(video); setScreen("player"); setLoading(false);
      currentRef.current = 0; setCueIndex(0); paint(0); setPlaying(true);
      setRecents((rs) => [video, ...rs.filter((r) => r.id !== video.id)]);
    }, 900);
  }, [paint]);

  const submitUrl = (e) => { e.preventDefault(); if (!loading) loadVideo({ id: "u" + Date.now(), title: "City of Tomorrow — Documentary", lang: "EN", dur: "12:40", when: "сейчас" }); };
  const back = () => { setScreen("start"); setPlaying(false); setSheet(null); currentRef.current = 0; setCueIndex(0); };

  const onWord = (clean, display) => { setPlaying(false); setSheet({ type: "word", clean, display }); };
  const isSaved = (clean, display) => { const hw = (DICT[clean] && DICT[clean].hw || display).toLowerCase(); return saved.some((w) => w.word.toLowerCase() === hw); };
  const handleSave = (add, payload) => {
    if (add) { const id = "sv" + Date.now(); setSaved((s) => [{ id, ...payload }, ...s]); setFreshId(id); setTimeout(() => setFreshId(null), 750); }
    else if (sheet && sheet.type === "word") { const hw = (DICT[sheet.clean] && DICT[sheet.clean].hw || sheet.display).toLowerCase(); setSaved((s) => s.filter((w) => w.word.toLowerCase() !== hw)); }
  };
  const removeSaved = (id) => setSaved((s) => s.filter((w) => w.id !== id));

  const seek = (e) => {
    const host = e.currentTarget.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - host.left) / host.width));
    currentRef.current = p * DEMO_DURATION; paint(currentRef.current);
    const idx = CUES.findIndex((cu) => currentRef.current >= cu.start && currentRef.current < cu.end);
    setCueIndex(idx === -1 ? CUES.length - 1 : idx);
  };

  const activeClean = sheet && sheet.type === "word" ? sheet.clean : null;

  return (
    <div className={"m-root stitch" + (t.snakes ? " snakes" : "") + (t.curves ? " curves" : "")}>
      {/* ---------- START ---------- */}
      {screen === "start" ? (
        <div className="m-screen">
          <div className="m-scroll">
            <div className="m-safetop"></div>
            <div className="m-topbar">
              <span className="m-kicker">ЛУПА · VK</span>
              <span className="m-spacer"></span>
            </div>
            <div className="m-wave wave"></div>
            <form className="m-urlrow" onSubmit={submitUrl}>
              <label className="m-url">
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="ссылка на видео VK…" aria-label="VK Video URL" />
              </label>
              <button className="m-cta snake-host" type="submit" aria-label="Загрузить">
                {loading ? "…" : "→"}
                <SnakeBorder shape="circle" always={t.ctaAlways} key={t.ctaAlways ? "a" : "p"} />
              </button>
            </form>
            <div className="m-sec"><h2>Недавние</h2><span className="m-secn">{String(recents.length).padStart(2, "0")}</span></div>
            <div className="m-list">
              {recents.map((v) => (
                <button className="m-card" key={v.id} onClick={() => loadVideo(v)}>
                  <div className="m-thumb">
                    <span className="m-lang">{v.lang}</span>
                    <span className="m-dur">{v.dur}</span>
                    <span className="m-playchip"></span>
                  </div>
                  <div className="m-cmeta">
                    <div className="m-ctitle">{v.title}</div>
                    <div className="m-cwhen">{v.when}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="m-dock">
            <button className="m-dock-pill" onClick={() => setSheet("saved")}>
              Мои слова <span className="n">{saved.length}</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- PLAYER ---------- */}
      {screen === "player" && activeVideo ? (
        <div className="m-screen">
          <div className="m-scroll">
            <div className="m-safetop"></div>
            <div className="m-pbar">
              <button className="m-back snake-host" onClick={back} aria-label="Назад">←<SnakeBorder shape="circle" /></button>
              <div className="m-ptitle"><b>{activeVideo.title}</b></div>
            </div>
            <div className="m-video">
              <div className="m-vcenter">
                <span className="m-vmark"><span className="ring"></span><span className="handle"></span></span>
                <span className="m-vlabel">VK · VIDEO STREAM</span>
              </div>
              {playing ? <div className="m-pdot"><span className="d"></span>ВОСПРОИЗВЕДЕНИЕ</div> : null}
            </div>
            <div className="m-controls">
              <button className="m-cbtn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Пауза" : "Играть"}>
                {playing ? <Ic.pause /> : <Ic.play />}
              </button>
              <div className="m-time"><span ref={timeRef}>0:00</span><span className="sep">/</span>{mfmt(DEMO_DURATION)}</div>
              <div className="m-seek" onClick={seek}><div className="tr"></div><div className="fl" ref={fillRef}></div><div className="kn" ref={knobRef}></div></div>
              <button className="m-cbtn ghost snake-host" onClick={() => setSheet("tracks")} aria-label="Дорожки"><Ic.captions /><SnakeBorder shape="circle" /></button>
            </div>
            <ReadBox cue={cue} refOn={refOn} activeClean={activeClean} onWord={onWord} />
            <div className="m-player-pad"></div>
          </div>
          <div className="m-dock">
            <button className="m-dock-pill" onClick={() => setSheet("saved")}>
              Мои слова <span className="n">{saved.length}</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------- SHEETS ---------- */}
      {sheet && sheet.type === "word" ? (
        <WordSheet clean={sheet.clean} display={sheet.display} saved={isSaved(sheet.clean, sheet.display)} onSave={handleSave} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "saved" ? (
        <SavedSheet words={saved} freshId={freshId} onRemove={removeSaved} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === "tracks" ? (
        <TrackSheet primary={primaryTrack} reference={refTrack} onPrimary={setPrimaryTrack} onReference={setRefTrack} onClose={() => setSheet(null)} />
      ) : null}
    </div>
  );
}

function Root() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--motion", (t.motion / 100).toFixed(2));
    r.style.setProperty("--radius", t.radius + "px");
    r.style.setProperty("--snake-sw", t.snakeWeight + "px");
    r.style.setProperty("--snake-amp", t.snakeWiggle + "px");
    r.style.setProperty("--snake-wavelen", t.snakeDensity + "px");
  }, [t.motion, t.radius, t.snakeWeight, t.snakeWiggle, t.snakeDensity]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 28, background: "#d8d6cf" }}>
      <IOSDevice>
        <App t={t} />
      </IOSDevice>
      <TweaksPanel title="Tweaks">
        <TweakSection label="Строчка-кольцо" />
        <TweakToggle label="Включить" value={t.snakes} onChange={(v) => setTweak("snakes", v)} />
        <TweakToggle label="Кольцо у CTA всегда" value={t.ctaAlways} onChange={(v) => setTweak("ctaAlways", v)} />
        <TweakSlider label="Шаг волны" value={t.snakeDensity} min={8} max={28} step={1} unit="px"
          onChange={(v) => setTweak("snakeDensity", v)} />
        <TweakSlider label="Глубина петель" value={t.snakeWiggle} min={1} max={9} step={1} unit="px"
          onChange={(v) => setTweak("snakeWiggle", v)} />
        <TweakSlider label="Толщина" value={t.snakeWeight} min={2} max={6} step={0.5} unit="px"
          onChange={(v) => setTweak("snakeWeight", v)} />
        <TweakSection label="Форма" />
        <TweakSlider label="Скругление" value={t.radius} min={4} max={30} step={2} unit="px"
          onChange={(v) => setTweak("radius", v)} />
        <TweakToggle label="Извилистые линии" value={t.curves} onChange={(v) => setTweak("curves", v)} />
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
