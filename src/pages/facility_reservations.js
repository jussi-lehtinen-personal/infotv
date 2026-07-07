import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowLeft, LuCalendarDays, LuChevronLeft, LuChevronRight, LuLock } from "react-icons/lu";
import {
  Box, Typography, IconButton, Button, Select, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress,
} from "@mui/material";
import { SwipeableTabs } from "../components/ui/SwipeableTabs";
import moment from "moment";
import "moment/locale/fi";

import { useGoBack } from "../hooks/useGoBack";
import { getCachedUser, getMe } from "../auth/authClient";
import { ROOMS, getRoom, daySlots, DURATIONS, durationLabel } from "../data/rooms";
import {
  fetchReservations, createReservation, releaseReservation, updateReservation,
  fetchMyReservations, coachTeamsOf,
} from "../lib/reservationsClient";

moment.locale("fi");

const FMT = "YYYY-MM-DD";
const today = () => moment().format(FMT);
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Bebas title, matching the other headers (tracking + optical shift tokens).
const titleSx = {
  fontFamily: "var(--font-family-display)",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "var(--font-display-tracking)",
  transform: "translateY(var(--font-display-shift))",
  fontSize: 22,
};

const FacilityReservations = () => {
  const goBack = useGoBack("/");
  const [user, setUser] = useState(getCachedUser);
  useEffect(() => {
    let cancelled = false;
    getMe().then((u) => { if (!cancelled) setUser(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const myTeams = useMemo(() => coachTeamsOf(user), [user]);
  const isAdmin = !!(user && user.isAdmin);
  const canBook = !!user && (isAdmin || myTeams.length > 0);
  const myUserId = user && user.userId;

  const [roomId, setRoomId] = useState(ROOMS[0].id);
  const room = getRoom(roomId);
  const [tab, setTab] = useState("day");

  const [selected, setSelected] = useState(today);
  const [monthKey, setMonthKey] = useState(() => moment().format("YYYY-MM"));
  const [byDate, setByDate] = useState({}); // dateStr -> reservations[]
  const [reloadKey, setReloadKey] = useState(0);

  // Pick a day: select it AND bring the calendar to its month. The month arrows
  // change monthKey alone (free browsing) without touching the selected day.
  const selectDate = useCallback((dateStr) => {
    setSelected(dateStr);
    setMonthKey(dateStr.slice(0, 7));
  }, []);

  // Load the visible month's reservations (dots + day slots).
  useEffect(() => {
    let cancelled = false;
    const start = moment(monthKey + "-01").startOf("month");
    const end = start.clone().endOf("month");
    fetchReservations(roomId, start.format(FMT), end.format(FMT))
      .then((list) => {
        if (cancelled) return;
        const grouped = {};
        for (let d = start.clone(); d.isSameOrBefore(end); d.add(1, "day")) grouped[d.format(FMT)] = [];
        for (const r of list) (grouped[r.date] = grouped[r.date] || []).push(r);
        setByDate((prev) => ({ ...prev, ...grouped }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [monthKey, roomId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // ---- Booking dialog ----
  const [dialog, setDialog] = useState(null); // { mode:'create'|'edit', ... }
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const daySlotsForRoom = useMemo(() => daySlots(room), [room]);
  const dayMap = useMemo(() => {
    const map = {};
    for (const r of byDate[selected] || []) map[r.rowKey] = r;
    return map;
  }, [byDate, selected]);

  // Max bookable duration starting at a given slot index: consecutive free slots.
  const maxDurationAt = useCallback((idx) => {
    let n = 0;
    for (let i = idx; i < daySlotsForRoom.length; i += 1) {
      if (dayMap[daySlotsForRoom[i].rowKey]) break;
      n += 1;
      if (n * 30 >= 180) break;
    }
    return n * 30;
  }, [daySlotsForRoom, dayMap]);

  const openCreate = (slot, idx) => {
    const maxDur = maxDurationAt(idx);
    const durationMin = maxDur >= 60 ? 60 : maxDur;
    setErr("");
    setDialog({ mode: "create", slot, maxDur, durationMin, teamKey: myTeams[0] || "", description: "" });
  };
  const openEdit = (res) => {
    setErr("");
    setDialog({ mode: "edit", bookingId: res.bookingId, date: res.date, startSlot: res.startSlot, endSlot: res.endSlot, teamKey: res.teamKey, teamName: res.teamName, description: res.description || "" });
  };

  const saveDialog = async () => {
    if (!dialog) return;
    setSaving(true); setErr("");
    try {
      if (dialog.mode === "create") {
        await createReservation({ room: roomId, date: selected, slot: dialog.slot.label, durationMin: dialog.durationMin, teamKey: dialog.teamKey, description: dialog.description });
      } else {
        await updateReservation({ room: roomId, date: dialog.date, bookingId: dialog.bookingId, description: dialog.description });
      }
      setDialog(null);
      refresh();
    } catch (e) { setErr(e.message || "Tallennus epäonnistui."); }
    finally { setSaving(false); }
  };

  const doRelease = async ({ date, bookingId }) => {
    try {
      await releaseReservation({ room: roomId, date, bookingId });
      setDialog(null);
      refresh();
    } catch (e) { setErr(e.message || "Vapautus epäonnistui."); }
  };

  // ---- Calendar day picker (jump) ----
  const dateInputRef = useRef(null);
  const openPicker = () => {
    const el = dateInputRef.current;
    if (!el) return;
    if (el.showPicker) { try { el.showPicker(); return; } catch { /* fall through */ } }
    el.focus();
  };

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "var(--color-bg)", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      {/* Top bar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.75, pt: "calc(env(safe-area-inset-top) + 12px)", pb: 1.25 }}>
        <IconButton onClick={goBack} aria-label="Takaisin" sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}><LuArrowLeft /></IconButton>
        <Typography component="div" sx={{ flex: 1, ...titleSx }}>Tilan varaus</Typography>
        <IconButton onClick={openPicker} aria-label="Valitse päivä" sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}><LuCalendarDays /></IconButton>
        <Box component="input" ref={dateInputRef} type="date" value={selected} onChange={(e) => e.target.value && selectDate(e.target.value)} aria-hidden="true" tabIndex={-1}
          sx={{ position: "fixed", right: 12, top: 52, width: "1px", height: "1px", opacity: 0, pointerEvents: "none", border: 0, p: 0, m: 0 }} />
      </Box>

      <Box sx={{ maxWidth: 560, mx: "auto", px: 1.5 }}>
        {/* Room dropdown */}
        <Select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          fullWidth size="small"
          sx={{ mb: 1.5, bgcolor: "var(--color-surface)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-surface-border)" } }}
        >
          {ROOMS.map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </Select>

        <SwipeableTabs
          tabs={[{ value: "day", label: "Päivä" }, { value: "mine", label: "Omat varaukset" }]}
          value={tab}
          onChange={setTab}
          tabsSx={{ mb: 1 }}
        >
          {/* Päivä */}
          <Box>
            <MonthCalendar
              monthKey={monthKey}
              selected={selected}
              onSelect={selectDate}
              onMonth={(delta) => setMonthKey(moment(monthKey + "-01").add(delta, "month").format("YYYY-MM"))}
              byDate={byDate}
              myUserId={myUserId}
            />
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
              <IconButton size="small" aria-label="Edellinen päivä" onClick={() => selectDate(moment(selected).add(-1, "day").format(FMT))} sx={{ color: "text.secondary" }}><LuChevronLeft /></IconButton>
              <Typography sx={{ fontWeight: 700, textTransform: "capitalize" }}>{capitalize(moment(selected).format("dddd D.M.YYYY"))}</Typography>
              <IconButton size="small" aria-label="Seuraava päivä" onClick={() => selectDate(moment(selected).add(1, "day").format(FMT))} sx={{ color: "text.secondary" }}><LuChevronRight /></IconButton>
            </Box>
            <SlotList
              slots={daySlotsForRoom}
              dayMap={dayMap}
              selected={selected}
              canBook={canBook}
              myUserId={myUserId}
              onBook={openCreate}
              onEditOwn={openEdit}
              onRelease={doRelease}
            />
          </Box>
          {/* Omat varaukset */}
          <MineTab user={user} reloadKey={reloadKey} onRelease={doRelease} />
        </SwipeableTabs>
      </Box>

      {/* Booking dialog */}
      <BookingDialog
        dialog={dialog}
        myTeams={myTeams}
        isAdmin={isAdmin}
        saving={saving}
        err={err}
        onChange={(patch) => setDialog((d) => ({ ...d, ...patch }))}
        onClose={() => setDialog(null)}
        onSave={saveDialog}
        onRelease={() => dialog && doRelease({ date: dialog.date, bookingId: dialog.bookingId })}
        selected={selected}
      />
    </Box>
  );
};

export default FacilityReservations;

/* ============================= MONTH CALENDAR ============================= */

function MonthCalendar({ monthKey, selected, onSelect, onMonth, byDate, myUserId }) {
  const first = moment(monthKey + "-01");
  const daysInMonth = first.daysInMonth();
  const lead = (first.isoWeekday() + 6) % 7; // Monday=0 … Sunday=6
  const cells = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const now = today();

  return (
    <Box sx={{ bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-item)", p: 1.25, mb: 1.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.75 }}>
        <IconButton size="small" aria-label="Edellinen kuukausi" onClick={() => onMonth(-1)} sx={{ color: "text.secondary" }}><LuChevronLeft /></IconButton>
        <Typography sx={{ fontWeight: 700, textTransform: "capitalize" }}>{capitalize(first.format("MMMM YYYY"))}</Typography>
        <IconButton size="small" aria-label="Seuraava kuukausi" onClick={() => onMonth(1)} sx={{ color: "text.secondary" }}><LuChevronRight /></IconButton>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.25, textAlign: "center" }}>
        {["MA", "TI", "KE", "TO", "PE", "LA", "SU"].map((w) => (
          <Box key={w} sx={{ fontSize: 11, fontWeight: 700, color: "var(--gz-text-tertiary)", py: 0.5 }}>{w}</Box>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <Box key={`e${i}`} />;
          const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
          const isSel = dateStr === selected;
          const isToday = dateStr === now;
          const dayRes = byDate[dateStr] || [];
          const hasAny = dayRes.length > 0;
          const hasOwn = dayRes.some((r) => r.ownerUserId === myUserId);
          return (
            <Box key={dateStr} component="button" type="button" onClick={() => onSelect(dateStr)}
              sx={{
                position: "relative", aspectRatio: "1 / 1", boxSizing: "border-box", cursor: "pointer", borderRadius: "50%",
                bgcolor: isSel ? "rgba(var(--color-primary-rgb),0.18)" : "transparent",
                border: isSel ? "1px solid var(--color-primary)" : "1px solid transparent",
                color: isSel || isToday ? "primary.main" : "text.primary",
                fontWeight: isSel || isToday ? 800 : 500, fontSize: 14, fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
                WebkitTapHighlightColor: "transparent",
                "&:hover": { bgcolor: isSel ? "rgba(var(--color-primary-rgb),0.24)" : "var(--color-surface-divider)" },
              }}>
              {d}
              {hasAny && (
                <Box component="span" sx={{ position: "absolute", bottom: 3, width: 5, height: 5, borderRadius: "50%", bgcolor: hasOwn ? "var(--color-primary)" : "var(--gz-text-muted)" }} />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/* ============================= SLOT LIST ============================= */

const rowBase = {
  display: "flex", alignItems: "center", gap: 1, p: "8px 12px",
  borderRadius: "var(--radius-small)", border: "1px solid var(--color-surface-border)",
  bgcolor: "var(--color-surface)",
};
const varaaBtnSx = { minWidth: 0, px: 1.75, fontWeight: 800, bgcolor: "#16a34a", color: "#fff", "&:hover": { bgcolor: "#128a3e" } };

function SlotList({ slots, dayMap, selected, canBook, myUserId, onBook, onEditOwn, onRelease }) {
  const nowMins = moment().hours() * 60 + moment().minutes();
  const isPast = (mins) => selected < today() || (selected === today() && mins + 30 <= nowMins);

  // Merge consecutive slots of the same booking into one block; free slots stay
  // individual so any start time is bookable.
  const rows = [];
  for (let i = 0; i < slots.length; ) {
    const res = dayMap[slots[i].rowKey];
    if (!res) { rows.push({ kind: "free", slot: slots[i], idx: i }); i += 1; continue; }
    let j = i + 1;
    while (j < slots.length && dayMap[slots[j].rowKey] && dayMap[slots[j].rowKey].bookingId === res.bookingId) j += 1;
    rows.push({ kind: "res", res, count: j - i });
    i = j;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pb: 2 }}>
      {rows.map((row) => {
        if (row.kind === "free") {
          return (
            <FreeRow key={row.slot.rowKey} label={`${row.slot.label} – ${row.slot.endLabel}`}
              canBook={canBook} past={isPast(row.slot.mins)} onBook={() => onBook(row.slot, row.idx)} />
          );
        }
        const { res, count } = row;
        return (
          <BookingRow key={res.bookingId} res={res} count={count} own={res.ownerUserId === myUserId}
            onEdit={() => onEditOwn(res)} onRelease={() => onRelease({ date: selected, bookingId: res.bookingId })} />
        );
      })}
    </Box>
  );
}

function FreeRow({ label, canBook, past, onBook }) {
  return (
    <Box sx={{ ...rowBase, minHeight: 44 }}>
      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 108 }}>{label}</Typography>
      <Box sx={{ flex: 1 }} />
      {canBook && !past
        ? <Button size="small" variant="contained" onClick={onBook} sx={varaaBtnSx}>Varaa</Button>
        : <Typography sx={{ fontSize: 12, color: "var(--gz-text-muted)" }}>{past ? "" : "Vapaa"}</Typography>}
    </Box>
  );
}

// A whole booking as ONE block; height grows with the number of 30-min slots.
function BookingRow({ res, count, own, onEdit, onRelease }) {
  const label = `${res.startSlot} – ${res.endSlot}`;
  const minHeight = 44 + (count - 1) * 22;
  if (own) {
    return (
      <Box sx={{ ...rowBase, minHeight, alignItems: "stretch", borderColor: "rgba(var(--color-primary-rgb),0.5)", bgcolor: "rgba(var(--color-primary-rgb),0.10)", cursor: "pointer" }}
        role="button" tabIndex={0} onClick={onEdit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onEdit(); } }}>
        <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{label}</Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "primary.main" }} noWrap>
            Oma varaus{res.description ? ` · ${res.description}` : ""}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <Button size="small" variant="contained" color="primary" onClick={(e) => { e.stopPropagation(); onRelease(); }} sx={{ minWidth: 0, px: 1.5, fontWeight: 800 }}>Vapauta</Button>
        </Box>
      </Box>
    );
  }
  return (
    <Box sx={{ ...rowBase, minHeight, alignItems: "stretch", opacity: 0.7 }}>
      <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--gz-text-secondary)" }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, color: "var(--gz-text-muted)" }} noWrap>{res.teamName || "Varattu"}</Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <LuLock aria-label="Varattu" style={{ color: "var(--gz-text-muted)", flexShrink: 0 }} />
      </Box>
    </Box>
  );
}

/* ============================= MINE TAB ============================= */

function MineTab({ user, reloadKey, onRelease }) {
  const [bookings, setBookings] = useState(null);
  useEffect(() => {
    if (!user) { setBookings([]); return undefined; }
    let cancelled = false;
    fetchMyReservations().then((b) => { if (!cancelled) setBookings(b); }).catch(() => { if (!cancelled) setBookings([]); });
    return () => { cancelled = true; };
  }, [user, reloadKey]);

  if (!user) return <Note>Kirjaudu nähdäksesi omat varauksesi.</Note>;
  if (bookings == null) return <Box sx={{ textAlign: "center", py: 4 }}><CircularProgress size={22} color="primary" /></Box>;
  if (bookings.length === 0) return <Note>Ei tulevia varauksia.</Note>;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, pb: 2 }}>
      {bookings.map((b) => (
        <Box key={b.bookingId} sx={{ display: "flex", alignItems: "center", gap: 1, p: "10px 12px", borderRadius: "var(--radius-small)", border: "1px solid var(--color-surface-border)", bgcolor: "var(--color-surface)" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{capitalize(moment(b.date).format("dd D.M."))} · {b.startSlot}–{b.endSlot}</Typography>
            <Typography sx={{ fontSize: 12, color: "var(--gz-text-secondary)" }} noWrap>
              {b.roomName}{b.teamName ? ` · ${b.teamName}` : ""}{b.description ? ` · ${b.description}` : ""}
            </Typography>
          </Box>
          <Button size="small" variant="outlined" color="primary" onClick={() => onRelease({ date: b.date, bookingId: b.bookingId })} sx={{ fontWeight: 700 }}>Vapauta</Button>
        </Box>
      ))}
    </Box>
  );
}

const Note = ({ children }) => (
  <Typography sx={{ textAlign: "center", color: "var(--gz-text-muted)", py: 4 }}>{children}</Typography>
);

/* ============================= BOOKING DIALOG ============================= */

function BookingDialog({ dialog, myTeams, isAdmin, saving, err, onChange, onClose, onSave, onRelease, selected }) {
  const open = !!dialog;
  const isCreate = dialog && dialog.mode === "create";
  const durations = isCreate ? DURATIONS.filter((d) => d <= (dialog.maxDur || 0)) : [];
  const teamOptions = isAdmin ? ["", ...myTeams] : myTeams;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { bgcolor: "background.paper", backgroundImage: "none" } }}>
      {dialog && (
        <>
          <DialogTitle sx={{ fontWeight: 800 }}>
            {isCreate
              ? `Varaa ${dialog.slot.label} alkaen`
              : `Oma varaus ${dialog.startSlot}–${dialog.endSlot}`}
          </DialogTitle>
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
            <Typography sx={{ fontSize: 13, color: "var(--gz-text-secondary)" }}>
              {capitalize(moment((isCreate ? selected : dialog.date)).format("dddd D.M.YYYY"))}
            </Typography>

            {isCreate ? (
              <>
                {/* Duration */}
                <Box>
                  <Typography sx={{ fontSize: 12, color: "var(--gz-text-tertiary)", mb: 0.5 }}>Kesto</Typography>
                  <Select fullWidth size="small" value={dialog.durationMin} onChange={(e) => onChange({ durationMin: e.target.value })}>
                    {durations.map((d) => <MenuItem key={d} value={d}>{durationLabel(d)}</MenuItem>)}
                  </Select>
                </Box>
                {/* Team */}
                {teamOptions.length > 0 && (
                  <Box>
                    <Typography sx={{ fontSize: 12, color: "var(--gz-text-tertiary)", mb: 0.5 }}>Joukkue</Typography>
                    <Select fullWidth size="small" value={dialog.teamKey} onChange={(e) => onChange({ teamKey: e.target.value })} displayEmpty>
                      {teamOptions.map((t) => <MenuItem key={t || "_"} value={t}>{t || "(ei joukkuetta)"}</MenuItem>)}
                    </Select>
                  </Box>
                )}
              </>
            ) : (
              dialog.teamName ? <Typography sx={{ fontSize: 13 }}>Joukkue: <b>{dialog.teamName}</b></Typography> : null
            )}

            {/* Description */}
            <TextField
              label="Kuvaus (vapaaehtoinen)" size="small" fullWidth multiline minRows={2}
              value={dialog.description}
              onChange={(e) => onChange({ description: e.target.value })}
              inputProps={{ maxLength: 200 }}
            />

            {err && <Typography sx={{ color: "var(--color-loss)", fontSize: 13 }}>{err}</Typography>}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, justifyContent: isCreate ? "flex-end" : "space-between" }}>
            {!isCreate && (
              <Button color="primary" onClick={onRelease} sx={{ fontWeight: 700 }}>Vapauta</Button>
            )}
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button onClick={onClose} sx={{ color: "text.secondary" }}>Peruuta</Button>
              <Button variant="contained" onClick={onSave} disabled={saving || (isCreate && !dialog.durationMin)}>
                {saving ? "Tallennetaan…" : "Tallenna"}
              </Button>
            </Box>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
