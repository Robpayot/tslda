---
description: "This rule automating development workflows and documentation generation"
alwaysApply: true
---

# Automating development workflows and documentation generation

This rule automates app analysis:

## When asked to analyze the app:

- Run dev server with npm run dev
- Fetch logs from console
- Suggest performance improvements
- Please comment rather than delete old code if possible


## This rule helps generate documentation:

## Help draft documentation by:

- Extracting code comments
- Analyzing README.md
- Generating markdown documentation

# TSL conversion
- **IMPORTANT**: Always read and follow @.cursor/skills/tsl/SKILL.md BEFORE any TSL/shader conversion
- Always comment anything related to RenderTarget for now, if it's mentioned in the shader
- Always pass textures directly to `texture()` — do NOT wrap them in `uniform()`
