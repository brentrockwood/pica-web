import { message } from "../localization/service";
export default {
  title: message("Find session", "Global session search action and dialog title"),
  close: message("Close search", "Session search dialog close button"),
  query: message("Conversation text", "Session search input label"),
  search: message("Search", "Submit session search"),
  scope: message<{ machine: string }>("Search saved user and assistant text on {machine}, across open projects and their workspaces, including archived sessions.", "Search scope explanation"),
  searching: message("Searching…", "Session search progress"),
  empty: message("No matching sessions.", "Successful empty session search"),
  truncated: message("Results are incomplete: the 50-result limit was reached or oversized transcript entries were skipped.", "Session search limit warning"),
};
