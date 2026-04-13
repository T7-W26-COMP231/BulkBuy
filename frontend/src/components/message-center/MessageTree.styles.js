// src/components/MessageTree/MessageTree.styles.js
import { css } from "@emotion/react";

/**
 * MessageTree.styles.js
 *
 * Centralized design tokens and small shared style fragments used by
 * MessageTree components.
 *
 * Exports:
 *  - default: theme object
 *  - named: containerStyles (Emotion css fragment)
 *  - named: utilities (helper fragments)
 *  - named: focusOutline (css fragment)
 *  - named: responsiveFragments (small responsive helpers)
 */

/* Design tokens */
const theme = {
  spacing: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  radii: {
    sm: 6,
    md: 8,
    lg: 10,
  },

  breakpoints: {
    narrow: 640,
    medium: 900,
  },

  /* Color palette (light theme, high contrast) */
  colors: {
    /* surfaces */
    surface: "#FFFFFF",
    surfaceHover: "#F6F8FA",
    surfaceMuted: "#FBFCFD",
    detailBg: "#FBFDFF",

    /* text */
    onSurface: "#0F1724",
    muted: "#6B7280",
    onPrimary: "#FFFFFF",

    /* accents */
    primary: "#0adbc6",
    focus: "#7CC3FF",

    /* borders / inputs */
    border: "#E6E9EE",
    inputBg: "#FFFFFF",

    /* avatar / pills */
    avatarBg: "#E6F0FF",
    onAvatar: "#0B4F9C",
    pillBg: "#F1F5F9",
    onPill: "#0F1724",

    /* reply / subtle backgrounds */
    replyBg: "#FFFFFF",
    replyHighlight: "#F0FBFF",

    /* badge */
    badgeBg: "#F3F4F6",
    onBadge: "#111827",

    /* unread indicator */
    unread: "#FF6B6B",

    /* error */
    error: "#D14343",
  },

  /* Type-specific colors for badges and subtle avatar backgrounds */
  typeColors: {
    issue_wall: "#FFB020",
    email: "#7C3AED",
    notification: "#59f790",
    order: "#0B74FF",
    review: "#F97316",
  },

  avatarBgForType: {
    issue_wall: "#FFF7ED",
    email: "#F5F3FF",
    notification: "#E6F0FF",
    order: "#ECFDF5",
    review: "#FFF7ED",
  },

  /* small layout tokens */
  zIndex: {
    connector: 0,
    card: 1,
  },
};

/* Shared container styles used by the root wrapper to ensure consistent padding and max width */
export const containerStyles = css`
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: ${theme.spacing.lg}px;
  box-sizing: border-box;
  background: transparent;

  @media (max-width: ${theme.breakpoints.narrow}px) {
    padding: ${theme.spacing.md}px;
  }
`;

/* Utilities and small fragments */
export const utilities = {
  ellipsis: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  subtleShadow: css`
    box-shadow: 0 1px 4px rgba(12, 18, 28, 0.04);
  `,
  halfTabIndent: (level = 1) => css`
    margin-left: ${16 * level}px;
  `,
  connector: (left = 0, top = 0, bottom = 0) => css`
    position: absolute;
    left: ${left}px;
    top: ${top}px;
    bottom: ${bottom}px;
    width: 1px;
    background: ${theme.colors.border};
    opacity: 0.95;
    pointer-events: none;
  `,
};

/* Small helper for consistent focus outlines */
export const focusOutline = css`
  &:focus {
    outline: 3px solid ${theme.colors.focus};
    outline-offset: 2px;
  }
`;

/* Small responsive fragments used by components */
export const responsiveFragments = {
  listPadding: css`
    @media (max-width: ${theme.breakpoints.narrow}px) {
      padding: ${theme.spacing.sm}px;
    }
  `,
  compactAvatar: css`
    @media (max-width: ${theme.breakpoints.narrow}px) {
      width: 40px;
      height: 40px;
    }
  `,
};

export default theme;
