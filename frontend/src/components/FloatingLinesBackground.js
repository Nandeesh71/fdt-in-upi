import React from 'react';
import './FloatingLinesBackground.css';

const FloatingLinesBackground = () => {
  return (
    <div className="floating-lines-bg" aria-hidden="true">
      <div className="floating-lines-bg__base" />
      <div className="floating-lines-bg__waves">
        <span className="floating-lines-bg__wave floating-lines-bg__wave--one" />
        <span className="floating-lines-bg__wave floating-lines-bg__wave--two" />
        <span className="floating-lines-bg__wave floating-lines-bg__wave--three" />
      </div>
      <div className="floating-lines-bg__glow floating-lines-bg__glow--one" />
      <div className="floating-lines-bg__glow floating-lines-bg__glow--two" />
      <div className="floating-lines-bg__glow floating-lines-bg__glow--three" />
      <div className="floating-lines-bg__grid" />
      <div className="floating-lines-bg__lines">
        {Array.from({ length: 14 }).map((_, index) => (
          <span className="floating-lines-bg__line" key={`line-${index}`} />
        ))}
      </div>
      <div className="floating-lines-bg__vignette" />
    </div>
  );
};

export default FloatingLinesBackground;
