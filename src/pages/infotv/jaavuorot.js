import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuClock } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";
import { getMonday } from "../../Util";

moment.locale("fi");

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const isAhma = (t) => /kiekko.?ahma/i.test(t || "") || /(^|\s)KA[\s/]/i.test(t || "");

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
    return cols.filter((c) => c.items.length > 0);
  }, [items, monday]);

  // Split the (non-empty) days across two balanced columns, chronologically, no
  // day split. Rows flex to fill, so a heavier column just gets tighter rows.
  const columns = useMemo(() => {
    const total = days.reduce((s, d) => s + d.items.length, 0);
    const target = Math.ceil(total / 2);
    const cols = [[], []];
    let acc = 0;
    for (const d of days) {
      const c = acc < target || cols[0].length === 0 ? 0 : 1;
      cols[c].push(d);
      acc += d.items.length;
    }
    return cols;
  }, [days]);

  const weekRange = useMemo(() => {
    const sun = new Date(monday); sun.setDate(sun.getDate() + 6);
    return moment(monday).format("D.M.") + " – " + moment(sun).format("D.M.");
  }, [monday]);

  const empty = items !== null && !error && days.length === 0;

  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="JÄÄVUOROT" meta={weekRange} />

      <div className="jv-content">
        {items === null && <div className="jv-msg">Ladataan…</div>}
        {error && <div className="jv-msg">Vuoroja ei saatu haettua.</div>}
        {empty && <div className="jv-msg">Ei jäävuoroja tällä viikolla</div>}
        {!error && days.length > 0 && (
          <div className="jv-cols">
            <Column days={columns[0]} />
            <Column days={columns[1]} />
          </div>
        )}
      </div>
    </InfoTvStage>
  );
}

function Column({ days }) {
  return (
    <div className="jv-col">
      {days.map((d) => (
        <React.Fragment key={d.key}>
          <div className="jv-day">{capitalize(moment(d.date).format("dddd"))} {moment(d.date).format("D.M.")}</div>
          {d.items.map((it) => <ResRow key={it.id} item={it} />)}
        </React.Fragment>
      ))}
    </div>
  );
}

function ResRow({ item }) {
  const start = moment(item.start_date, "YYYY-MM-DD HH:mm").format("HH:mm");
  const end = moment(item.end_date, "YYYY-MM-DD HH:mm").format("HH:mm");
  const game = item.user_group?.name === "Tilapäisvaraus";
  const ahma = isAhma(item.text);
  return (
    <div className="jv-res">
      <LuClock className="jv-ic" />
      <span className="jv-time">{start}<span className="jv-dash">–</span>{end}</span>
      <span className={"jv-name" + (ahma ? " jv-name--ahma" : "")}>{item.text || "Varaus"}</span>
      {game && <span className="jv-peli">PELI</span>}
    </div>
  );
}

const css = `
.jv-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; flex-direction:column; }
.jv-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.06em; color:${STEEL}; }

.jv-cols { flex:1; min-height:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:minmax(0,1fr); column-gap:56px; }
.jv-col { min-height:0; overflow:hidden; display:flex; flex-direction:column; }

.jv-day { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:25px; letter-spacing:0.02em; text-transform:uppercase; color:var(--gz-text-primary, rgba(255,255,255,0.95)); padding:12px 2px 6px; }
.jv-day:first-child { padding-top:2px; }

.jv-res {
  flex:1 1 0; min-height:22px; max-height:40px;
  display:flex; align-items:center; gap:13px;
  padding:0 6px;
  border-bottom:1px solid rgba(255,255,255,0.07);
  overflow:hidden;
}
.jv-ic { width:18px; height:18px; flex-shrink:0; color:${STEEL}; }
.jv-time { flex-shrink:0; font-family:${FONT_BODY}; font-weight:800; font-size:21px; line-height:1.1; letter-spacing:0.01em; color:var(--gz-text-primary, #fff); font-variant-numeric:tabular-nums; }
.jv-dash { padding:0 3px; color:${STEEL}; }
.jv-name { flex:1; min-width:0; font-family:${FONT_BODY}; font-weight:600; font-size:21px; line-height:1.1; color:var(--gz-text-secondary, rgba(255,255,255,0.72)); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.jv-name--ahma { color:${ORANGE}; font-weight:700; }
.jv-peli { flex-shrink:0; font-family:${FONT_BODY}; font-weight:800; font-size:16px; letter-spacing:0.08em; color:${ORANGE}; border:1px solid rgba(240,110,30,0.5); border-radius:6px; padding:2px 9px; }
`;
