import { ImageResponse } from 'next/og';

export const alt = 'JMILL Memory Palace 2026';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  const rooms = [
    ['#7ff7ff', 125, 118, 88],
    ['#b9ff72', 960, 105, 70],
    ['#ff79ca', 1010, 420, 82],
    ['#8aa8ff', 710, 495, 64],
    ['#ffac61', 150, 435, 76],
    ['#ffe66d', 330, 180, 58],
  ];

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        background: '#05070a',
        color: '#ecfff8',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 42,
          border: '1px solid rgba(127,247,255,.32)',
          display: 'flex',
        }}
      />
      {rooms.map(([color, left, top, diameter], index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left,
            top,
            width: diameter,
            height: diameter,
            border: `2px solid ${color}`,
            borderRadius: index % 2 ? 12 : 999,
            transform: `rotate(${index * 17}deg)`,
            boxShadow: `0 0 28px ${color}55`,
            display: 'flex',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          border: '1px solid rgba(127,247,255,.28)',
          borderRadius: 999,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 390,
          height: 130,
          borderTop: '1px solid rgba(127,247,255,.24)',
          borderBottom: '1px solid rgba(127,247,255,.24)',
          transform: 'rotate(-18deg)',
          display: 'flex',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ fontSize: 22, letterSpacing: 12, color: '#7ff7ff' }}>MEMORY SYSTEM</div>
        <div style={{ fontSize: 112, letterSpacing: 16, lineHeight: 1, marginTop: 18 }}>JMILL</div>
        <div style={{ fontSize: 25, letterSpacing: 9, color: '#b9ff72', marginTop: 24 }}>EST. 2026</div>
      </div>
    </div>,
    size
  );
}
