import React from 'react';

export const Spinner = ({ text }) => (
  <div className="ui-spinner-wrap">
    <div className="ui-spinner" />
    {text && <div className="ui-spinner-text">{text}</div>}
  </div>
);
