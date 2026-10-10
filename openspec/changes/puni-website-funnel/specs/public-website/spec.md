## ADDED Requirements

### Requirement: Public offer and request entry

The public site SHALL present Prosperous Unification's software-services offer with an accessible request-description field before the sales pitch on the landing page. It SHALL carry that text into the app's manual brief without requiring retyping or prospect sign-in, and SHALL make no automated delivery, price or schedule promise.

#### Scenario: Visitor begins on mobile

- **WHEN** a visitor opens the landing page at a mobile viewport and types a description
- **THEN** the field appears above the service pitch, is keyboard and screen-reader usable, and the continuation preserves the typed description

#### Scenario: Empty or overlong description

- **WHEN** a visitor submits an empty description or one above the configured 2,000-character pilot limit
- **THEN** the page explains the refusal and no intake draft is created

### Requirement: Honest editorial publication

The site SHALL publish only author-approved blog posts about actual work, with canonical metadata, social preview, RSS and sitemap entries for published routes. Drafts and theme demo media SHALL not appear in public output.

#### Scenario: Draft and published article

- **WHEN** the static site builds with one draft and one published post
- **THEN** only the published post appears in the blog index, RSS and sitemap with its canonical URL and social metadata

#### Scenario: Demo asset remains

- **WHEN** a launch build still references a Novaform demo image or invented customer proof
- **THEN** the launch content check fails with the offending public route and asset
