import React, { useState } from 'react';

export function RouteReplay({ vehicleId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const [progress, setProgress] = useState(0);

  return (
    <div className="replay-bar">
      <button className="map-btn" onClick={() => setIsPlaying(!isPlaying)}>
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <input
        type="range"
        className="scrubber"
        min="0"
        max="100"
        value={progress}
        onChange={(e) => setProgress(e.target.value)}
      />
      <select className="select-filter" style={{ width: '80px' }} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
        <option value={10}>10x</option>
      </select>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>10:45:00 AM</span>
    </div>
  );
}
