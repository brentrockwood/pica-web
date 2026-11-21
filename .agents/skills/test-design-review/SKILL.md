---
name: test-design-review
description: Investigate a specific uncertainty about test protection, brittle tests, or a proposed consolidation. Use for focused test-design reviews, not automatically for routine test additions or fixes. No test removal is authorized by loading this skill.
---

# Focused test-design review

Read `../../../docs/testing.md`. Follow `../../../docs/testing-harnesses.md` for mechanics and `../../../docs/development-checks.md` for verification. Resolve paths from this skill directory.

## Scope

State the question to resolve. Examples: whether an assertion detects incorrect output, whether two scenarios protect different transitions, or why a harmless refactor breaks tests. Test volume alone does not establish a problem. Do not target fewer tests, demand novel coverage from every test, or assume human-sized suites are optimal.

## Investigation

1. Inspect the production contract and relevant tests, including inputs, object lifetimes, operation order, mocks, helpers, and assertions. Follow producers or consumers when the local function does not define the contract. Titles are not evidence.
2. Use existing source search first. Syntax queries may extract enclosing tests and assertions, but aliases, helpers, and shadowed names require inspection. Treat unresolved relationships as unknown. Use per-test coverage only when observed execution would answer the question; follow `../../../docs/test-coverage-tool.md` and its environment/exclusion limits.
3. Identify the protection supplied by each scenario. Equal execution footprints, similar syntax, and larger assertion counts do not prove equivalence. Check whether inputs and assertions distinguish a plausible wrong implementation. Do not replace focused scenarios with a large combined scenario merely to reduce count.
4. When fault detection is consequential and uncertain, consider a bounded fault experiment in isolated state. For regressions, demonstrate fail-before/pass-after when practical. Confirm intended assertion failures, not setup failures. One detected bug or mutant does not establish complete protection or equivalent suites.
5. Recommend reuse, extension, addition, retention, or an authorized simplification based on the evidence. Preserve useful protection. Report unresolved risks and the exact checks performed; no universal quality or cost claim follows from a bounded experiment.

## Boundaries

Respect task authorization for removal, remote execution, installs, and service operations. Loading this skill grants none of those permissions. Do not add a collector, persistent index, mandatory reviewer, or mutation gate. Do not widen the investigation without a concrete question. No separate report file is required unless requested; normal verification requirements remain in force.
