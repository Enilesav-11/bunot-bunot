# Component Guide

**Status:** Component guidance; current components are in `src/components/`. Remaining screen checks are in `TEST_PLAN.md`.

## Shared UI

| Component | Responsibility | Required states/behavior |
|---|---|---|
| `Button` | Primary, secondary, and destructive actions | Hover, pressed, focus, disabled, loading; supports keyboard input |
| `Input`, `Textarea`, `Select` | Labeled form controls | Persistent labels, validation message, visible focus |
| `Dialog` | Confirm destructive or round-start actions | Focus management, Escape handling, labelled title, return focus |
| `Toast` | Brief confirmation or connection notice | Announced accessibly; errors needing action remain inline |
| `EmptyState`, `LoadingState`, `ErrorState` | Consistent non-data and failure feedback | Clear next step; no false success state |

## Product components

| Component | Responsibility | Key behavior |
|---|---|---|
| `EventCard` / `EventHeader` | Event identity and status | Name, date, participant count, round/drawing status |
| `ParticipantList` / `ParticipantRow` | Participant review and editing | Search, stable participant identity, accessible row actions |
| `DrawingStage` | One-at-a-time draw control and status | Pending lock, remaining count, connection/error handling |
| `DrawingReveal` | Present confirmed result | Receives saved server result; reduced-motion alternative |
| `DrawHistory` | Round results and export/print actions | Order, participant, timestamp; no silent history deletion |

## Composition rules

- Keep server-owned decisions in the feature/backend layer; visual components receive confirmed state and callbacks.
- Use the same form controls and status patterns in organizer and event screens.
- Party mode reuses `DrawingStage` and `DrawingReveal` with a presentation layout, not a second drawing implementation.
- Do not add a component until at least two uses or a clear accessibility/behavior boundary justifies it.
