import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, type IconName } from './Icon.tsx';

export interface DiagramNode {
  id: string;
  title: string;
  desc: string;
  icon: IconName;
  tag: string;
  detail: string;
  metricLabel: string;
  metricValue: string;
}

interface Props {
  category: 'huddles' | 'workflows' | 'search' | 'overview';
  title: string;
  subtitle: string;
  nodes: { icon: IconName; title: string; text: string }[];
}

const META_BY_CATEGORY: Record<string, { hubTitle: string; hubSub: string; hubIcon: IconName; badge: string }> = {
  huddles: {
    hubTitle: 'Huddle Core',
    hubSub: 'WebRTC P2P Mesh',
    hubIcon: 'headphones',
    badge: '6 PEER CHANNELS LIVE',
  },
  workflows: {
    hubTitle: 'Workflow Engine',
    hubSub: 'Event Dispatch Bus',
    hubIcon: 'zap',
    badge: 'REACTOR ACTIVE',
  },
  search: {
    hubTitle: 'Search Neural Hub',
    hubSub: 'Full-Text Inverted Index',
    hubIcon: 'search',
    badge: '<3ms VECTOR QUERY',
  },
  overview: {
    hubTitle: 'Relay Workspace',
    hubSub: 'Unified Protocol',
    hubIcon: 'gem',
    badge: 'ALL UNLOCKED',
  },
};

export function InteractiveNodeDiagram({ category, title, subtitle, nodes }: Props) {
  const [activeNodeIndex, setActiveNodeIndex] = useState<number>(0);
  const [simRunning, setSimRunning] = useState(false);
  const [packetCount, setPacketCount] = useState(128);
  const [viewMode, setViewMode] = useState<'diagram' | 'grid'>('diagram');
  const filterId = useId();

  const meta = META_BY_CATEGORY[category] || META_BY_CATEGORY.huddles;
  const activeNode = nodes[activeNodeIndex] || nodes[0];

  const triggerSim = () => {
    setSimRunning(true);
    setPacketCount((p) => p + Math.floor(Math.random() * 24 + 10));
    setTimeout(() => setSimRunning(false), 1200);
  };

  // Node telemetry enhancements for rich simulation
  const getNodeTag = (index: number) => {
    if (category === 'huddles') {
      return ['P2P Mesh', 'Opus 48kHz', '60 FPS', 'Instant', 'Real-time', 'Auto-AI'][index] || 'Active';
    }
    if (category === 'workflows') {
      return ['Trigger', 'Cron 9:30', 'Sev1 Escalate', 'Action Hook', 'Log Sync', 'Queue'][index] || 'Active';
    }
    return ['Global Key', 'Typeahead', 'No Cap', 'Semantic AI', 'Starred', 'Fast-access'][index] || 'Index';
  };

  const getNodeMetric = (index: number) => {
    if (category === 'huddles') {
      return ['6/6 slots', '12ms latency', '1080p stream', '0.0ms delay', 'Parallel bus', '30s trigger'][index] || '100%';
    }
    if (category === 'workflows') {
      return ['100% fired', 'Mon-Fri', 'Zero drop', 'IT branch', '+42 wins', 'In-memory'][index] || 'Real-time';
    }
    return ['⌘K / Ctrl+K', 'All users', '∞ history', 'High rank', '1-click', 'Pinned'][index] || 'Live';
  };

  return (
    <div className="node-diagram-container" style={{ margin: '48px auto 0', maxWidth: 1120, width: '100%', position: 'relative' }}>
      {/* Background glowing violet aura */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          width: '600px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(124, 58, 237, 0.16) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 75%)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
          zIndex: 0,
        }}
      />

      {/* Control header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 24px',
          borderRadius: '20px 20px 0 0',
          background: 'rgba(22, 17, 36, 0.85)',
          border: '1px solid rgba(124, 58, 237, 0.25)',
          borderBottom: 'none',
          backdropFilter: 'blur(16px)',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#a855f7',
              boxShadow: '0 0 12px #a855f7, 0 0 20px rgba(168, 85, 247, 0.6)',
              animation: 'pulse 2s infinite',
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: '#c4b5fd', textTransform: 'uppercase' }}>
            Interactive Node Topology // {meta.badge}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={triggerSim}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              background: simRunning ? '#7c3aed' : 'rgba(124, 58, 237, 0.2)',
              border: '1px solid rgba(124, 58, 237, 0.4)',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            <Icon n="zap" size={12} />
            {simRunning ? 'Emitting Packet...' : 'Simulate Pulse'}
          </button>

          <div style={{ display: 'inline-flex', borderRadius: 999, background: 'rgba(0,0,0,0.3)', padding: 2, border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => setViewMode('diagram')}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                background: viewMode === 'diagram' ? '#7c3aed' : 'transparent',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Graph View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                background: viewMode === 'grid' ? '#7c3aed' : 'transparent',
                color: '#fff',
                fontSize: 12,
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(180deg, rgba(16, 12, 28, 0.95) 0%, rgba(10, 8, 18, 0.98) 100%)',
          border: '1px solid rgba(124, 58, 237, 0.25)',
          borderRadius: '0 0 24px 24px',
          overflow: 'hidden',
          padding: '36px 24px 44px',
          zIndex: 1,
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Subtle SVG Grid background */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`grid-${filterId}`} width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(168, 85, 247, 0.4)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${filterId})`} />
        </svg>

        {viewMode === 'diagram' ? (
          <div>
            {/* SVG Interactive Connection Lines */}
            <div style={{ position: 'relative', width: '100%', minHeight: 460 }}>
              {/* Central Processor Node */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {/* Pulsing orbital rings */}
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.1, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute',
                    width: 170,
                    height: 170,
                    borderRadius: '50%',
                    border: '1px dashed rgba(168, 85, 247, 0.4)',
                    pointerEvents: 'none',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
                  style={{
                    position: 'absolute',
                    width: 140,
                    height: 140,
                    borderRadius: '50%',
                    borderTop: '2px solid rgba(168, 85, 247, 0.8)',
                    borderRight: '1px solid transparent',
                    borderBottom: '2px solid rgba(124, 58, 237, 0.3)',
                    borderLeft: '1px solid transparent',
                    pointerEvents: 'none',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />

                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 35% 35%, #9333ea 0%, #6b21a8 50%, #3b0764 100%)',
                    boxShadow: '0 0 40px rgba(147, 51, 234, 0.6), inset 0 1px 2px rgba(255,255,255,0.4)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                  onClick={triggerSim}
                  title="Click to pulse network"
                >
                  <Icon n={meta.hubIcon} size={30} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f5f3ff', marginTop: 4, letterSpacing: '0.04em' }}>
                    HUB
                  </span>
                </div>

                <div style={{ textAlign: 'center', marginTop: 10 }}>
                  <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>{meta.hubTitle}</div>
                  <div style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 500 }}>{meta.hubSub}</div>
                </div>
              </div>

              {/* 6 Peripheral Interconnected Nodes in a responsive grid layout around hub */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 20,
                  position: 'relative',
                  zIndex: 5,
                }}
              >
                {nodes.map((node, i) => {
                  const isActive = activeNodeIndex === i;
                  return (
                    <motion.div
                      key={node.title}
                      whileHover={{ scale: 1.02, y: -4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setActiveNodeIndex(i)}
                      style={{
                        padding: '18px 20px',
                        borderRadius: 18,
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.28) 0%, rgba(46, 16, 101, 0.45) 100%)'
                          : 'rgba(28, 22, 44, 0.65)',
                        border: isActive ? '1px solid #a855f7' : '1px solid rgba(124, 58, 237, 0.2)',
                        boxShadow: isActive
                          ? '0 12px 30px rgba(124, 58, 237, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                          : '0 4px 16px rgba(0, 0, 0, 0.2)',
                        cursor: 'pointer',
                        backdropFilter: 'blur(10px)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Active glowing indicator light */}
                      {isActive && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: 3,
                            height: '100%',
                            background: '#c084fc',
                            boxShadow: '0 0 12px #c084fc',
                          }}
                        />
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            background: isActive ? '#7c3aed' : 'rgba(124, 58, 237, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isActive ? '#ffffff' : '#c4b5fd',
                            border: '1px solid rgba(124, 58, 237, 0.3)',
                          }}
                        >
                          <Icon n={node.icon} size={18} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: isActive ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                              color: isActive ? '#f5f3ff' : '#a78bfa',
                              border: '1px solid rgba(168, 85, 247, 0.25)',
                            }}
                          >
                            {getNodeTag(i)}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: '#ddd6fe',
                              opacity: 0.8,
                            }}
                          >
                            {getNodeMetric(i)}
                          </span>
                        </div>
                      </div>

                      <h3
                        style={{
                          margin: '0 0 6px',
                          fontSize: 16,
                          fontWeight: 600,
                          color: '#ffffff',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {node.title}
                      </h3>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13.5,
                          lineHeight: 1.45,
                          color: 'rgba(226, 219, 243, 0.75)',
                        }}
                      >
                        {node.text}
                      </p>

                      {/* Interactive audio/stream wave animation if huddles */}
                      {isActive && category === 'huddles' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 12, height: 16 }}>
                          {[6, 12, 16, 9, 14, 11, 7, 15, 10, 8].map((h, hi) => (
                            <motion.span
                              key={hi}
                              animate={{ height: [h * 0.4, h, h * 0.4] }}
                              transition={{ duration: 0.6 + hi * 0.05, repeat: Infinity, ease: 'easeInOut' }}
                              style={{ width: 3, borderRadius: 2, background: '#c084fc', display: 'inline-block' }}
                            />
                          ))}
                          <span style={{ fontSize: 10.5, color: '#c4b5fd', marginLeft: 8, fontWeight: 500 }}>Live Audio Bitstream</span>
                        </div>
                      )}

                      {/* Interactive workflow step animation if workflows */}
                      {isActive && category === 'workflows' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                          <span style={{ fontSize: 10.5, color: '#34d399', fontWeight: 600 }}>● Condition Met</span>
                          <span style={{ fontSize: 10, color: '#a78bfa' }}>→ Dispatching to #general</span>
                        </div>
                      )}

                      {/* Interactive search speed index if search */}
                      {isActive && category === 'search' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                          <span style={{ fontSize: 10.5, color: '#c4b5fd', fontWeight: 600 }}>Response Time: 1.8ms</span>
                          <span style={{ fontSize: 10, color: '#a78bfa' }}>(Ranked 100% confidence)</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Inspector Panel for Selected Node */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeNode.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                style={{
                  marginTop: 28,
                  padding: '20px 24px',
                  borderRadius: 18,
                  background: 'rgba(25, 18, 42, 0.85)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: '#7c3aed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      boxShadow: '0 4px 16px rgba(124, 58, 237, 0.5)',
                    }}
                  >
                    <Icon n={activeNode.icon} size={22} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{activeNode.title}</span>
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: 'rgba(124,58,237,0.3)', color: '#c4b5fd' }}>
                        Selected Node
                      </span>
                    </div>
                    <div style={{ color: 'rgba(235, 230, 250, 0.8)', fontSize: 13, marginTop: 2 }}>{activeNode.text}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telemetry Packets</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{packetCount} RX/TX</div>
                  </div>
                  <button
                    type="button"
                    onClick={triggerSim}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 12,
                      background: '#7c3aed',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
                    }}
                  >
                    Inspect Node
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          /* Grid view */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {nodes.map((node, i) => (
              <div
                key={node.title}
                style={{
                  padding: '22px 24px',
                  borderRadius: 18,
                  background: 'rgba(28, 22, 44, 0.75)',
                  border: '1px solid rgba(124, 58, 237, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: 'rgba(124, 58, 237, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#c4b5fd',
                    }}
                  >
                    <Icon n={node.icon} size={18} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>{node.title}</h3>
                </div>
                <p style={{ margin: 0, color: 'rgba(226, 219, 243, 0.75)', fontSize: 14, lineHeight: 1.5 }}>{node.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

