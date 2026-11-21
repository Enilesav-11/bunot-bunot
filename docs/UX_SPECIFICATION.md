# UX Specification

**Status:** account-free UI is implemented locally; responsive and recovery browser checks remain.

## User modes

- **Visitor:** public landing page; can start instantly.
- **Session owner:** manages a single bunutan using its protected browser capability.
- **Party audience:** opens a separate public, read-only display link.

## Primary journey

1. Select **Start a Bunutan**; create a session immediately without asking for identity.
2. Land on its roster screen; enter an event name and optional description.
3. Add names by typing, paste, or CSV; review counts and duplicates.
4. Start a round, draw until complete, and show each persisted result.
5. Share the public display link with the audience; keep management capability private.
6. Review/export results or start another round without replacing earlier history.

## Screen behavior

- **Landing:** Paskong Pinoy parol identity, brief explanation, one prominent start action, and a clear How It Works link. No sign-in CTA.
- **Session roster:** event name/settings, roster count, individual and bulk entry, search, duplicate feedback, start-round action, and recovery/share controls.
- **Drawing stage:** large confirmed reveal, remaining count, pending/error/completed states, and one organizer draw control. Never show a name before commit.
- **Public presentation:** event name, latest confirmed result, remaining count, and live/status cue only. No roster, settings, management actions, or capability data.
- **Results:** round, order, display name, timestamp, search, CSV export, and print layout.
- **Recovery:** explain that the same browser restores the session; provide a clearly labeled download/recovery-code action and a second-browser restore path.
- **Expiry:** show a clear expiration date and whether the session is read-only, recoverable, or scheduled for deletion.

## Security and usability

- Keep the raw capability in an HttpOnly, Secure-in-production, SameSite cookie; never render or link it.
- Public IDs and management capabilities are separate. Public pages call a read-only projection.
- Keep forms keyboard-operable, labels visible, focus clear, and status updates announced.
- Support phone operation while the audience uses a projector; keep draw action and remaining count in reach.
- Honor reduced motion and avoid relying on color or animation alone.
- Explain invalid recovery, expired sessions, offline state, and save failures in plain language.

## Visual and asset direction

Retain the Filipino Christmas parol identity. The repository has vector parol artwork but no supplied photo files; add approved street/parol photography only after its source and usage rights are confirmed.
