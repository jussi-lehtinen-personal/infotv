import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Screen, PageHead, Loading } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards, getMySquad } from "../../lib/ahmaliigaApi";

// Korttimarkkina — the active season's card pool in BROWSE mode. Tapping a card
// opens Kortin tiedot (where you buy/sell). All list/search/filter UI lives in the
// shared <CardList>; the cards you already own are highlighted (ownedIds).

export default function LiigaMarket() {
  const nav = useNavigate();
  const [cards, setCards] = useState(null);
  const [settled, setSettled] = useState(false);
  const [ownedIds, setOwnedIds] = useState(null); // ids of cards in my squad → highlighted

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCards()
      .then((d) => { if (!cancelled) { setCards(d.cards || []); setSettled(!!d.settled); } })
      .catch(() => { if (!cancelled) setCards([]); });
    // My squad → the owned-card highlight. Anonymous/not-joined → empty set (no highlight).
    getMySquad()
      .then((d) => { if (!cancelled) setOwnedIds(new Set(((d && d.squad && d.squad.cards) || []).map((c) => c.id))); })
      .catch(() => { if (!cancelled) setOwnedIds(new Set()); });
    return () => { cancelled = true; };
  }, []);

  return (
    <Screen>
      <PageHead title="Korttimarkkina" />
      {cards == null ? (
        <Loading />
      ) : (
        <CardList cards={cards} settled={settled} ownedIds={ownedIds}
          onPick={(c) => nav(`/ahmaliiga/card/${encodeURIComponent(c.id)}`)}
          emptyText={cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei osumia."} />
      )}
    </Screen>
  );
}
