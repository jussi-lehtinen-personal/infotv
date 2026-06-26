import React from 'react';
import { Link } from 'react-router-dom';
import { LuBell, LuMenu, LuUserCircle } from 'react-icons/lu';

export const AppHeader = ({
  unreadCount = 0,
  onBellClick,
  onMenuClick,
  user = null,
  profileTo = '/tili',
}) => (
  <header className="ui-app-header">
    {/* Vasen reuna: hampurilainen avaa navigaatiovalikon. Jos onMenuClick
        ei ole annettu, näytetään tyhjä spacer (sama leveys) joka pitää
        keskimmäisen wordmarkin keskellä. */}
    {onMenuClick ? (
      <button
        type="button"
        className="ui-app-header-btn"
        onClick={onMenuClick}
        aria-label="Valikko"
      >
        <LuMenu aria-hidden="true" />
      </button>
    ) : (
      <span className="ui-app-header-spacer" aria-hidden="true" />
    )}

    {/* Wordmark on absoluuttisesti keskitetty, joten oikean reunan
        vaihteleva leveys (nick) ei siirrä sitä. */}
    <div className="ui-app-header-wordmark" aria-label="Ahma Gamezone">
      <span className="ui-app-header-wordmark-top">AHMA</span>
      <span className="ui-app-header-wordmark-bottom">GAMEZONE</span>
    </div>

    <div className="ui-app-header-right">
      {/* Profiili: ikoni + (kirjautuneena) nimimerkki, max-width katkaistuna. */}
      <Link to={profileTo} className="ui-app-header-profile" aria-label="Tili">
        {user && user.nickname ? (
          <span className="ui-app-header-avatar" aria-hidden="true">
            {user.nickname.charAt(0).toUpperCase()}
          </span>
        ) : (
          <LuUserCircle className="ui-app-header-profile-icon" aria-hidden="true" />
        )}
      </Link>

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
    </div>
  </header>
);
