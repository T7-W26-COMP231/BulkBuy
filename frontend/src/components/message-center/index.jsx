// src/components/MessageTree/index.js
import MessageTree from "./MessageTree";
import theme, { containerStyles } from "./MessageTree.styles";
import * as components from "./index.components";
import useMessages from "./useMessages";
import * as permissions from "./permissions";

/**
 * index.js
 *
 * Single entry point for the MessageTree component package.
 * Exports:
 *  - default: MessageTree (main component)
 *  - named: theme, containerStyles, useMessages, permissions, and child components for advanced usage
 *
 * Usage:
 *  import MessageTree from '.../MessageTree';
 *  import { theme, useMessages } from '.../MessageTree';
 */

/* Re-export child components for advanced composition/testing */
export const {
  RowCard,
  MessageDetail,
  ReplyCard,
  MessageForm,
  SearchFilterBar,
  EmptyState,
} = components;

/* Named exports */
export { theme, containerStyles, useMessages, permissions };

/* Default export */
export default MessageTree;
