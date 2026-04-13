// src/components/MessageTree/EmptyState.jsx
import React from 'react';
import PropTypes from 'prop-types';
import styled from '@emotion/styled';
import theme from './MessageTree.styles';

/**
 * EmptyState
 *
 * Centered, graceful empty state shown when there are no messages.
 * - Shows a subtle illustration area, headline, supporting copy, and optional CTA to create a message.
 * - Fully accessible and responsive.
 */

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.lg}px;
  width: 100%;
  box-sizing: border-box;
`;

const Card = styled.div`
  width: 100%;
  max-width: 720px;
  background: ${theme.colors.surface};
  border-radius: ${theme.radii.md}px;
  padding: ${theme.spacing.lg}px;
  box-shadow: 0 6px 18px rgba(12, 18, 28, 0.06);
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  box-sizing: border-box;

  @media (max-width: ${theme.breakpoints.narrow}px) {
    padding: ${theme.spacing.md}px;
    gap: 12px;
  }
`;

const Visual = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 12px;
  background: linear-gradient(180deg, ${theme.colors.surfaceMuted}, ${theme.colors.detailBg});
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 120px;
  box-shadow: inset 0 -6px 18px rgba(11, 116, 255, 0.03);
  @media (max-width: ${theme.breakpoints.narrow}px) {
    width: 88px;
    height: 88px;
    flex: 0 0 88px;
  }
`;

/* Simple SVG placeholder icon (keeps file self-contained) */
const Icon = () => (
  <svg
    width="64"
    height="64"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="2" y="4" width="20" height="14" rx="2" fill="#E6F0FF" />
    <path d="M4 8h16" stroke="#0B74FF" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="8" cy="11" r="1.2" fill="#0B4F9C" />
    <circle cx="12" cy="11" r="1.2" fill="#0B4F9C" />
    <circle cx="16" cy="11" r="1.2" fill="#0B4F9C" />
  </svg>
);

const Content = styled.div`
  flex: 1 1 360px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 18px;
  color: ${theme.colors.onSurface};
  font-weight: 700;
`;

const Description = styled.p`
  margin: 0;
  color: ${theme.colors.muted};
  font-size: 14px;
  line-height: 1.4;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 0 0 auto;
  margin-left: auto;

  @media (max-width: ${theme.breakpoints.narrow}px) {
    width: 100%;
    justify-content: flex-start;
    margin-left: 0;
  }
`;

const PrimaryButton = styled.button`
  background: ${theme.colors.primary};
  color: ${theme.colors.onPrimary};
  border: none;
  padding: 10px 14px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 12px rgba(11, 116, 255, 0.12);
  &:disabled { opacity: 0.6; cursor: not-allowed; }
  &:focus { outline: 3px solid ${theme.colors.focus}; }
`;

const SecondaryButton = styled.button`
  background: ${theme.colors.surface};
  color: ${theme.colors.onSurface};
  border: 1px solid ${theme.colors.border};
  padding: 10px 12px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  &:focus { outline: 3px solid ${theme.colors.focus}; }
`;

/* Small helper text under CTA */
const Helper = styled.div`
  margin-top: 6px;
  color: ${theme.colors.muted};
  font-size: 12px;
`;

/* Main component */
export default function EmptyState({ canCreate = false, onCreateClick = null, onBrowse = null }) {
  return (
    <Wrapper>
      <Card role="status" aria-live="polite" aria-label="No messages">
        <Visual aria-hidden="true">
          <Icon />
        </Visual>

        <Content>
          <Title>No messages yet</Title>
          <Description>
            There are no messages to show in this view. Messages you create or receive will appear here.
          </Description>

          {canCreate ? (
            <Helper>Use the button to compose a new message for individuals, regions, or system-wide.</Helper>
          ) : (
            <Helper>Check back later or contact an administrator to create messages.</Helper>
          )}
        </Content>

        <Actions>
          {canCreate && (
            <PrimaryButton
              type="button"
              onClick={() => {
                if (typeof onCreateClick === 'function') onCreateClick();
              }}
              aria-label="Create a new message"
            >
              Create message
            </PrimaryButton>
          )}

          <SecondaryButton
            type="button"
            onClick={() => {
              if (typeof onBrowse === 'function') onBrowse();
            }}
            aria-label="Browse help or documentation"
          >
            Browse help
          </SecondaryButton>
        </Actions>
      </Card>
    </Wrapper>
  );
}

EmptyState.propTypes = {
  canCreate: PropTypes.bool,
  onCreateClick: PropTypes.func,
  onBrowse: PropTypes.func
};

EmptyState.defaultProps = {
  canCreate: false,
  onCreateClick: null,
  onBrowse: null
};
