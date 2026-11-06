// @ts-nocheck
import React, { useState } from 'react';
import { motion } from 'framer-motion';

export interface LightBulbButtonProps {
  title?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  buttonColor?: string;
  substrateColor?: string;
  textColor?: string;
  lightColor?: string;
  glareColor?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  width?: number | string;
  height?: number | string;
  icon?: React.ReactNode;
}

export function LightBulbButton({
  title,
  children,
  onClick,
  href,
  type = 'button',
  buttonColor = '#1c1c1f',
  substrateColor = '#000000',
  textColor = '#ffffff',
  lightColor = '#b3ff00',
  glareColor = '#ffffff',
  disabled = false,
  className = '',
  style,
  width,
  height = 48,
  icon,
}: LightBulbButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const label = children || title || 'Sign in';

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: typeof height === 'number' ? `${height}px` : height,
    width: width ? (typeof width === 'number' ? `${width}px` : width) : 'auto',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    textDecoration: 'none',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    ...style,
  };

  return (
    <motion.button
      type={type}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      onMouseDown={() => !disabled && setIsPressed(true)}
      onMouseUp={() => !disabled && setIsPressed(false)}
      style={containerStyle}
      className={`light-bulb-button-root ${className}`}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
    >
      {/* 3D Substrate / Base Background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          backgroundColor: substrateColor,
          zIndex: 0,
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
        }}
      />

      {/* Button Body that depresses when clicked */}
      <motion.div
        animate={{
          y: isPressed ? 3 : isHovered ? -1 : 0,
          boxShadow: isPressed
            ? '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)'
            : isHovered
            ? `0 10px 24px -4px rgba(0,0,0,0.45), 0 0 16px ${lightColor}40, inset 0 1px 1px rgba(255,255,255,0.2)`
            : '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.14)',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          minHeight: '100%',
          borderRadius: 999,
          backgroundColor: buttonColor,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '0 24px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Soft Glare light behind the button */}
        <motion.div
          animate={{
            opacity: isHovered ? 0.75 : 0.4,
            scale: isHovered ? 1.15 : 1,
          }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'absolute',
            top: -20,
            left: '20%',
            right: '20%',
            height: 34,
            borderRadius: 999,
            backgroundColor: glareColor,
            filter: 'blur(20px)',
            pointerEvents: 'none',
          }}
        />

        {/* LED Light Bulb dot */}
        <motion.span
          animate={{
            scale: isHovered ? [1, 1.35, 1.2] : 1,
            boxShadow: isHovered
              ? `0 0 14px 4px ${lightColor}, 0 0 4px ${lightColor}`
              : `0 0 6px 1px ${lightColor}80`,
          }}
          transition={{ duration: 0.25 }}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            backgroundColor: lightColor,
            flexShrink: 0,
            display: 'inline-block',
          }}
        />

        {/* Icon if provided */}
        {icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>}

        {/* Text Container */}
        <span
          style={{
            position: 'relative',
            fontSize: '14px',
            fontWeight: 600,
            color: textColor,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </motion.div>
    </motion.button>
  );
}

export default LightBulbButton;
