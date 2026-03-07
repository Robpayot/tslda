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

## After TSL, shader, or material changes:

- Run `npm run dev`, open the app in the browser, and check the console for errors.
- Do not consider the task complete until the dev server runs and the console shows no errors.


## This rule helps generate documentation:

## Help draft documentation by:

- Extracting code comments
- Analyzing README.md
- Generating markdown documentation

# TSL conversion
- **IMPORTANT**: Always read and follow @.cursor/skills/tsl/SKILL.md BEFORE any TSL/shader conversion
- Always comment anything related to RenderTarget for now, if it's mentioned in the shader
- Always pass textures directly to `texture()` — do NOT wrap them in `uniform()`
- For runtime texture changes: replace the material with a new one created with the new texture; do not use `uMap`/`uMask` texture uniforms
- After changes: run `npm run dev` and verify no errors in the browser console
