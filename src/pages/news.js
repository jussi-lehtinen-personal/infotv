import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { NewsCard } from "../components/ui/NewsCard";
import { useGoBack } from "../hooks/useGoBack";

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, fontSize: 14, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const News = () => {
  const goBack = useGoBack("/");
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/gamezone-news.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Newest first — same as the home "Ajankohtaista" list.
          const sorted = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));
          setNews(sorted);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Uutiset" onBack={goBack} />

      {loading && <Status>Ladataan uutisia…</Status>}
      {error && <Status error>Uutisten lataus epäonnistui.</Status>}
      {!loading && !error && news.length === 0 && <Status>Ei uutisia.</Status>}

      {!loading && !error && news.length > 0 && (
        <Box sx={{ maxWidth: 520, mx: "auto", px: 1, display: "flex", flexDirection: "column", gap: 1.25 }}>
          {news.map((item) => (
            <NewsCard key={item.id || item.url} item={item} />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default News;
