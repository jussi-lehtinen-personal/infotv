import React from 'react';
import { LuMenu, LuBell } from 'react-icons/lu';

export const AppHeader = ({ unreadCount = 0, onMenuClick, onBellClick }) => (
  <header className="ui-app-header">
    <button
      type="button"
      className="ui-app-header-btn"
      onClick={onMenuClick}
      aria-label="Valikko"
    >
      <LuMenu aria-hidden="true" />
    </button>

    <div className="ui-app-header-wordmark" aria-label="Ahma Gamezone">
      <span className="ui-app-header-wordmark-top">AHMA</span>
      <span className="ui-app-header-wordmark-bottom">GAMEZONE</span>
    </div>

    <button
      type="button"
      className="ui-app-header-btn"
      onClick={onBellClick}
      aria-label="Ilmoitukset"
    >
      <LuBell aria-hidden="true" />
      {unreadCount > 0 && (
        <span className="ui-app-header-badge" aria-hidden="true">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  </header>
);
