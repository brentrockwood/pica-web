This is the Rockwood Lab fork of Pi-Web. I want to make some experimental changes from the original pi-web.

- Allow subsessions/fork sessions to be collapsed in the session pane.
- Allow the projects/workspaces/sessions panes to be resized vertically.
- Some way to view work by active/waiting/last used.

- vim style message editing

- Advanced rendering for things like diagrams, math, images, etc. The model should be informed of these capabilities.
  - Update the bundled Mermaid plugin (`pi-web-plugins/mermaid/`):
    - Match the active PI WEB theme, including the diagram background, text, nodes, and edges; update when the theme changes.
    - Render diagrams by default, keeping Raw and source copying available. Preserve readable source when rendering fails.
    - Provide model instructions explaining that Mermaid is supported and diagrams should use fenced `mermaid` blocks. Use a companion Pi extension or project instructions rather than changing core PI WEB if practical.
    - Rendering reflects the current interface, not a guarantee attached to the saved session. Raw Mermaid in another interface or with the plugin disabled is an accepted tradeoff; no renderer-version tracking is needed.
