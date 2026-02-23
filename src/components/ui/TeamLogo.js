import React from 'react';

function logoRadius(size) {
  if (size <= 50)  return '8px';
  if (size <= 100) return '14px';
  if (size <= 160) return '20px';
  return '28px';
}

export const TeamLogo = ({ src, alt = '', size = 32, className = '', style }) => {
  const radius = logoRadius(size);
  const padding = Math.max(4, Math.round(size * 0.06));
  return (
    <img
      src={src}
      alt={alt}
      className={`ui-team-logo ${className}`}
      style={{ width: size, height: size, borderRadius: radius, padding, ...style }}
    />
  );
};
