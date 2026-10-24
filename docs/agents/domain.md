# Domain docs

How the engineering skills should read this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`context/GLOSSARY.md`**. This repo keeps its glossary in `context/`, not at the repo root. Where a skill says "`GLOSSARY.md` at the repo root", read this file instead.
- There is **no `docs/adr/`** folder. A hard-to-reverse decision is recorded in [docs/prd.md](../prd.md) section 18 and in the ticket that resolved it. Read section 18 before changing anything it covers.

If the glossary is missing a term you need, that is a signal: either you are inventing language the project does not use (reconsider), or there is a real gap (note it for `/domain-modeling`).

## File structure

Single context:

```
/
├── context/GLOSSARY.md
├── docs/prd.md            ← decisions in section 18
├── docs/schema.md
├── docs/screens.md
├── docs/notifications.md
└── apps/, packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a test name, a refactor proposal), use the term as the glossary defines it. Do not drift to synonyms it avoids (for example "user" instead of "member").

## Flag decision conflicts

If your output contradicts a decision in PRD section 18, say so explicitly instead of silently overriding it:

> _Contradicts the 20 Oct decision on community counts, but worth reopening because..._
