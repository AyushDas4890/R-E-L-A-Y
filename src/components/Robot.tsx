// The Relay mascot, drawn in CSS (styles in nexus.css). Layers are split so GSAP tweens never fight:
// .nx-bot = entrance, .nx-bot-scroll = scroll parallax, .nx-bot-inner = idle float,
// .nx-bot-head = look-at rotation, .nx-face = eye/mouth offset.
export function Robot({ mood = 'happy' }: { mood?: 'happy' | 'focus' | 'sad' }) {
  return (
    <div className={`nx-bot mood-${mood}`} aria-hidden>
      <div className="nx-bot-scroll">
        <div className="nx-bot-inner">
          <div className="nx-bot-head">
            <span className="nx-ear l" /><span className="nx-ear r" />
            <div className="nx-screen">
              <span className="nx-glow" />
              <div className="nx-face">
                <i className="nx-eye l" /><i className="nx-eye r" />
                <i className="nx-mouth" />
              </div>
              <span className="nx-shine" />
            </div>
          </div>
          <div className="nx-bot-body">
            <span className="nx-arm l" /><span className="nx-arm r" />
            <div className="nx-chest"><span /><span /><span /></div>
          </div>
          <span className="nx-bot-shadow" />
        </div>
      </div>
    </div>
  );
}
