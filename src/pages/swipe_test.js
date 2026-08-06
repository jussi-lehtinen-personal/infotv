// pages/swipe_test.js  —  /swipe-test  (scratch page, NOT linked in nav)
//
// Isolated 3-panel swipe carousel to hunt the Chrome-Android "can't start a new
// swipe for ~0.5-0.8 s after a day change" stall. Starts from the barest possible
// base (swipe changes an integer, minimal DOM) and lets you TOGGLE each suspected
// factor on/off live, so we can bisect exactly what introduces the jank without a
// redeploy per experiment:
//   • tall scroll   — adds a tall vertical-scroll grid inside each panel
//     (nested scroll under the drag, like the real calendar)
//   • commit mode   — how the day change is applied after the slide:
//        flushSync  (original)  |  startTransition  |  plain setState
//   • recycle       — 3-panel recycle+reset (real) vs a wide non-recycling track
//
// The readout shows, for the LAST gesture: gap since the previous commit, and
// down→firstMove latency (both performance.now()-based).
import React, { Fragment, useCallback, useMemo, useRef, useState, useLayoutEffect, startTransition } from "react";
import { flushSync } from "react-dom";
import { useDrag } from "@use-gesture/react";

const CENTER_TX = -33.333;
const COLORS = ["#1e3a5f", "#5f1e3a", "#3a5f1e", "#5f4a1e", "#1e5f5a"];

export default function SwipeTest() {
  const [offset, setOffset] = useState(0);
  const [tall, setTall] = useState(false);
  const [commitMode, setCommitMode] = useState("startTransition"); // flushSync | startTransition | plain
  const [readout, setReadout] = useState("swipe →");

  const trackRef = useRef(null);
  const animatingRef = useRef(false);
  const commitTRef = useRef(0);
  const downTRef = useRef(0);
  const movedRef = useRef(false);

  // Keep the track centred on mount + after every offset change.
  useLayoutEffect(() => {
    const t = trackRef.current;
    if (!t) return;
    t.style.transition = "none";
    t.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, [offset]);

  const applyDay = useCallback((dir) => {
    commitTRef.current = performance.now();
    const upd = () => setOffset((o) => o + dir);
    if (commitMode === "flushSync") {
      // mimic the original: change AFTER a slide, inside flushSync
      const t = trackRef.current;
      const target = dir === -1 ? 0 : CENTER_TX * 2;
      t.style.transition = "transform 220ms ease-out";
      t.style.transform = `translate3d(${target}%, 0, 0)`;
      animatingRef.current = true;
      const onEnd = () => {
        t.removeEventListener("transitionend", onEnd);
        animatingRef.current = false;
        flushSync(upd);
      };
      t.addEventListener("transitionend", onEnd);
    } else if (commitMode === "startTransition") {
      const t = trackRef.current;
      const target = dir === -1 ? 0 : CENTER_TX * 2;
      t.style.transition = "transform 170ms ease-out";
      t.style.transform = `translate3d(${target}%, 0, 0)`;
      startTransition(upd);
    } else {
      upd(); // plain
    }
  }, [commitMode]);

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], first, last, cancel, xy: [x] }) => {
      if (first) {
        if (animatingRef.current) { cancel(); return; }
        downTRef.current = performance.now();
        movedRef.current = false;
        if (x < 20 || x > window.innerWidth - 20) { cancel(); return; }
      }
      if (!movedRef.current && Math.abs(mx) > 2) {
        movedRef.current = true;
        const now = performance.now();
        const sinceCommit = commitTRef.current ? Math.round(now - commitTRef.current) : -1;
        const d2m = Math.round(now - downTRef.current);
        setReadout(`sinceCommit ${sinceCommit}ms · down→move ${d2m}ms`);
      }
      const t = trackRef.current;
      if (!t) return;
      if (active) {
        t.style.transition = "none";
        t.style.transform = `translate3d(calc(${CENTER_TX}% + ${mx}px), 0, 0)`;
      } else if (last) {
        const w = window.innerWidth;
        const threshold = w * 0.25;
        const fast = Math.abs(vx) > 0.5;
        if (mx <= -threshold || (mx < -10 && fast)) applyDay(1);
        else if (mx >= threshold || (mx > 10 && fast)) applyDay(-1);
        else { t.style.transition = "transform 180ms ease-out"; t.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`; }
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } }
  );

  const panels = useMemo(() => [offset - 1, offset, offset + 1], [offset]);

  return (
    <Fragment>
      <style>{CSS}</style>
      <div className="st-root">
        <div className="st-bar">
          <div className="st-read">{readout}</div>
          <div className="st-ctrls">
            <label><input type="checkbox" checked={tall} onChange={(e) => setTall(e.target.checked)} /> tall scroll</label>
            <label>commit:&nbsp;
              <select value={commitMode} onChange={(e) => setCommitMode(e.target.value)}>
                <option value="flushSync">flushSync</option>
                <option value="startTransition">startTransition</option>
                <option value="plain">plain</option>
              </select>
            </label>
            <button onClick={() => applyDay(-1)}>‹</button>
            <span className="st-day">day {offset}</span>
            <button onClick={() => applyDay(1)}>›</button>
          </div>
        </div>

        <div className="st-viewport">
          <div ref={trackRef} className="st-track" {...bind()}>
            {panels.map((d, i) => (
              <TestPanel key={d} day={d} color={COLORS[((d % COLORS.length) + COLORS.length) % COLORS.length]} tall={tall} isCurrent={i === 1} />
            ))}
          </div>
        </div>
      </div>
    </Fragment>
  );
}

const TestPanel = React.memo(function TestPanel({ day, color, tall, isCurrent }) {
  const hours = [];
  for (let h = 8; h <= 23; h++) hours.push(h);
  return (
    <div className={`st-panel ${isCurrent ? "" : "st-inactive"}`}>
      <div className="st-card" style={{ background: color }}>
        {tall ? (
          <div className="st-scroll">
            <div className="st-grid">
              {hours.map((h) => (
                <div key={h} className="st-hour" style={{ top: (h - 8) * 64 }}>{String(h).padStart(2, "0")}:00</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="st-big">day<br />{day}</div>
        )}
      </div>
    </div>
  );
}, (a, b) => a.day === b.day && a.tall === b.tall && a.isCurrent === b.isCurrent);

const CSS = `
  .st-root{ position:fixed; inset:0; display:flex; flex-direction:column; background:#0b0b0d; color:#fff; font-family:system-ui,sans-serif; overflow:hidden; }
  .st-bar{ flex:0 0 auto; padding:8px 10px; background:#000; border-bottom:1px solid #333; }
  .st-read{ font:12px/1.4 monospace; color:#5f5; }
  .st-ctrls{ display:flex; align-items:center; gap:10px; margin-top:6px; font-size:13px; flex-wrap:wrap; }
  .st-ctrls label{ display:flex; align-items:center; gap:4px; }
  .st-ctrls button{ width:34px; height:30px; font-size:18px; background:#222; color:#fff; border:1px solid #444; border-radius:6px; }
  .st-day{ font-weight:700; min-width:56px; text-align:center; }
  .st-viewport{ flex:1 1 auto; min-height:0; width:100%; overflow:hidden; position:relative; display:flex; flex-direction:column; touch-action:pan-y; }
  .st-track{ display:flex; flex-direction:row; width:300%; flex:1 1 auto; min-height:0; touch-action:pan-y; }
  .st-panel{ flex:0 0 33.3333%; box-sizing:border-box; padding:8px; min-width:0; min-height:0; display:flex; flex-direction:column; }
  .st-inactive{ pointer-events:none; }
  .st-card{ flex:1 1 auto; min-height:0; border-radius:16px; display:flex; flex-direction:column; overflow:hidden; }
  .st-big{ margin:auto; text-align:center; font-size:64px; font-weight:800; line-height:1; }
  .st-scroll{ flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; touch-action:pan-y; }
  .st-grid{ position:relative; height:1024px; }
  .st-hour{ position:absolute; left:12px; font:14px/1 monospace; color:rgba(255,255,255,0.7); }
`;
