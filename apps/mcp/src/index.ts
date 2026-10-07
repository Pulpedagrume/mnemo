import { APP_SLUG } from '@mnemo/core';

/** MCP tool names exposed in phase 4. */
export const MCP_TOOLS = [
  `${APP_SLUG}_get_schema`,
  `${APP_SLUG}_get_prompt`,
  `${APP_SLUG}_validate_import`,
  `${APP_SLUG}_import_notes`,
  `${APP_SLUG}_list_decks`,
  `${APP_SLUG}_search_notes`,
  `${APP_SLUG}_due_summary`,
] as const;
