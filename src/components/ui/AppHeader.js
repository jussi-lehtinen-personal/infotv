import React from 'react';
import { LuBell } from 'react-icons/lu';

export const AppHeader = ({ unreadCount = 0, onBellClick }) => (
  <header className="ui-app-header">
    {/* Tyhjä spacer vasemmalle pitää AHMA GAMEZONE -wordmarkin keskellä
        kun hampurilainen on poistettu — sama leveys kuin oikean reunan
        bell-napilla. */}
    <span className="ui-app-header-spacer" aria-hidden="true" />

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
