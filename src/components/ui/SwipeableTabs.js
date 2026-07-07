import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Box, Tabs, Tab } from "@mui/material";
import { useDrag } from "@use-gesture/react";

// Reusable tabs whose panels can also be changed by a horizontal swipe, with a
// slide animation. `tabs` = [{ value, label }]; `children` = one panel node per
// tab (same order). `value`/`onChange` are controlled by the parent. The viewport
// height follows the active panel so shorter tabs don't reserve the tallest one's
// space. Drop-in for a MUI <Tabs> + conditional-content pair.
export function SwipeableTabs({ tabs, value, onChange, children, tabsSx }) {
  const items = React.Children.toArray(children);
  const n = tabs.length;
  const pct = 100 / n;
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));

  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const panelRefs = useRef([]);
  const [height, setHeight] = useState("auto");

  const setTransform = useCallback((i, animate) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? "transform 260ms cubic-bezier(0.22,1,0.36,1)" : "none";
    track.style.transform = `translate3d(-${i * pct}%, 0, 0)`;
  }, [pct]);

  // Slide to the active panel whenever the controlled value changes.
  useLayoutEffect(() => { setTransform(index, true); }, [index, setTransform]);

  // Match the viewport height to the active panel (and keep it in sync as its
  // content changes — e.g. slots loading in).
  useLayoutEffect(() => {
    const el = panelRefs.current[index];
    if (!el) return undefined;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(measure); ro.observe(el); }
    return () => ro && ro.disconnect();
  }, [index, items.length]);

  const commit = useCallback((dir) => {
    const next = Math.min(n - 1, Math.max(0, index + dir));
    if (next !== index) onChange(tabs[next].value);
    else setTransform(index, true);
  }, [index, n, onChange, tabs, setTransform]);

  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], last, tap, first, cancel, xy: [x] }) => {
      const track = trackRef.current;
      if (!track || tap) return;
      // Ignore drags starting at the screen edge (browser back-swipe zone).
      if (first && (x < 20 || x > window.innerWidth - 20)) { cancel(); return; }
      if (active) {
        track.style.transition = "none";
        track.style.transform = `translate3d(calc(-${index * pct}% + ${mx}px), 0, 0)`;
      } else if (last) {
        const w = viewportRef.current ? viewportRef.current.clientWidth : window.innerWidth;
        const threshold = w * 0.25;
        const fast = Math.abs(vx) > 0.4;
        if (mx <= -threshold || (mx < -10 && fast)) commit(1);
        else if (mx >= threshold || (mx > 10 && fast)) commit(-1);
        else setTransform(index, true);
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } }
  );

  return (
    <>
      <Tabs value={value} onChange={(e, v) => onChange(v)} variant="fullWidth" textColor="primary" indicatorColor="primary"
        sx={{ minHeight: 0, "& .MuiTab-root": { minHeight: 0, py: 1, fontWeight: 800 }, ...tabsSx }}>
        {tabs.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
      </Tabs>
      <Box ref={viewportRef} sx={{ overflow: "hidden", width: "100%", height, transition: "height 240ms ease" }}>
        <Box ref={trackRef} {...bind()} sx={{ display: "flex", alignItems: "flex-start", width: `${n * 100}%`, touchAction: "pan-y" }}>
          {items.map((child, i) => (
            <Box key={tabs[i] ? tabs[i].value : i} ref={(el) => { panelRefs.current[i] = el; }} sx={{ flex: `0 0 ${pct}%`, minWidth: 0 }}>
              {child}
            </Box>
          ))}
        </Box>
      </Box>
    </>
  );
}
