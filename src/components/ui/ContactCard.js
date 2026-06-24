import React, { useState } from "react";
import { LuPhone, LuMail } from "react-icons/lu";

// Shared contact card (round avatar + role/name + call/mail buttons + tappable
// phone/email rows). Used on the team page "Yhteystiedot" tab and the org page.
// CSS lives in index.css (.ui-contact-*).
const Avatar = ({ photo }) => {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      <img
        className="ui-contact-avatar"
        src={photo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="ui-contact-avatar ui-contact-avatar--ph" aria-hidden="true">
      <span className="material-symbols-rounded">&#xE7FD;</span>
    </div>
  );
};

export const ContactCard = ({ name, role, email, phone, photo }) => {
  const tel = phone ? `tel:${String(phone).replace(/\s+/g, "")}` : null;
  const mail = email ? `mailto:${email}` : null;
  return (
    <div className="ui-contact-card">
      <div className="ui-contact-head">
        <Avatar photo={photo} />
        <div className="ui-contact-main">
          {role && <div className="ui-contact-role">{role}</div>}
          <div className="ui-contact-name">{name}</div>
        </div>
        <div className="ui-contact-actions">
          {tel && (
            <a className="ui-contact-btn" href={tel} aria-label="Soita">
              <LuPhone />
            </a>
          )}
          {mail && (
            <a className="ui-contact-btn" href={mail} aria-label="Sähköposti">
              <LuMail />
            </a>
          )}
        </div>
      </div>
      {phone && (
        <a className="ui-contact-row" href={tel}>
          <span className="ui-contact-ico"><LuPhone /></span>
          <span>{phone}</span>
        </a>
      )}
      {email && (
        <a className="ui-contact-row" href={mail}>
          <span className="ui-contact-ico"><LuMail /></span>
          <span>{email}</span>
        </a>
      )}
    </div>
  );
};
