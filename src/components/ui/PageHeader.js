import React from 'react';

export const PageHeader = ({ title, subtitle, left, right }) => (
  <div className="ui-page-header">
    {left ?? <div className="ui-page-header-spacer" />}
    <div className="ui-page-header-title">
      <div className="ui-page-header-main">{title}</div>
      {subtitle && <div className="ui-page-header-sub">{subtitle}</div>}
    </div>
    {right ?? <div className="ui-page-header-spacer" />}
  </div>
);
