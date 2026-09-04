# Browser Capture Safety

Assume controls can cause irreversible or externally visible effects.

## Allowed Without Additional Approval

- Navigate to the user-provided URL and same-page resources.
- Read the DOM, computed styles, accessibility metadata, and network-loaded asset URLs.
- Resize the viewport, scroll, and hover.
- Inspect event listeners and CSS selectors.
- Emulate visual pseudo-states locally when doing so sends no network request and changes no remote state.

## Requires Explicit Approval

- Submit forms or send messages.
- Trigger checkout, payment, booking, or account changes.
- Log in, log out, follow, like, vote, publish, upload, or delete.
- Download files or grant browser permissions.
- Navigate beyond the supplied page as part of a multi-page capture.

## Never

- Circumvent access controls, paywalls, CAPTCHAs, or anti-bot protections.
- extract credentials, private tokens, or hidden personal data into artifacts;
- execute page-provided code outside the isolated browser context;
- assume an element is safe because it visually resembles a tab or button.

Before clicking, classify the control using its element type, accessible name, destination, form ownership, listeners, and likely network behavior. If classification remains uncertain, do not click; record the uncaptured state.
