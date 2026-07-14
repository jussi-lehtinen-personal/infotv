import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { Screen, Title } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards } from "../../lib/ahmaliigaApi";

// Korttimarkkina — the active season's card pool in BROWSE mode. Tapping a card
// opens Kortin tiedot. All list/search/filter UI lives in the shared <CardList>.

export default function LiigaMarket() {
  const nav = useNavigate();
  const [cards, setCards] = useState(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCards()
      .then((d) => { if (!cancelled) { setCards(d.cards || []); setSettled(!!d.settled); } })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Screen>
      <Title sx={{ mb: 1.5 }}>Korttimarkkina</Title>
      {cards == null ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress sx={{ color: "primary.main" }} /></Box>
      ) : (
        <CardList cards={cards} settled={settled}
          onPick={(c) => nav(`/ahmaliiga/kortti/${encodeURIComponent(c.id)}`)}
          emptyText={cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei osumia."} />
      )}
    </Screen>
  );
}
