# Security Policy

## Supported versions

Security fixes are provided for the latest published stable release. Pre-release builds, old releases and locally modified builds are not guaranteed to receive fixes.

## Reporting a vulnerability

Do not disclose a suspected vulnerability, credential or reproduction case in a public issue.

Use the repository's **Security → Report a vulnerability** flow to open a private GitHub security advisory. If private vulnerability reporting is not enabled, contact the repository owner through the owner's GitHub profile and ask for a private reporting channel without including exploit details in the initial public message.

Include, where possible:

- affected Orbital Vision version and operating system;
- impact and prerequisites;
- minimal reproduction steps;
- relevant sanitized logs;
- whether the issue exposes a credential, local file, updater path or provider boundary; and
- a safe way to contact the reporter.

Reports will be acknowledged as soon as practical. Triage, remediation and disclosure timing depend on severity and the affected dependency or provider.

## Sensitive material

Never submit any of the following in an issue, pull request, screenshot or diagnostic archive:

- NASA or translation-provider API keys;
- the Tauri updater private signing key;
- Apple notarization credentials;
- Windows code-signing certificates or passwords;
- operating-system credential-store contents; or
- GitHub access tokens.

The updater public key in `release/updater-public-key.txt` is intentionally public. Its matching private key must remain outside the repository and be limited to the release workflow.

## Security model

- External provider requests execute in Rust behind typed Tauri commands.
- Provider responses are bounded and untrusted fields are normalized before they reach the UI.
- Credentials are resolved natively and their values are not returned over IPC.
- External navigation permits normalized public HTTPS destinations through a native command.
- Arbitrary remote image hosts are not permitted by the application CSP; supported remote media is validated and cached natively.
- Automatic updates are accepted only after Tauri updater signature verification.

This policy does not turn provider data into trusted operational telemetry. Data provenance, freshness and scientific limitations remain part of the product's safety boundary.
