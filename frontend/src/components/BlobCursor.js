import React, { useEffect, useRef } from 'react';

const BlobCursor = () => {
  const blobRef = useRef(null);
  const fillRef = useRef(null);

  useEffect(() => {
    const blob = blobRef.current;
    const fill = fillRef.current;
    if (!blob || !fill) return;

    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;
    const speed = 0.15;

    const handleMouseMove = (e) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const animate = () => {
      x += (targetX - x) * speed;
      y += (targetY - y) * speed;

      blob.style.left = `${x}px`;
      blob.style.top = `${y}px`;
      fill.style.left = `${x}px`;
      fill.style.top = `${y}px`;

      requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <>
      <div
        ref={blobRef}
        style={{
          position: 'fixed',
          width: '40px',
          height: '40px',
          backgroundColor: 'rgba(167, 139, 250, 0.3)',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          transition: 'width 0.2s, height 0.2s',
          zIndex: 9999,
          filter: 'blur(8px)',
        }}
      />
      <div
        ref={fillRef}
        style={{
          position: 'fixed',
          width: '8px',
          height: '8px',
          backgroundColor: '#a78bfa',
          borderRadius: '50%',
          pointerEvents: 'none',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000,
        }}
      />
    </>
  );
};

export default BlobCursor;
