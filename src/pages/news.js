import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { NewsCard } from "../components/ui/NewsCard";

const News = () => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/gamezone-news.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Lajitellaan päivämäärän mukaan uusin ensin — sama kuin
          // etusivun Ajankohtaista-listassa.
          const sorted = [...data].sort(
            (a, b) => new Date(b.date) - new Date(a.date)
          );
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
    <>
      <style>{css}</style>
      <div className="news-root">
        <PageHeader
          title="UUTISET"
          left={
            <Link to="/" className="news-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        {loading && <div className="news-status">Ladataan uutisia…</div>}

        {error && (
          <div className="news-status news-status--error">
            Uutisten lataus epäonnistui.
          </div>
        )}

        {!loading && !error && news.length === 0 && (
          <div className="news-status">Ei uutisia.</div>
        )}

        {!loading && !error && news.length > 0 && (
          <div className="news-list">
            {news.map((item) => (
              <NewsCard key={item.id || item.url} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default News;

const css = `${themeCSS}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.news-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator + a small gap. */
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* Sama back-link -tyyli kuin teams-sivulla */
.news-back {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  border-radius: 10px;
  padding: 2px;
  transition: color 0.15s;
}
.news-back:hover { color: var(--color-primary); }
.news-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.news-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.news-status {
  text-align: center;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
  padding: 28px 0;
}
.news-status--error { color: var(--color-loss); }

@media (min-width: 768px) {
  .news-root {
    padding: 26px 26px 28px 26px;
  }
  .news-list {
    max-width: 720px;
  }
}
`;
