import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";
import { getMonday } from "../../Util";

moment.locale("fi");

const MAX_PER_DAY = 13;
const DEFAULT_COLOR = "#7A7F8C";

export default function InfoTvJaavuorot() {
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

  const days = useMemo(() => {
    const cols = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i);
      cols.push({ date: d, key: moment(d).format("YYYY-MM-DD"), items: [] });
    }
    const byKey = new Map(cols.map((c) => [c.key, c]));
    for (const it of items || []) {
      const col = byKey.get((it.start_date || "").slice(0, 10));
      if (col) col.items.push(it);
    }
    for (const c of cols) c.items.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
    return cols;
  }, [items, monday]);

  const weekRange = useMemo(() => {
    const sun = new Date(monday); sun.setDate(sun.getDate() + 6);
    return moment(monday).format("D.M.") + " – " + moment(sun).format("D.M.");
  }, [monday]);

  const todayKey = moment().format("YYYY-MM-DD");

  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="JÄÄVUOROT" meta={weekRange} />

      <div className="jv-content">
        {items === null && <div className="jv-msg">Ladataan…</div>}
        {items !== null && error && <div className="jv-msg">Vuoroja ei saatu haettua.</div>}
        {items !== null && !error && (
          <div className="jv-grid">
            {days.map((c) => {
              const isToday = c.key === todayKey;
              const shown = c.items.slice(0, MAX_PER_DAY);
              const overflow = c.items.length - shown.length;
              return (
                <div key={c.key} className={"jv-col" + (isToday ? " jv-col--today" : "")}>
                  <div className="jv-dayhead">
                    <span className="jv-dayname">{moment(c.date).format("dd")}</span>
                    <span className="jv-daydate">{moment(c.date).format("D.M.")}</span>
                  </div>
                  <div className="jv-chips">
                    {shown.map((it) => <Chip key={it.id} item={it} />)}
                    {overflow > 0 && <div className="jv-more">+{overflow} lisää</div>}
                    {c.items.length === 0 && <div className="jv-empty">—</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </InfoTvStage>
  );
}

function Chip({ item }) {
  const color = normHex(item.color) || DEFAULT_COLOR;
  const start = moment(item.start_date, "YYYY-MM-DD HH:mm").format("HH:mm");
  const end = moment(item.end_date, "YYYY-MM-DD HH:mm").format("HH:mm");
  const isGame = item.user_group?.name === "Tilapäisvaraus";
  return (
    <div className="jv-chip" style={{ borderLeftColor: color, background: tint(color) }}>
      <div className="jv-chip-top">
        <span className="jv-dot" style={{ background: color }} />
        <span className="jv-time">{start}<span className="jv-end">–{end}</span></span>
        {isGame && <span className="jv-game">PELI</span>}
      </div>
      <div className="jv-text">{item.text || "Varaus"}</div>
    </div>
  );
}

function normHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  return m ? "#" + m[1] : null;
}
function tint(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "rgba(255,255,255,0.04)";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.13)`;
}

const css = `
.jv-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; }
.jv-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.06em; color:${STEEL}; }

.jv-grid { flex:1; min-height:0; display:grid; grid-template-columns:repeat(7,1fr); gap:16px; }
.jv-col { min-height:0; display:flex; flex-direction:column; border-radius:20px; background:linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%); border:1px solid rgba(255,255,255,0.08); overflow:hidden; }
.jv-col--today { background:linear-gradient(180deg, rgba(240,110,30,0.16) 0%, rgba(240,110,30,0.05) 100%); border-color:rgba(240,110,30,0.4); }

.jv-dayhead { display:flex; align-items:baseline; justify-content:space-between; padding:12px 14px 10px; border-bottom:1px solid rgba(255,255,255,0.1); }
.jv-dayname { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.05em; color:#fff; text-transform:uppercase; }
.jv-col--today .jv-dayname { color:${ORANGE}; }
.jv-daydate { font-family:${FONT_BODY}; font-weight:700; font-size:21px; color:${STEEL}; }

.jv-chips { flex:1; min-height:0; display:flex; flex-direction:column; gap:7px; padding:11px 10px; overflow:hidden; }
.jv-chip { border-left:6px solid ${DEFAULT_COLOR}; border-radius:10px; padding:7px 11px; }
.jv-chip-top { display:flex; align-items:center; gap:9px; }
.jv-dot { width:11px; height:11px; border-radius:50%; flex-shrink:0; }
.jv-time { font-family:${FONT_BODY}; font-weight:800; font-size:20px; color:#fff; line-height:1; }
.jv-end { font-weight:600; color:${STEEL}; }
.jv-game { margin-left:auto; font-family:${FONT_DISPLAY}; font-size:16px; letter-spacing:0.08em; color:${ORANGE}; border:1px solid rgba(240,110,30,0.5); border-radius:5px; padding:1px 7px; }
.jv-text { font-family:${FONT_BODY}; font-weight:600; font-size:18px; color:rgba(255,255,255,0.8); line-height:1.15; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.jv-more { font-family:${FONT_BODY}; font-weight:700; font-size:17px; color:${ORANGE}; padding:2px 10px; }
.jv-empty { font-family:${FONT_DISPLAY}; font-size:30px; color:rgba(255,255,255,0.16); text-align:center; padding-top:14px; }

.jv-www { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.32em; color:rgba(255,255,255,0.62); }
.jv-venue { font-family:${FONT_DISPLAY}; font-size:30px; letter-spacing:0.14em; color:${STEEL}; }
`;
