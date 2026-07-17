import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Screen, PageHead, Loading } from "./_shared";
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
      <PageHead title="Korttimarkkina" />
      {cards == null ? (
        <Loading />
      ) : (
        <CardList cards={cards} settled={settled}
          onPick={(c) => nav(`/ahmaliiga/card/${encodeURIComponent(c.id)}`)}
          emptyText={cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei osumia."} />
      )}
    </Screen>
  );
}
