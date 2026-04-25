import React from 'react';

// Indeterminate progress strip; pin to the bottom edge of a `position: relative` host.
export const TopProgressBar = ({ visible }) => (
  <div
    className={`ui-progress-bar ${visible ? 'ui-progress-bar--visible' : ''}`}
    aria-hidden="true"
  >
    <div className="ui-progress-bar-track" />
  </div>
);
