import React from "react";
import { Link } from "react-router-dom";

// "Tänään 18:42", "Eilen 14:21", "3 pv sitten 09:15", muuten "30.3.2026".
export function formatNewsDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(new Date()) - startOfDay(d)) / 86400000
  );
  if (diffDays === 0) return `Tänään ${time}`;
  if (diffDays === 1) return `Eilen ${time}`;
  if (diffDays > 1 && diffDays < 7) return `${diffDays} pv sitten ${time}`;
  return d.toLocaleDateString("fi-FI");
}

// Yksittäinen uutisrivi: pikkukuva vasemmalla + otsikko & päivä oikealla.
// Käytössä etusivun Ajankohtaista-listassa ja /uutiset-sivulla.
export const NewsCard = ({ item }) => {
  const isExternal = /^https?:\/\//i.test(item.url || "");
  const Wrapper = isExternal ? "a" : Link;
  const wrapperProps = isExternal
    ? { href: item.url, target: "_blank", rel: "noopener noreferrer" }
    : { to: item.url || "#" };

  return (
    <Wrapper className="ui-news-card" {...wrapperProps}>
      {item.image && (
        <div className="ui-news-image">
          <img src={item.image} alt="" />
        </div>
      )}
      <div className="ui-news-body">
        <div className="ui-news-title">{item.title}</div>
        {item.date && (
          <div className="ui-news-date">{formatNewsDate(item.date)}</div>
        )}
      </div>
    </Wrapper>
  );
};
