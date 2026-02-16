import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';

const DotGrid = ({
  dotSize = 4,
  gap = 30,
  baseColor = '#a78bfa',
  activeColor = '#c4b5fd',
  proximity = 120,
  shockRadius = 200,
  shockStrength = 4,
  resistance = 500,
  returnDuration = 1.2,
}) => {
  const canvasRef = useRef(null);
  const dotsRef = useRef([]);
  const mouseRef = useRef({ x: -9999, y: -9999, lastX: -9999, lastY: -9999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initDots();
    };

    const initDots = () => {
      dotsRef.current = [];
      const rows = Math.ceil(canvas.height / gap);
      const cols = Math.ceil(canvas.width / gap);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dotsRef.current.push({
            x: col * gap,
            y: row * gap,
            originalX: col * gap,
            originalY: row * gap,
            size: dotSize,
            targetSize: dotSize,
            vx: 0,
            vy: 0,
          });
        }
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const handleMouseMove = (e) => {
      mouseRef.current.lastX = mouseRef.current.x;
      mouseRef.current.lastY = mouseRef.current.y;
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleClick = (e) => {
      const clickX = e.clientX;
      const clickY = e.clientY;

      dotsRef.current.forEach((dot) => {
        const dx = clickX - dot.x;
        const dy = clickY - dot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < shockRadius) {
          const force = (1 - distance / shockRadius) * shockStrength;
          const angle = Math.atan2(dy, dx);
          
          gsap.to(dot, {
            x: dot.x - Math.cos(angle) * force * 10,
            y: dot.y - Math.sin(angle) * force * 10,
            duration: 0.3,
            ease: 'power2.out',
          });

          gsap.to(dot, {
            x: dot.originalX,
            y: dot.originalY,
            duration: returnDuration,
            delay: 0.3,
            ease: 'elastic.out(1, 0.3)',
          });
        }
      });
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mouseX = mouseRef.current.x;
      const mouseY = mouseRef.current.y;

      dotsRef.current.forEach((dot) => {
        const dx = mouseX - dot.x;
        const dy = mouseY - dot.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < proximity) {
          const force = (1 - distance / proximity);
          dot.targetSize = dotSize + force * 6;
          
          const pushX = (dot.x - mouseX) * force * 0.5;
          const pushY = (dot.y - mouseY) * force * 0.5;
          
          dot.vx += pushX / resistance;
          dot.vy += pushY / resistance;
        } else {
          dot.targetSize = dotSize;
        }

        dot.vx *= 0.95;
        dot.vy *= 0.95;

        if (Math.abs(dot.vx) > 0.01 || Math.abs(dot.vy) > 0.01) {
          dot.x += dot.vx;
          dot.y += dot.vy;
        }

        const returnForce = 0.05;
        dot.x += (dot.originalX - dot.x) * returnForce;
        dot.y += (dot.originalY - dot.y) * returnForce;

        dot.size += (dot.targetSize - dot.size) * 0.15;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        
        const color = distance < proximity ? activeColor : baseColor;
        const alpha = distance < proximity ? 0.8 : 0.5;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      cancelAnimationFrame(animationId);
    };
  }, [dotSize, gap, baseColor, activeColor, proximity, shockRadius, shockStrength, resistance, returnDuration]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
        pointerEvents: 'none'
      }}
    />
  );
};

export default DotGrid;
