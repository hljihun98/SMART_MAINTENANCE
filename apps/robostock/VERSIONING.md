# Versioning Policy

ROBOSTOCK follows Semantic Versioning.

Version format:

`vMAJOR.MINOR.PATCH`

Examples:

- `v0.1.0`
- `v1.0.0`
- `v1.2.3`

## Rules

- `PATCH`: bug fixes, typo fixes, small UI adjustments, internal cleanup
- `MINOR`: backward-compatible feature additions
- `MAJOR`: breaking changes to usage, configuration, data format, or integrations

## Recommended Release Flow

- Use `0.x.y` during early development
- Release the first stable version as `v1.0.0`
- Include the `v` prefix in release tags
- Use prerelease suffixes when needed:
  - `v1.2.0-beta`
  - `v1.2.0-rc.1`

## Example Progression

- `v0.1.0`: initial feature set
- `v0.1.1`: bug fix
- `v0.2.0`: feature expansion
- `v1.0.0`: first stable release
- `v1.1.0`: backward-compatible new feature
- `v1.1.1`: hotfix
- `v2.0.0`: breaking change
