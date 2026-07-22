import { useState, useEffect, useMemo } from "react";
import { getAhmaliigaCards, getMySquad, saveMySquad, getAhmaliigaState, getAhmaliigaRoundProgress } from "../../lib/ahmaliigaApi";
import { playedCardCount } from "./events";

// useSquad — the ONE source of truth for the manager's squad + trading rules, extracted
// from edit.js (Oma joukkue) so BOTH the squad editor AND the market/card-details buy-sell
// share identical logic (bank, transfers, minTeams, captain lock, optimistic persist).
// This hook owns DATA + RULES + persist only; UI/dialog state stays in the consuming page.
//
// Returns everything the editor needs as bare fields so callers can destructure and use
// the same names (drop-in). `canReplaceWith(c, replaceFor)` takes the outgoing card as an
// arg (it's the caller's UI-flow state, not squad state).
export function useSquad() {
  const [all, setAll] = useState(null);
  const [settled, setSettled] = useState(false);
  const [budget, setBudget] = useState(120);
  const [points, setPoints] = useState(null); // manager's season points (top stat)
  const [bank, setBank] = useState(120);      // money in hand (server-authoritative)
  const [transfers, setTransfers] = useState({ used: 0, free: 2 });
  const [ids, setIds] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [perCard, setPerCard] = useState(null); // this round's points per card
  const [round, setRound] = useState(null);     // current round (for the header line)
  const [minTeams, setMinTeams] = useState(2); // a full squad needs ≥ this many team cards (from /state; ECON-authoritative)
  const [captainLocked, setCaptainLocked] = useState(false); // a round game has started → captain frozen for the round
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Fast path: render as soon as cards + squad + state are in (all cheap). The per-card
    // points come from roundProgress, which fetches box scores (slow) — load it SEPARATELY
    // so the page paints immediately and points fill in.
    Promise.all([getAhmaliigaCards(), getMySquad().catch(() => ({})), getAhmaliigaState().catch(() => null)])
      .then(([cardsRes, squadRes, stateRes]) => {
        if (cancelled) return;
        setAll(cardsRes.cards || []);
        setSettled(!!cardsRes.settled);
        if (squadRes && squadRes.budget) setBudget(squadRes.budget);
        setBank(squadRes && squadRes.bank != null ? squadRes.bank : (squadRes && squadRes.budget) || 120);
        if (squadRes && squadRes.freeTransfers != null) setTransfers({ used: squadRes.transfersUsed || 0, free: squadRes.freeTransfers });
        if (stateRes && stateRes.standing) setPoints(stateRes.standing.seasonPts ?? stateRes.standing.roundPts ?? null);
        if (stateRes && stateRes.active && stateRes.currentRound) setRound(stateRes.currentRound);
        if (stateRes && stateRes.minTeams != null) setMinTeams(stateRes.minTeams);
        const sq = squadRes && squadRes.squad ? squadRes.squad : null;
        if (sq) { setIds((sq.cards || []).map((c) => c.id)); setCaptainId(sq.captainId); }
        // Captain is frozen for the round once one of MY OWN cards has a PLAYED game — not
        // just any round game. Uses the SIM clock in sim/replay (else historical games all
        // read as played → locked forever). Matches the backend check.
        if (stateRes && stateRes.active) {
          const clock = stateRes.simMode ? stateRes.simDate : null;
          const cardById = {};
          for (const c of cardsRes.cards || []) cardById[c.id] = c;
          const myCards = ((sq && sq.cards) || []).map((c) => cardById[c.id]).filter(Boolean);
          setCaptainLocked(playedCardCount(myCards, stateRes.games || [], clock) > 0);
        }
      })
      .catch(() => { if (!cancelled) setAll([]); });
    getAhmaliigaRoundProgress()
      .then((progRes) => { if (!cancelled) setPerCard(progRes && progRes.perCard ? progRes.perCard : {}); })
      .catch(() => { if (!cancelled) setPerCard({}); });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = {};
    for (const c of all || []) m[c.id] = c;
    return m;
  }, [all]);

  const selected = useMemo(() => ids.map((id) => byId[id]).filter(Boolean), [ids, byId]);
  // Squad value = sum of the current market prices of the cards you hold (FPL "team
  // value"). Distinct from Budjetti (cash in hand); rises as your cards appreciate.
  const squadValue = useMemo(() => selected.reduce((s, c) => s + (Number(c.price) || 0), 0), [selected]);
  const teamCount = selected.filter((c) => c.kind === "team").length;
  const emptySlots = 5 - ids.length;
  const teamsNeeded = Math.max(0, minTeams - teamCount); // teams still required to satisfy the rule
  // Every remaining slot must be a team → adding a player here would make ≥minTeams
  // unreachable. This is the single squad rule (minTeams ≡ the old maxPlayers cap).
  const mustPickTeam = emptySlots > 0 && teamsNeeded >= emptySlots;
  const transfersLeft = Math.max(0, transfers.free - transfers.used);
  const captain = byId[captainId] || selected[0] || null;
  const rest = selected.filter((c) => c.id !== (captain && captain.id));

  // Every change persists immediately. Optimistic: update state, save, and on failure
  // revert + surface the server message (e.g. the transfer limit).
  const persist = async (nextIds, nextCap) => {
    const prevIds = ids, prevCap = captainId, prevBank = bank;
    // optimistic bank: selling a removed card credits its current price, buying a new one
    // debits it. The server returns the authoritative bank + transfers.
    let nb = bank;
    for (const id of ids) if (!nextIds.includes(id)) nb += byId[id] ? byId[id].price : 0;
    for (const id of nextIds) if (!ids.includes(id)) nb -= byId[id] ? byId[id].price : 0;
    setIds(nextIds); setCaptainId(nextCap); setBank(nb); setError("");
    try {
      const res = await saveMySquad(nextIds, nextCap || "");
      if (res && res.bank != null) setBank(res.bank);
      if (res && res.freeTransfers != null) setTransfers({ used: res.transfersUsed || 0, free: res.freeTransfers });
    } catch (e) {
      setIds(prevIds); setCaptainId(prevCap); setBank(prevBank);
      setError(e.message || "Tallennus epäonnistui.");
    }
  };

  // selection rules for the shared list — the ONE rule is minTeams (a full squad needs
  // ≥ minTeams team cards). A player is pickable only while ≥minTeams stays reachable.
  const canReplaceWith = (c, replaceFor) => {
    if (!replaceFor) return false;
    const afford = c.price <= bank + replaceFor.price;
    const teamsAfter = teamCount - (replaceFor.kind === "team" ? 1 : 0) + (c.kind === "team" ? 1 : 0);
    const teamOk = c.kind === "team" || ids.length < 5 || teamsAfter >= minTeams; // full squad must keep ≥ minTeams
    return afford && teamOk;
  };
  const canAdd = (c) =>
    ids.length < 5 && !ids.includes(c.id) && c.price <= bank && (c.kind === "team" || !mustPickTeam);

  // This round's points for a card (null until loaded → shown as "—").
  const cardPts = (id) => (perCard ? (perCard[id] || 0) : null);

  return {
    all, settled, byId, budget, points, bank, transfers, transfersLeft,
    ids, captainId, perCard, round, minTeams, captainLocked, error, setError,
    selected, squadValue, teamCount, emptySlots, teamsNeeded, mustPickTeam, captain, rest,
    persist, canAdd, canReplaceWith, cardPts,
  };
}
