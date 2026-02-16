import React, { useRef, useEffect } from 'react';

const DotGridBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const dots = [];
    const rows = Math.ceil(canvas.height / 30);
    const cols = Math.ceil(canvas.width / 30);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        dots.push({
          x: col * 30,
          y: row * 30,
          size: 3,
          targetSize: 3,
        });
      }
    }

    let mouseX = -9999;
    let mouseY = -9999;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      dots.forEach((dot) => {
        const dx = mouseX - dot.x;
        const dy = mouseY - dot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 150) {
          const force = (150 - distance) / 150;
          dot.targetSize = 3 + force * 8;
        } else {
          dot.targetSize = 3;
        }

        dot.size += (dot.targetSize - dot.size) * 0.1;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        ctx.fillStyle = '#a78bfa';
        ctx.globalAlpha = distance < 150 ? 0.8 : 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};

export default DotGridBackground;
