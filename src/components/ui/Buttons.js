import React from 'react';

export const NavButton = ({ onClick, icon, ariaLabel, type = 'button' }) => (
  <button type={type} className="ui-nav-btn" onClick={onClick} aria-label={ariaLabel}>
    <span className="material-symbols-rounded">{icon}</span>
  </button>
);

export const SelectorButton = ({ onClick, active, children, ...rest }) => (
  <button
    type="button"
    className={`ui-selector-btn${active ? ' ui-selector-btn--active' : ''}`}
    onClick={onClick}
    {...rest}
  >
    {children}
  </button>
);

export const PrimaryButton = ({ onClick, disabled, children }) => (
  <button
    type="button"
    className="ui-primary-btn"
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);

export const ToggleButton = ({ onClick, active, icon, children, ariaPressed }) => (
  <button
    type="button"
    className={`ui-toggle-btn${active ? ' ui-toggle-btn--active' : ''}`}
    onClick={onClick}
    aria-pressed={ariaPressed ?? active}
  >
    {icon && <span className="material-symbols-rounded">{icon}</span>}
    {children}
  </button>
);
