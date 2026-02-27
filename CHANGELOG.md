# [2.0.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.4.0...v2.0.0) (2026-02-27)


* feat!: complete Phase 1 cleanup for v2.0.0 public release ([daa8909](https://github.com/w-10-m/constructionwire-mcp/commit/daa89092250b6c16c6cf21d8526578e5c9677a59))


### Bug Fixes

* add descriptions to 6 undocumented tool definitions (W10-91) ([2d22e0b](https://github.com/w-10-m/constructionwire-mcp/commit/2d22e0be6ffdd3d897d0e872b6fe4c28af4ad152))


### BREAKING CHANGES

* Environment variables renamed from cONSTRUCTIONWIRE_* to CONSTRUCTIONWIRE_*

- Remove 75 DEBUG comments from client (W10-134)
- Fix HTML entities in README tool descriptions (W10-139)
- Fill in 6 blank tool descriptions in README
- Replace COMING SOON with credential setup instructions (W10-138)
- Add coverage/ and sales docs to .gitignore for public repo (W10-141)
- Update CHANGELOG with v2.0.0 entry (W10-140)
- Add MIT LICENSE file (W10-137)

# [2.0.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.4.0...v2.0.0) (2026-02-26)


### ⚠ BREAKING CHANGES

* Environment variables renamed from `CONSTRUCTIONWIRE_*` (fixing casing inconsistency)

### Bug Fixes

* fix `cONSTRUCTIONWIRE*` environment variable naming ([W10-131](https://linear.app/w10ltd/issue/W10-131))
* fix config validation mismatch — EMAIL vs USERNAME ([W10-132](https://linear.app/w10ltd/issue/W10-132))
* fix base URL inconsistency ([W10-133](https://linear.app/w10ltd/issue/W10-133))
* remove 75 DEBUG comments from client ([W10-134](https://linear.app/w10ltd/issue/W10-134))
* remove SaaS template boilerplate from client ([W10-135](https://linear.app/w10ltd/issue/W10-135))
* update author from Coretext AI to West10 ([W10-136](https://linear.app/w10ltd/issue/W10-136))
* fix HTML entities in README tool descriptions ([W10-139](https://linear.app/w10ltd/issue/W10-139))
* replace COMING SOON with credential setup instructions ([W10-138](https://linear.app/w10ltd/issue/W10-138))
* add descriptions to 6 undocumented tool definitions ([W10-91](https://linear.app/w10ltd/issue/W10-91))

### Features

* add MIT LICENSE file ([W10-137](https://linear.app/w10ltd/issue/W10-137))
* add E2E test infrastructure
* improve test coverage to 93%+

# [1.4.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.3.0...v1.4.0) (2025-12-25)


### Features

* add E2E test infrastructure ([a5e264e](https://github.com/w-10-m/constructionwire-mcp/commit/a5e264e8a51a712e0216aadd9ebd8fdd52c9c0cb))
* improve test coverage to 93%+ ([81cea7b](https://github.com/w-10-m/constructionwire-mcp/commit/81cea7b8e5dd3d6e5f075bd7df88603e5a32de4e))

# [1.3.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.2.0...v1.3.0) (2025-12-24)


### Features

* add unit tests with 86.95% coverage ([e29ac7e](https://github.com/w-10-m/constructionwire-mcp/commit/e29ac7ee6d944ab654f849ec886a657eae132fc2))

# [1.2.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.6...v1.2.0) (2025-12-24)


### Features

* add unit tests with coverage reporting ([9fbbf6c](https://github.com/w-10-m/constructionwire-mcp/commit/9fbbf6c77f5a3659312fe9cd23e66b3823b31187))

## [1.1.6](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.5...v1.1.6) (2025-12-23)


### Bug Fixes

* update README with correct package information ([13c63fa](https://github.com/w-10-m/constructionwire-mcp/commit/13c63fab14b0619bd6b2112ef4401aa63984f2e7))

## [1.1.5](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.4...v1.1.5) (2025-12-17)


### Bug Fixes

* update package name in README to @west10tech/constructionwire-mcp ([620845a](https://github.com/w-10-m/constructionwire-mcp/commit/620845acb1f03eeb37cde31bf6fd008f148dfea6))

## [1.1.4](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.3...v1.1.4) (2025-12-17)


### Bug Fixes

* upgrade npm for OIDC support ([dd6b1ff](https://github.com/w-10-m/constructionwire-mcp/commit/dd6b1ff9767ddab6f75368ac60418b39c7286dfe))

## [1.1.3](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.2...v1.1.3) (2025-12-17)


### Bug Fixes

* add contents read permission to publish job ([88569fb](https://github.com/w-10-m/constructionwire-mcp/commit/88569fbbdda735475a85e574307c7c0b731874b9))

## [1.1.2](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.1...v1.1.2) (2025-12-17)


### Bug Fixes

* use semantic-release-action for proper outputs ([ce7c959](https://github.com/w-10-m/constructionwire-mcp/commit/ce7c959fe96959960e3bccd766a885d593978d93))

## [1.1.1](https://github.com/w-10-m/constructionwire-mcp/compare/v1.1.0...v1.1.1) (2025-12-17)


### Bug Fixes

* enable OIDC trusted publishing ([3b53e07](https://github.com/w-10-m/constructionwire-mcp/commit/3b53e07b1d5413b28cc41cc32a92cea6fa215067))
* use OIDC for npm publish, semantic-release for versioning ([5c8e54f](https://github.com/w-10-m/constructionwire-mcp/commit/5c8e54f5589027f71832c4c81629457908b9274f))

# [1.1.0](https://github.com/w-10-m/constructionwire-mcp/compare/v1.0.0...v1.1.0) (2025-12-17)


### Features

* initial release with trusted publishing ([20abfd3](https://github.com/w-10-m/constructionwire-mcp/commit/20abfd326375ae0e93cc87ada569c2da33d4b8c3))

# 1.0.0 (2025-12-17)


### Bug Fixes

* replace non-existent OAuth client with Basic auth ([fe86d18](https://github.com/w-10-m/constructionwire-mcp/commit/fe86d186d911364c51785edb73819e2e9a8e5a9e))
* update npm scope to [@west10tech](https://github.com/west10tech) ([b7d901f](https://github.com/w-10-m/constructionwire-mcp/commit/b7d901fd2b711dce909dbc55bfd76013bed9fb28))


### Features

* add automated npm publishing with semantic-release ([a598cb2](https://github.com/w-10-m/constructionwire-mcp/commit/a598cb2a8ee701e6b089f323fa2202ed588562be))
* Initial constructionwire-mcp MCP server ([6e96a95](https://github.com/w-10-m/constructionwire-mcp/commit/6e96a95433cd065fd0f143cf4919fc6ac37693cf))
