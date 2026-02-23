import React from 'react';

export const Surface = ({ children, className = '', style, ...props }) => (
  <div className={`ui-surface ${className}`} style={style} {...props}>
    {children}
  </div>
);
