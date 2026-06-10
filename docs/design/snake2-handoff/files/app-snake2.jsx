/* app-snake2.jsx — LUPA monochrome + dense "stitch" rings circling each element (reuses pieces.jsx + data.jsx) */
const { useState, useRef, useEffect, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "motion": 55,
  "referenceLine": true,
  "curves": true,
  "radius": 20,
  "snakes": true,
  "snakeWeight": 3,
  "snakeSpeed": 6,
  "snakeWiggle": 4,
  "snakeDensity": 13
}/*EDITMODE-END*/;

function Wave({ cls }) {
  return <div className={"wave " + (cls || "")} aria-hidden="true"></div>;
}


function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [screen, setScreen] = useState("start");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [recents, setRecents] = useState(RECENTS_SEED);
  const [activeVideo, setActiveVideo] = useState(null);

  const [saved, setSaved] = useState(SAVED_SEED);
  const [freshId, setFreshId] = useState(null);

  const [playing, setPlaying] = useState(false);
  const [cueIndex, setCueIndex] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [primaryTrack, setPrimaryTrack] = useState("English");
  const [refTrack, setRefTrack] = useState("Русский");
  const [fullscreen, setFullscreen] = useState(false);
  const [vkMode, setVkMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popover, setPopover] = useState(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  const wellRef = useRef(null);
  const captionsBtnRef = useRef(null);
  const hideTimer = useRef(null);
  const currentRef = useRef(0);
  const fillRef = useRef(null);
  const knobRef = useRef(null);
  const timeRef = useRef(null);

  const paintTime = useCallback((c) => {
    const pct = (c / DEMO_DURATION) * 100;
    if (fillRef.current) fillRef.current.style.width = pct + "%";
    if (knobRef.current) knobRef.current.style.left = pct + "%";
    if (timeRef.current) timeRef.current.textContent = fmtTime(c);
  }, []);

  const applyTime = useCallback((c) => {
    currentRef.current = c;
    paintTime(c);
    const idx = CUES.findIndex((cu) => c >= cu.start && c < cu.end);
    const useIdx = idx === -1 ? CUES.length - 1 : idx;
    setCueIndex((p) => (p === useIdx ? p : useIdx));
  }, [paintTime]);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--motion", (t.motion / 100).toFixed(2));
    r.style.setProperty("--radius", t.radius + "px");
    r.style.setProperty("--snake-sw", t.snakeWeight + "px");
    r.style.setProperty("--snake-dur", (2.4 - t.snakeSpeed * 0.18).toFixed(2) + "s");
    r.style.setProperty("--snake-amp", t.snakeWiggle + "px");
    r.style.setProperty("--snake-wavelen", t.snakeDensity + "px");
  }, [t.motion, t.radius, t.snakeWeight, t.snakeSpeed, t.snakeWiggle, t.snakeDensity]);

  const refOn = t.referenceLine && refTrack !== "Нет";

  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000; last = now;
      let c = currentRef.current + dt;
      if (c >= DEMO_DURATION) c = 0;
      currentRef.current = c;
      paintTime(c);
      const idx = CUES.findIndex((cu) => c >= cu.start && c < cu.end);
      const useIdx = idx === -1 ? CUES.length - 1 : idx;
      setCueIndex((p) => (p === useIdx ? p : useIdx));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paintTime]);

  const reveal = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing && !menuOpen && !popover) setControlsVisible(false);
    }, 2800);
  }, [playing, menuOpen, popover]);

  useEffect(() => {
    if (!playing || menuOpen || popover) { setControlsVisible(true); return; }
    reveal();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [playing, menuOpen, popover, reveal]);

  const cue = CUES[cueIndex] || CUES[0];

  const loadVideo = useCallback((video) => {
    setLoading(true);
    setMenuOpen(false); setPopover(null);
    setTimeout(() => {
      setActiveVideo(video);
      setScreen("player");
      setLoading(false);
      currentRef.current = 0;
      setCueIndex(0);
      paintTime(0);
      setPlaying(true);
      setRecents((rs) => [video, ...rs.filter((r) => r.id !== video.id)]);
    }, 950);
  }, [paintTime]);

  const submitUrl = (e) => {
    e.preventDefault();
    if (loading) return;
    loadVideo({ id: "url-" + Date.now(), title: "City of Tomorrow — Documentary", lang: "EN", dur: "12:40", when: "сейчас" });
  };

  const backToList = () => {
    setScreen("start"); setPlaying(false); setPopover(null); setMenuOpen(false);
    setFullscreen(false); setVkMode(false);
    currentRef.current = 0; setCueIndex(0);
  };

  const onWord = useCallback((e, clean, display) => {
    const wellRect = wellRef.current.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setPlaying(false);
    setMenuOpen(false);
    setPopover({
      clean, display,
      anchor: {
        x: r.left - wellRect.left + r.width / 2,
        y: r.top - wellRect.top,
        wellW: wellRect.width, wellH: wellRect.height,
      },
    });
  }, []);

  const isSaved = (clean, display) => {
    const hw = (DICT[clean] && DICT[clean].hw || display).toLowerCase();
    return saved.some((w) => w.word.toLowerCase() === hw);
  };

  const handleSave = (add, payload) => {
    if (add) {
      const id = "sv-" + Date.now();
      setSaved((s) => [{ id, ...payload }, ...s]);
      setFreshId(id);
      setTimeout(() => setFreshId(null), 700);
    } else if (popover) {
      const hw = (DICT[popover.clean] && DICT[popover.clean].hw || popover.display).toLowerCase();
      setSaved((s) => s.filter((w) => w.word.toLowerCase() !== hw));
    }
  };

  const removeSaved = (id) => setSaved((s) => s.filter((w) => w.id !== id));
  const removeRecent = (id) => setRecents((rs) => rs.filter((r) => r.id !== id));

  const activeClean = popover ? popover.clean : null;

  return (
    <div className={"viewport stitch" + (t.curves ? " curves" : "") + (t.snakes ? " snakes" : "")}>
      <div className="window">
        <div className="titlebar">
          <div className="lights"><span className="light"></span><span className="light"></span><span className="light"></span></div>
          <span className="tb-title">лупа</span>
          <span className="tb-meta">{screen === "player" ? "плеер" : "библиотека"} · v0.4</span>
        </div>

        <div className="stage">
          {/* masthead */}
          <header className="mh">
            <Wave cls="mh-wave" />
          </header>

          {/* url bar */}
          <form className="urlbar" onSubmit={submitUrl}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="вставь ссылку vkvideo.ru/video…" aria-label="VK Video URL" disabled={loading} />
            <button className="btn-load snake-host" type="submit" disabled={loading}>
              {loading ? "Загрузка" : "Загрузить"}<span className="arr">→</span>
              <SnakeBorder shape="pill" />
            </button>
          </form>

          {loading ? <div className="loadwrap"><div className="loadbar"></div></div> : null}

          {/* ---------- START ---------- */}
          {screen === "start" ? (
            <React.Fragment>
              <div className="section-head">
                <h2>Недавние</h2>
                <Wave />
              </div>
              <div className="recent-scroll">
                <RecentGrid videos={recents} onSelect={loadVideo} onRemove={removeRecent} snake={t.snakes} />
              </div>
            </React.Fragment>
          ) : null}

          {/* ---------- PLAYER ---------- */}
          {screen === "player" && activeVideo ? (
            <div className="player-view">
              <div className="backrow">
                <button className="btn-back snake-host" onClick={backToList}><span className="barr">←</span>Назад<SnakeBorder shape="pill" /></button>
                <span className="now-playing"><b>{activeVideo.title}</b></span>
              </div>

              <div className={"player-grid" + (fullscreen ? " fs" : "")}>
                <div className="player-col">
                  <div className="video-well" ref={wellRef} onMouseMove={reveal}>
                    <div className="video-pattern"></div>
                    <div className="video-center">
                      <span className="vc-mark"><span className="ring"></span><span className="handle"></span></span>
                      <span className="vc-label">VK · VIDEO STREAM</span>
                    </div>

                    {playing ? <div className="playing-dot"><span className="pd"></span>ВОСПРОИЗВЕДЕНИЕ</div> : null}

                    <SubtitleStack cue={cue} refOn={refOn} activeClean={activeClean} onWord={onWord} />

                    <div className={"corner" + (controlsVisible ? "" : " hidden")}>
                      <button className="corner-btn snake-host" onClick={() => setVkMode(true)} aria-label="Настройки VK (скорость, качество)"><Ic.gear /><SnakeBorder shape="circle" /></button>
                      <button className="corner-btn snake-host" onClick={() => setFullscreen((f) => !f)} aria-label={fullscreen ? "Выйти из полноэкранного" : "Полный экран"}>
                        {fullscreen ? <Ic.collapse /> : <Ic.expand />}<SnakeBorder shape="circle" />
                      </button>
                    </div>

                    <ControlBar
                      playing={playing} duration={DEMO_DURATION}
                      volume={volume} muted={muted} hidden={!controlsVisible}
                      onPlayPause={() => setPlaying((p) => !p)}
                      onSeek={applyTime}
                      onToggleMute={() => setMuted((m) => !m)}
                      onSetVolume={(v) => { setVolume(v); setMuted(v === 0); }}
                      captionsBtnRef={captionsBtnRef}
                      onToggleMenu={() => setMenuOpen((o) => !o)}
                      fillRef={fillRef} knobRef={knobRef} timeRef={timeRef}
                    />

                    {menuOpen ? (
                      <div style={{ position: "absolute", right: 14, bottom: 64, zIndex: 30 }}>
                        <TrackMenu
                          primary={primaryTrack} reference={refTrack}
                          onPrimary={setPrimaryTrack} onReference={setRefTrack}
                          onClose={() => setMenuOpen(false)}
                        />
                      </div>
                    ) : null}

                    {popover ? (
                      <WordPopover
                        anchor={popover.anchor} clean={popover.clean} display={popover.display}
                        saved={isSaved(popover.clean, popover.display)}
                        onSave={handleSave}
                        onClose={() => setPopover(null)}
                        snake={t.snakes}
                      />
                    ) : null}

                    {vkMode ? (
                      <div className="vk-mode">
                        <span className="vm-title">РЕЖИМ VK</span>
                        <span className="vm-sub">Скорость и качество доступны в фирменном меню VK. Интерактивные субтитры на это время скрыты.</span>
                        <button className="btn-back" style={{ marginTop: 6 }} onClick={() => setVkMode(false)}>Вернуться</button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="side-col">
                  <SavedWordsPanel words={saved} freshId={freshId} onRemove={removeSaved} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Forma" />
        <TweakSlider label="Скругление" value={t.radius} min={4} max={30} step={2} unit="px"
          onChange={(v) => setTweak("radius", v)} />
        <TweakToggle label="Извилистые линии" value={t.curves} onChange={(v) => setTweak("curves", v)} />
        <TweakSection label="Движение" />
        <TweakSlider label="Интенсивность" value={t.motion} min={0} max={100} step={5} unit="%"
          onChange={(v) => setTweak("motion", v)} />
        <TweakSection label="Строчка-кольцо" />
        <TweakToggle label="Включить" value={t.snakes} onChange={(v) => setTweak("snakes", v)} />
        <TweakSlider label="Шаг волны" value={t.snakeDensity} min={8} max={28} step={1} unit="px"
          onChange={(v) => setTweak("snakeDensity", v)} />
        <TweakSlider label="Глубина петель" value={t.snakeWiggle} min={1} max={9} step={1} unit="px"
          onChange={(v) => setTweak("snakeWiggle", v)} />
        <TweakSlider label="Толщина" value={t.snakeWeight} min={2} max={6} step={0.5} unit="px"
          onChange={(v) => setTweak("snakeWeight", v)} />
        <TweakSlider label="Скорость кружения" value={t.snakeSpeed} min={1} max={10} step={1}
          onChange={(v) => setTweak("snakeSpeed", v)} />
        <TweakSection label="Субтитры" />
        <TweakToggle label="Русская строка-перевод" value={t.referenceLine} onChange={(v) => setTweak("referenceLine", v)} />
      </TweaksPanel>
    </div>
  );
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60); const sec = s % 60;
  return m + ":" + String(sec).padStart(2, "0");
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
