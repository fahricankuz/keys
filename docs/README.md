# Documentation index

**New here (agent or person)? Read [HANDOVER.md](HANDOVER.md) first:** the current state, what is in flight, and what must not be forgotten.

Then [../AGENTS.md](../AGENTS.md): it is the single guide for every AI agent (product, repo map, tests, hard rules, release flow, approval matrix, reporting).
Claude Code also imports it from [../CLAUDE.md](../CLAUDE.md), which keeps the owners' Turkish rules.

> **Türkçe not (depo sahipleri için):** Yapay zekâ ile nasıl güvenli çalışacağınızı, neyi onaylamanız gerektiğini ve bir şey bozulursa ne yapacağınızı
> [ai-ile-calisma.md](ai-ile-calisma.md) anlatır (Türkçe). Diğer eski belgelerin çoğu da Türkçedir; yeni ajan belgeleri İngilizcedir.

Language column: **EN** = English (agent-facing), **TR** = Turkish (owner-facing or older docs).

## Agents and operations (start here)

| Document | Lang | What it covers |
|---|---|---|
| [HANDOVER.md](HANDOVER.md) | EN | **Start here.** Living handover: current state, in-flight release, critical open items (SEO, security, store), traps, ownership |
| [../AGENTS.md](../AGENTS.md) | EN | Rules and workflow for all agents; approval matrix; how to report |
| [infrastructure.md](infrastructure.md) | EN | Every service, account owner, id, plan, secret **names** and where they live, cron jobs, webhooks, monitoring, open items |
| [release-and-ota.md](release-and-ota.md) | EN | Runbooks: web deploy, Edge Functions, migrations, secret rotation, EAS builds, TestFlight/Play, store review, OTA, version bumps, rollback, Sentry checks |
| [coding-guidelines.md](coding-guidelines.md) | EN | How code is written here: boundaries, platform files, i18n, logging, tests, definition of done |
| [security-guidelines.md](security-guidelines.md) | EN | Secure-development rules, audit findings of 2026-11-13, review checklist, incident runbook, open risks |
| [seo-geo.md](seo-geo.md) | EN | SEO and GEO guide for anahtar.io |
| [ai-ile-calisma.md](ai-ile-calisma.md) | TR | For non-technical owners: asking an agent safely, what needs approval, what never to paste, reviewing a PR, what to do when something breaks, glossary |
| [diary/2026-11-13.md](diary/2026-11-13.md) | EN | Work diary of the launch-hardening day: timeline, decisions, lessons, open items |

## Release, database and operations

| Document | Lang | What it covers |
|---|---|---|
| [migrations.md](migrations.md) | TR | Writing and applying migrations (staging plan, apply, production plan, apply), post-apply checks, common errors |
| [canliya-alma.md](canliya-alma.md) | TR | Go-live checklist and the nine-step release order for the security and store release |
| [../specs/production-release.md](../specs/production-release.md) | EN | Spec and decisions D1 to D19 of the production release (interview of 2026-11-13) |
| [../specs/followup-migrations/README.md](../specs/followup-migrations/README.md) | TR | Two migrations that wait until the new site has been live 24 hours, and how to move them |
| [hostinger.md](hostinger.md) | TR | Hosting setup, the `site` branch, troubleshooting |
| [kurulum.md](kurulum.md) | TR | Setup with real accounts (Supabase, push, subscription, site, admin panel) |
| [guvenlik.md](guvenlik.md) | TR | Security controls in code, database and pipeline; domain protection; Supabase auth settings |
| [loglar.md](loglar.md) | TR | Where logs live (tables, Supabase, Sentry), redaction rules, retention |
| [eposta.md](eposta.md) | TR | E-mail system: notification pipeline, queue, lead mail, deliverability |

## Product, mobile and stores

| Document | Lang | What it covers |
|---|---|---|
| [mobil.md](mobil.md) | TR | iOS and Android app from the same code, EAS flow, what differs on phones |
| [magaza.md](magaza.md) | TR | App Store and Google Play: profiles, review accounts, store rules, privacy answers, listing, push, universal links |
| [abonelik.md](abonelik.md) | TR | Subscription model, 36 App Store products and Play plans, RevenueCat, server rules, payments switch |
| [tek-giris.md](tek-giris.md) | TR | One login and several roles in one account |
| [kurumsal-yol-plani.md](kurumsal-yol-plani.md) | TR | Building/portfolio (site, shopping centre, REIT, warehouse) roadmap |
| [marka-kimligi.md](marka-kimligi.md) | TR | Brand identity: logo, colour, typography, motion |
| [yol-haritasi.md](yol-haritasi.md) | TR | Go-live roadmap and technical debt |

## Testing

| Document | Lang | What it covers |
|---|---|---|
| [test.md](test.md) | TR | Test types, gaps, release gate |
| [kullanici-senaryolari.md](kullanici-senaryolari.md) | TR | User scenarios run by the test suite |
| [gercek-cihaz-kontrol.md](gercek-cihaz-kontrol.md) | TR | Ten-minute real-device checklist |

## Conventions

- New agent-facing documents are written in English; owner-facing documents stay Turkish. Code identifiers, commands and product names are never translated.
- A document never contains a secret value, a customer e-mail or phone, or a personal e-mail address. The repo is public.
- If a document and the code or the live system disagree, the code and the live state win; fix the document in the same PR.
- Work diaries live in `diary/` (one file per significant day, named by date).
