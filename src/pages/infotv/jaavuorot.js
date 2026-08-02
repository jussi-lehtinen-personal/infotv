import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";
import { getMonday } from "../../Util";

moment.locale("fi");

const GAME_COLOR = "#3B9BFF";
const AHMA_COLOR = ORANGE;
const OTHER_COLOR = "#8A90A0";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const isAhma = (t) => /kiekko.?ahma/i.test(t || "") || /(^|\s)KA[\s/]/i.test(t || "");
const toMin = (s) => { const m = moment(s, "YYYY-MM-DD HH:mm"); return m.hours() * 60 + m.minutes(); };

// Greedy lane packing per overlap-cluster → overlapping reservations sit side by
// side; a lone reservation gets full column width. Like a time-grid calendar.
function packLanes(list) {
  const evs = [...list].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => end <= e.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.endMin); }
      else laneEnds[lane] = e.endMin;
      e.lane = lane;
    }
    const lanes = laneEnds.length;
    for (const e of cluster) { e.lanes = lanes; }
    cluster = []; clusterEnd = -1;
  };
  for (const e of evs) {
    if (cluster.length && e.startMin >= clusterEnd) flush();
    cluster.push(e); clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return evs;
}

function InfoTvJaavuorot() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [params] = useSearchParams();

  const monday = useMemo(() => {
    const p = params.get("date");
    const d = p ? new Date(p) : new Date();
    return getMonday(isNaN(d.getTime()) ? new Date() : d);
  }, [params]);
  const mondayStr = useMemo(() => moment(monday).format("YYYY-MM-DD"), [monday]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/schedule?date=${mondayStr}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) { setError(true); setItems([]); } });
    return () => { cancelled = true; };
  }, [mondayStr]);

  const { days, range } = useMemo(() => {
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i);
      cols.push({ date: d, key: moment(d).format("YYYY-MM-DD"), events: [] });
    }
    const byKey = new Map(cols.map((c) => [c.key, c]));
    let lo = 24 * 60, hi = 0;
    for (const it of items || []) {
      const key = (it.start_date || "").slice(0, 10);
      const col = byKey.get(key);
      if (!col) continue;
      const startMin = toMin(it.start_date), endMin = Math.max(toMin(it.end_date), startMin + 20);
      lo = Math.min(lo, startMin); hi = Math.max(hi, endMin);
      const text = it.text || "Varaus";
      const kind = it.user_group?.name === "Tilapäisvaraus" ? "game" : isAhma(text) ? "ahma" : "other";
      col.events.push({ id: it.id, startMin, endMin, text, kind });
    }
    for (const c of cols) c.events = packLanes(c.events);
    // Range snapped to whole hours, clamped to a sensible default.
    const start = items && hi > lo ? Math.min(Math.floor(lo / 60) * 60, 8 * 60) : 8 * 60;
    const end = items && hi > lo ? Math.max(Math.ceil(hi / 60) * 60, 22 * 60) : 22 * 60;
    return { days: cols, range: { start, end } };
  }, [items, monday]);

  const weekRange = useMemo(() => {
    const sun = new Date(monday); sun.setDate(sun.getDate() + 6);
    return moment(monday).format("D.M.") + " – " + moment(sun).format("D.M.");
  }, [monday]);

  const span = range.end - range.start;
  const y = (min) => ((min - range.start) / span) * 100;
  const hours = [];
  for (let h = range.start; h <= range.end; h += 60) hours.push(h);

  const hasAny = (days || []).some((d) => d.events.length > 0);

  // "Now" line — only when the shown week IS the current week.
  const nowD = new Date();
  const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
  const isCurrentWeek = moment(monday).isSame(getMonday(new Date()), "day");
  const showNow = isCurrentWeek && nowMin >= range.start && nowMin <= range.end;

  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="JÄÄVUOROT" meta={weekRange} />

      <div className="jv-cal">
        {items === null && <div className="jv-msg">Ladataan…</div>}
        {items !== null && error && <div className="jv-msg">Vuoroja ei saatu haettua.</div>}
        {items !== null && !error && !hasAny && <div className="jv-msg">Ei jäävuoroja tällä viikolla</div>}
        {items !== null && !error && hasAny && (
          <>
            <div className="jv-head">
              <div className="jv-axishead" />
              {days.map((d) => (
                <div key={d.key} className="jv-dayhead">
                  <span className="jv-dayname">{capitalize(moment(d.date).format("dd"))}</span>
                  <span className="jv-daydate">{moment(d.date).format("D.M.")}</span>
                </div>
              ))}
            </div>
            <div className="jv-body">
              <div className="jv-axis">
                {hours.map((h) => (
                  <div key={h} className="jv-hour" style={{ top: y(h) + "%" }}>{String(h / 60).padStart(2, "0")}</div>
                ))}
              </div>
              <div className="jv-cols">
                {hours.map((h) => <div key={h} className="jv-gridline" style={{ top: y(h) + "%" }} />)}
                {days.map((d) => (
                  <div key={d.key} className="jv-col">
                    {d.events.map((e) => {
                      const color = e.kind === "game" ? GAME_COLOR : e.kind === "ahma" ? AHMA_COLOR : OTHER_COLOR;
                      const w = 100 / e.lanes;
                      return (
                        <div key={e.id} className="jv-ev" style={{
                          top: y(e.startMin) + "%", height: `calc(${y(e.endMin) - y(e.startMin)}% - 3px)`,
                          left: `calc(${e.lane * w}% + 1px)`, width: `calc(${w}% - 5px)`,
                          background: tint(color), borderLeft: `3px solid ${color}`,
                        }}>
                          <div className="jv-ev-time">{fmt(e.startMin)}<span>–{fmt(e.endMin)}</span></div>
                          <div className="jv-ev-name" style={e.kind === "ahma" ? { color: ORANGE } : undefined}>{e.text}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {showNow && <div className="jv-now" style={{ top: y(nowMin) + "%" }}><span className="jv-now-dot" /></div>}
              </div>
            </div>
          </>
        )}
      </div>
    </InfoTvStage>
  );
}

const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
function tint(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "rgba(255,255,255,0.05)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.16)`;
}

export default InfoTvJaavuorot;

const css = `
.jv-cal { position:absolute; top:116px; bottom:30px; left:40px; right:40px; display:flex; flex-direction:column; }
.jv-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.06em; color:${STEEL}; }

.jv-head { flex:0 0 auto; display:flex; padding-bottom:8px; }
.jv-axishead { width:64px; flex:0 0 auto; }
.jv-dayhead { flex:1; display:flex; align-items:baseline; gap:12px; padding-left:12px; }
.jv-dayname { font-family:${FONT_DISPLAY}; font-size:30px; letter-spacing:0.05em; color:#fff; text-transform:uppercase; }
.jv-daydate { font-family:${FONT_BODY}; font-weight:700; font-size:20px; color:${STEEL}; }

.jv-body { flex:1 1 auto; min-height:0; display:flex; position:relative; }
.jv-axis { width:64px; flex:0 0 auto; position:relative; }
.jv-hour { position:absolute; right:10px; transform:translateY(-50%); font-family:${FONT_BODY}; font-weight:700; font-size:19px; color:${STEEL}; }
.jv-cols { flex:1 1 auto; position:relative; display:flex; }
.jv-gridline { position:absolute; left:0; right:0; height:1px; background:rgba(255,255,255,0.07); }
.jv-col { flex:1; position:relative; }

.jv-ev { position:absolute; box-sizing:border-box; border-radius:6px; padding:3px 8px; overflow:hidden; }
.jv-ev-time { font-family:${FONT_BODY}; font-weight:800; font-size:16px; line-height:1.02; color:#fff; white-space:nowrap; }
.jv-ev-time span { font-weight:600; color:${STEEL}; }
.jv-ev-name { font-family:${FONT_BODY}; font-weight:600; font-size:15px; line-height:1.14; color:rgba(255,255,255,0.82); overflow:hidden; word-break:break-word; margin-top:1px; }

.jv-now { position:absolute; left:0; right:0; height:2px; background:#ff5a2a; z-index:6; box-shadow:0 0 8px rgba(255,90,42,0.55); }
.jv-now-dot { position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:#ff5a2a; }
`;
