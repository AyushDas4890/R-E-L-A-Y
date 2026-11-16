import { useEffect, useState, useMemo } from 'react';
import { useRelayCtx } from '../ctx.ts';
import type { Appearance } from '../appearance.ts';
import { AppearanceSettings } from './Appearance.tsx';
import { Avatar } from './Avatar.tsx';
import { Icon } from './Icon.tsx';

export type SettingsTab = 'account' | 'profile' | 'appearance' | 'notifications' | 'keybinds';

const KEYBINDS: [string, string, string][] = [
  ['Navigation', 'Ctrl/⌘ + K', 'Open the quick search & command palette'],
  ['Navigation', 'Alt + ↑ / ↓', 'Navigate to previous or next channel'],
  ['Navigation', 'Alt + Shift + ↑ / ↓', 'Navigate to next unread channel'],
  ['Navigation', 'Ctrl/⌘ + Shift + K', 'Open direct messages view'],
  ['Navigation', 'Ctrl/⌘ + Shift + A', 'Open activity and mentions view'],
  ['Navigation', 'Ctrl/⌘ + \\', 'Toggle navigation sidebar'],
  ['Chat', 'Enter', 'Send message in composer (IME-safe)'],
  ['Chat', 'Shift + Enter', 'Insert line break in composer'],
  ['General', 'Esc', 'Close settings, modal, or side panel'],
  ['General', '?', 'Open keyboard shortcuts directory'],
];

const PRESETS = [
  { emoji: '🌴', text: 'On vacation' },
  { emoji: '💻', text: 'Working remotely' },
  { emoji: '🎯', text: 'Focusing' },
  { emoji: '☕', text: 'Grabbing coffee' },
  { emoji: '🤒', text: 'Out sick' },
];

interface Props {
  onClose: () => void;
  appearance: Appearance;
  onSignOut?: () => void;
  initialTab?: SettingsTab;
}

export function UserSettings({ onClose, appearance, onSignOut, initialTab = 'account' }: Props) {
  const { snap, send } = useRelayCtx();
  const me = snap.users[snap.me] ?? { name: 'User', title: '', color: '#5865F2', status: { emoji: '', text: '' } };

  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title);
  const [emoji, setEmoji] = useState(me.status?.emoji ?? '');
  const [text, setText] = useState(me.status?.text ?? '');
  const [emailPref, setEmailPref] = useState(snap.prefs?.email !== false);
  const [keybindQuery, setKeybindQuery] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Sync state if me changes
  useEffect(() => {
    setName(me.name);
    setTitle(me.title);
    setEmoji(me.status?.emoji ?? '');
    setText(me.status?.text ?? '');
    setEmailPref(snap.prefs?.email !== false);
  }, [me, snap.prefs?.email]);

  const hasChanges = useMemo(() => {
    return (
      name !== me.name ||
      title !== me.title ||
      emoji !== (me.status?.emoji ?? '') ||
      text !== (me.status?.text ?? '') ||
      emailPref !== (snap.prefs?.email !== false)
    );
  }, [name, title, emoji, text, emailPref, me, snap.prefs?.email]);

  const handleReset = () => {
    setName(me.name);
    setTitle(me.title);
    setEmoji(me.status?.emoji ?? '');
    setText(me.status?.text ?? '');
    setEmailPref(snap.prefs?.email !== false);
  };

  const handleSave = () => {
    send({ t: 'profile', name: name.trim() || me.name, title: title.trim(), status: { emoji, text: text.trim() } });
    if (me.email) {
      send({ t: 'setEmail', on: emailPref });
    }
  };

  // Keyboard navigation & Escape dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filteredKeybinds = useMemo(() => {
    const q = keybindQuery.trim().toLowerCase();
    if (!q) return KEYBINDS;
    return KEYBINDS.filter(([cat, keys, desc]) =>
      cat.toLowerCase().includes(q) || keys.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
    );
  }, [keybindQuery]);

  return (
    <div className="discord-settings-layer" role="dialog" aria-modal="true" aria-label="User Settings">
      {/* Settings Left Navigation Sidebar */}
      <aside className="discord-settings-sidebar-region">
        <nav className="discord-settings-sidebar" aria-label="Settings Categories">
          <div className="discord-settings-header">User Settings</div>
          <button
            type="button"
            className={`discord-settings-tab ${tab === 'account' ? 'active' : ''}`}
            onClick={() => setTab('account')}
          >
            <Icon n="user" size={18} />
            <span>My Account</span>
          </button>
          <button
            type="button"
            className={`discord-settings-tab ${tab === 'profile' ? 'active' : ''}`}
            onClick={() => setTab('profile')}
          >
            <Icon n="pencil" size={18} />
            <span>Profiles</span>
          </button>

          <div className="discord-settings-header">App Settings</div>
          <button
            type="button"
            className={`discord-settings-tab ${tab === 'appearance' ? 'active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            <Icon n="moon" size={18} />
            <span>Appearance</span>
          </button>
          <button
            type="button"
            className={`discord-settings-tab ${tab === 'notifications' ? 'active' : ''}`}
            onClick={() => setTab('notifications')}
          >
            <Icon n="bell" size={18} />
            <span>Notifications</span>
          </button>
          <button
            type="button"
            className={`discord-settings-tab ${tab === 'keybinds' ? 'active' : ''}`}
            onClick={() => setTab('keybinds')}
          >
            <Icon n="command" size={18} />
            <span>Keybinds</span>
          </button>

          <div className="discord-settings-sep" />

          {onSignOut && (
            <button
              type="button"
              className="discord-settings-tab logout"
              onClick={() => setConfirmLogout(true)}
            >
              <Icon n="logout" size={18} />
              <span>Log Out</span>
            </button>
          )}
        </nav>
      </aside>

      {/* Main Settings Content Region */}
      <main className="discord-settings-content-region">
        <div className="discord-settings-content-inner">
          {/* TAB 1: My Account */}
          {tab === 'account' && (
            <section className="discord-settings-section">
              <h2 className="discord-settings-title">My Account</h2>

              <div className="discord-account-card">
                <div className="discord-account-banner" style={{ background: `linear-gradient(135deg, ${me.color || '#5865F2'}, #111214)` }} />
                <div className="discord-account-header">
                  <div className="discord-account-avatar-wrap">
                    <Avatar user={me} size={80} />
                    <span className="discord-status-dot online" />
                  </div>
                  <button type="button" className="discord-btn-primary" onClick={() => setTab('profile')}>
                    Edit User Profile
                  </button>
                </div>

                <div className="discord-account-body">
                  <div className="discord-account-row">
                    <div>
                      <span className="discord-account-field-label">Display Name</span>
                      <div className="discord-account-field-value">{me.name}</div>
                    </div>
                    <button type="button" className="discord-btn-secondary" onClick={() => setTab('profile')}>Edit</button>
                  </div>

                  <div className="discord-account-row">
                    <div>
                      <span className="discord-account-field-label">Username / Handle</span>
                      <div className="discord-account-field-value">@{me.name.toLowerCase().replace(/\s+/g, '')}</div>
                    </div>
                  </div>

                  <div className="discord-account-row">
                    <div>
                      <span className="discord-account-field-label">Title / Role</span>
                      <div className="discord-account-field-value">{me.title || 'No title set'}</div>
                    </div>
                    <button type="button" className="discord-btn-secondary" onClick={() => setTab('profile')}>Edit</button>
                  </div>

                  {me.email && (
                    <div className="discord-account-row">
                      <div>
                        <span className="discord-account-field-label">Email</span>
                        <div className="discord-account-field-value">{me.email}</div>
                      </div>
                    </div>
                  )}

                  {me.status?.text && (
                    <div className="discord-account-row">
                      <div>
                        <span className="discord-account-field-label">Current Status</span>
                        <div className="discord-account-field-value">{me.status.emoji} {me.status.text}</div>
                      </div>
                      <button type="button" className="discord-btn-secondary" onClick={() => setTab('profile')}>Edit</button>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* TAB 2: Profiles */}
          {tab === 'profile' && (
            <section className="discord-settings-section">
              <h2 className="discord-settings-title">User Profile</h2>
              <p className="discord-settings-subtitle">Manage how you appear to others across Relay.</p>

              <div className="discord-form-grid">
                <div className="discord-form-col">
                  <label className="discord-field">
                    <span className="discord-field-label">Display Name</span>
                    <input
                      className="discord-input"
                      value={name}
                      maxLength={40}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your display name"
                    />
                  </label>

                  <label className="discord-field">
                    <span className="discord-field-label">Title / Role</span>
                    <input
                      className="discord-input"
                      value={title}
                      maxLength={60}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Senior Frontend Engineer"
                    />
                  </label>

                  <div className="discord-field">
                    <span className="discord-field-label">Custom Status</span>
                    <div className="discord-status-inputs">
                      <input
                        className="discord-input emoji-input"
                        value={emoji}
                        maxLength={4}
                        onChange={(e) => setEmoji(e.target.value)}
                        placeholder="🌴"
                        title="Status emoji"
                      />
                      <input
                        className="discord-input status-text-input"
                        value={text}
                        maxLength={80}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="What's on your mind?"
                      />
                    </div>
                    <div className="discord-status-presets">
                      {PRESETS.map((p) => (
                        <button
                          key={p.text}
                          type="button"
                          className="discord-preset-pill"
                          onClick={() => { setEmoji(p.emoji); setText(p.text); }}
                        >
                          <span>{p.emoji}</span>
                          <span>{p.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Live Preview Card */}
                <div className="discord-preview-col">
                  <div className="discord-field-label">Preview</div>
                  <div className="discord-profile-preview-card">
                    <div className="discord-preview-banner" style={{ background: `linear-gradient(135deg, ${me.color || '#5865F2'}, #111214)` }} />
                    <div className="discord-preview-avatar-row">
                      <Avatar user={me} size={64} />
                      <span className="discord-status-dot online" />
                    </div>
                    <div className="discord-preview-details">
                      <div className="discord-preview-name">{name || me.name}</div>
                      <div className="discord-preview-handle">@{name ? name.toLowerCase().replace(/\s+/g, '') : me.name.toLowerCase().replace(/\s+/g, '')}</div>
                      {title && <div className="discord-preview-title">{title}</div>}
                      {(emoji || text) && (
                        <div className="discord-preview-status">
                          <span>{emoji}</span>
                          <span>{text}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* TAB 3: Appearance */}
          {tab === 'appearance' && (
            <section className="discord-settings-section">
              <h2 className="discord-settings-title">Appearance</h2>
              <p className="discord-settings-subtitle">Customize your theme, colors, density, and custom backgrounds.</p>
              <AppearanceSettings a={appearance} />
            </section>
          )}

          {/* TAB 4: Notifications */}
          {tab === 'notifications' && (
            <section className="discord-settings-section">
              <h2 className="discord-settings-title">Notifications</h2>
              <p className="discord-settings-subtitle">Configure email and desktop alerts for messages and mentions.</p>

              <div className="discord-card-group">
                <div className="discord-setting-row">
                  <div>
                    <div className="discord-setting-label">Email Notifications</div>
                    <div className="discord-setting-desc">
                      Send email notifications about mentions and direct messages when you are away from Relay.
                    </div>
                  </div>
                  <label className="discord-switch">
                    <input
                      type="checkbox"
                      checked={emailPref}
                      onChange={(e) => setEmailPref(e.target.checked)}
                    />
                    <span className="discord-slider" />
                  </label>
                </div>

                {typeof window !== 'undefined' && 'Notification' in window && (
                  <div className="discord-setting-row">
                    <div>
                      <div className="discord-setting-label">Desktop Notifications</div>
                      <div className="discord-setting-desc">
                        Current system permission: <strong style={{ textTransform: 'capitalize' }}>{Notification.permission}</strong>.
                      </div>
                    </div>
                    {Notification.permission === 'default' && (
                      <button
                        type="button"
                        className="discord-btn-secondary"
                        onClick={() => void Notification.requestPermission()}
                      >
                        Enable Notifications
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 5: Keybinds */}
          {tab === 'keybinds' && (
            <section className="discord-settings-section">
              <h2 className="discord-settings-title">Keyboard Shortcuts</h2>
              <p className="discord-settings-subtitle">Quick hotkeys for fast navigation, composer actions, and controls.</p>

              <div className="discord-search-box">
                <Icon n="search" size={16} />
                <input
                  type="text"
                  placeholder="Search shortcuts..."
                  value={keybindQuery}
                  onChange={(e) => setKeybindQuery(e.target.value)}
                />
              </div>

              <div className="discord-keybind-list">
                {filteredKeybinds.map(([category, keys, description]) => (
                  <div key={keys} className="discord-keybind-row">
                    <div className="discord-keybind-info">
                      <span className="discord-keybind-desc">{description}</span>
                      <span className="discord-keybind-cat">{category}</span>
                    </div>
                    <kbd className="discord-kbd">{keys}</kbd>
                  </div>
                ))}
                {filteredKeybinds.length === 0 && (
                  <div className="discord-empty-msg">No shortcuts found for "{keybindQuery}"</div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Discord Floating Close Button */}
        <div className="discord-esc-wrap">
          <button type="button" className="discord-esc-btn" onClick={onClose} title="Close (Esc)" aria-label="Close settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <span className="discord-esc-text">ESC</span>
        </div>

        {/* Discord Floating Save Bar */}
        {hasChanges && (
          <div className="discord-save-bar" role="status">
            <span className="discord-save-text">Careful — you have unsaved changes!</span>
            <div className="discord-save-actions">
              <button type="button" className="discord-save-reset" onClick={handleReset}>Reset</button>
              <button type="button" className="discord-save-confirm" onClick={handleSave}>Save Changes</button>
            </div>
          </div>
        )}

        {/* Logout Confirmation Dialog */}
        {confirmLogout && (
          <div className="discord-confirm-scrim" onClick={() => setConfirmLogout(false)}>
            <div className="discord-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Log Out</h3>
              <p>Are you sure you want to log out of Relay?</p>
              <div className="discord-confirm-actions">
                <button type="button" className="discord-btn-secondary" onClick={() => setConfirmLogout(false)}>Cancel</button>
                <button type="button" className="discord-btn-danger" onClick={() => { setConfirmLogout(false); onSignOut?.(); }}>Log Out</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
